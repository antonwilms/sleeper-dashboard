import { useMemo } from 'react'
import { DefinitionPopover } from './DefinitionPopover'
import { DegradedBlock } from './DegradedBlock'
import { FrozenScroll } from './FrozenScroll'
import { FROZEN_FIRST, FROZEN_EDGE, FROZEN_POPOVER_LIFT } from './frozen'
import { buildTeamShareTotals, buildPerSeasonTeamShares } from '../../utils/outlookPositionStats'
import { buildUsageHistory, buildRoleCohort, classifyRole } from '../../utils/outlookUsage'
import { buildUsageGrid, ROW_MIN_VOLUME } from '../../utils/usageEfficiency'
import { METRIC_BY_ID } from '../../utils/marketMetrics'
import { scaleCss, scaleInk, SCALE_STOPS } from '../../utils/percentileColour'

// The pop-up's `§usage` body: a season grid (metric rows × the player's axis seasons, plus the live season
// when `liveUsable`) with the player's league rank at his position under each value and the cell coloured by
// percentile. Values, ranks and percentiles come from usageEfficiency.buildUsageGrid; this component only
// renders them. The role chip still runs the existing classifier over outlookUsage / outlookPositionStats.
// Props only, never a spread. `playerRows` is the cohort the role label bands against.
function lastNonNull(history) {
  if (!history || history.length === 0) return null
  let snapPct = null, share = null, snapSeason = null, shareSeason = null
  for (let i = history.length - 1; i >= 0; i--) {
    if (snapPct === null && history[i].snapPct != null) { snapPct = history[i].snapPct; snapSeason = history[i].season }
    if (share === null && history[i].share != null) { share = history[i].share; shareSeason = history[i].season }
    if (snapPct !== null && share !== null) break
  }
  return { snapPct, share, snapSeason, shareSeason }
}

const ROLE_GLOSS = "From the latest season's opportunity share (and snap share for the top band) over all his team's games, banded against every player at this position in the league's player list."
const pct = v => `${(v * 100).toFixed(1)}%`

// The numbers the chip banded on. `cutoffs` is buildRoleCohort(...)[position].
function roleNumbers(position, latest, cutoffs) {
  const { share, snapPct, shareSeason, snapSeason } = latest
  const [c33, c67] = cutoffs.share
  const s67 = cutoffs.snap?.[1] ?? null
  const shareLabel = position === 'RB' ? 'carry share' : 'target share'
  const everyDownLabel = position === 'RB' ? 'Every-down back' : 'Every-down'
  const snap = snapPct == null ? ''
    : snapSeason === shareSeason ? `, snap share ${pct(snapPct)}` : `, ${snapSeason} snap share ${pct(snapPct)}`
  const top = s67 == null ? '' : `; ${everyDownLabel} also needs snap share ≥ ${pct(s67)}`
  return `${shareSeason}: ${shareLabel} ${pct(share)}${snap} (season-team basis). Bands: bottom third < ${pct(c33)}, top third ≥ ${pct(c67)}${top}.`
}

// The shadow paints over the table's cell spacing, so scrolled columns never show between frozen cells.
const SPACING_COVER = 'shadow-[0_4px_0_0_var(--color-dp-card),0_-4px_0_0_var(--color-dp-card),-4px_0_0_0_var(--color-dp-card)]'
const LABEL_CELL = `${FROZEN_FIRST} ${FROZEN_EDGE} ${FROZEN_POPOVER_LIFT} ${SPACING_COVER} bg-dp-card w-[112px] min-w-[112px] text-left pr-2`

function GridCell({ position, metric, column, cell }) {
  const common = { 'data-testid': 'usage-cell', 'data-metric': metric.id, 'data-season': cell.season }
  if (cell.value == null) {
    // PROVISIONAL(no-data): void cell — no finite value for this season · untracked key, no weekly coverage, or no live row · the key tracked / weeklyStats served for that season
    return <td {...common} data-void="true" className="border-b border-dashed border-dp-border" />
  }
  const marker = !cell.qualified ? `<${column.minGp} g` : cell.lowVolume ? 'low vol' : null
  const coloured = cell.percentile != null && metric.direction !== 'neutral'
  return (
    <td
      {...common}
      data-unqualified={cell.qualified ? undefined : 'true'}
      data-low-volume={cell.lowVolume ? 'true' : undefined}
      className={`px-1.5 py-1.5 text-center align-top whitespace-nowrap ${coloured ? '' : 'bg-dp-chip'}`}
      style={coloured ? { backgroundColor: scaleCss(cell.percentile), color: scaleInk(cell.percentile) } : undefined}
    >
      <div className={`font-dp-mono text-xs ${coloured ? '' : 'text-dp-text'}`}>{metric.meta.format(cell.value)}</div>
      {cell.rank != null && (
        <div className={`font-dp-mono text-[10.5px] ${coloured ? '' : 'text-dp-muted'}`}>
          {`${position}${cell.rank} of ${cell.of}`}
        </div>
      )}
      {marker && <div className="font-dp-mono text-[10.5px] text-dp-muted">{marker}</div>}
    </td>
  )
}

function Legend({ position, liveColumn, liveSeasonComplete }) {
  const perGame = METRIC_BY_ID[ROW_MIN_VOLUME.cmpPct].minVolume.perGame
  const stops = SCALE_STOPS.map((_, i) => scaleCss(i / (SCALE_STOPS.length - 1)))
  return (
    <div data-testid="usage-legend" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-dp-muted">
      <span className="flex items-center gap-1.5">
        <span>bottom</span>
        <span aria-hidden="true" className="inline-block h-2 w-20 rounded-sm" style={{ background: `linear-gradient(to right, ${stops.join(', ')})` }} />
        <span>top</span>
      </span>
      <span data-testid="usage-legend-unranked" className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block h-2 w-3 rounded-sm bg-dp-chip border border-dp-border-raised" />
        <span>not ranked</span>
      </span>
      <span>
        {position === 'QB'
          ? `Rank among ${position} in Sleeper's player list with 8+ games and ≥ ${perGame} pass attempts a game that season (league scoring not involved). Not /week's colours, which rank league starters.`
          : `Rank among all ${position} in Sleeper's player list with 8+ games that season and a value for that stat (league scoring not involved). Not /week's colours, which rank league starters.`}
      </span>
      {liveColumn && (
        <span>{liveSeasonComplete
          ? `${liveColumn.season}: ${liveColumn.minGp}+ games.`
          : `${liveColumn.season} so far: ${liveColumn.minGp}+ games (8 of 17, pro-rated to ${liveColumn.teamGames} team games played).`}</span>
      )}
      {(position === 'WR' || position === 'TE') && <span>Avg depth: ranked, but grey — a style, not better or worse.</span>}
      {position === 'QB' && <span>{`Sack rate: lower is better (rank 1 = lowest). Below ${perGame} pass attempts a game: low vol, unranked.`}</span>}
    </div>
  )
}

export function UsageEfficiencySection({
  careerStats, playersMap, playerId, position, axisSeasons, playerRows, gameLogsByYear,
  currentSeasonTotals, liveUsable, liveLabel, liveSeasonComplete,
}) {
  // Accepted cost (§2.1): with no App.jsx change, this computes the whole-corpus share
  // denominators itself, per pop-up open; hoisting to App.jsx was considered and not done.
  const teamShareTotals = useMemo(
    () => buildTeamShareTotals(careerStats ?? {}, playersMap ?? {}),
    [careerStats, playersMap]
  )
  const perSeasonTeamShares = useMemo(
    () => buildPerSeasonTeamShares(careerStats ?? {}, teamShareTotals, playersMap ?? {}),
    [careerStats, teamShareTotals, playersMap]
  )
  // Snap share is buildUsageHistory's existing snapPct (off_snp ÷ tm_off_snp), sourced from the
  // view-only perSeasonTeamShares computed above (§3.1). Read by the role chip only.
  const usageHistory = useMemo(
    () => buildUsageHistory(playerId, position, careerStats, perSeasonTeamShares),
    [playerId, position, careerStats, perSeasonTeamShares]
  )
  // Role label (cohort tertiles over every RB/WR/TE row) — moved from Market's retired Outlook set
  // (market-model-view.md §7.2). A whole-league pass per open, memoised; same cost class as the shares above.
  const role = useMemo(() => {
    if (!['RB', 'WR', 'TE'].includes(position)) return null
    const usageByPlayer = new Map()
    for (const r of (playerRows ?? [])) {
      if (['RB', 'WR', 'TE'].includes(r.position)) {
        usageByPlayer.set(r.player_id, buildUsageHistory(r.player_id, r.position, careerStats, perSeasonTeamShares))
      }
    }
    const latest = lastNonNull(usageHistory)
    const cohort = buildRoleCohort(playerRows ?? [], usageByPlayer)
    const label = classifyRole({ position, snapPct: latest?.snapPct ?? null, share: latest?.share ?? null }, cohort)
    return label ? { label, gloss: `${ROLE_GLOSS} ${roleNumbers(position, latest, cohort[position])}` } : null
  }, [position, playerRows, careerStats, perSeasonTeamShares, usageHistory])
  // Every hook stays above the early returns below.
  const grid = useMemo(
    () => buildUsageGrid({
      playerId, position, seasons: axisSeasons, careerStats, playerMap: playersMap, gameLogsByYear,
      currentSeasonTotals, liveUsable,
    }),
    [playerId, position, axisSeasons, careerStats, playersMap, gameLogsByYear, currentSeasonTotals, liveUsable]
  )

  if (axisSeasons.length === 0) {
    return (
      <DegradedBlock kind="not-yet-accruing">
        No qualifying seasons yet for usage &amp; efficiency.
      </DegradedBlock>
    )
  }

  if (grid.rows.length === 0) {
    return (
      <DegradedBlock kind="never-available">
        No usage metrics are defined for this position.
      </DegradedBlock>
    )
  }

  const liveColumn = grid.columns.find(c => c.kind === 'live') ?? null
  const showPreCliffNote = grid.rows.some(r => r.id === 'snapShare') && grid.columns.some(c => c.season < 2020)

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="shrink-0 whitespace-nowrap text-[10px] font-dp-mono tracking-[0.08em] text-dp-muted-2 border border-dp-border-raised rounded px-1.5 py-0.5">
          DISPLAY ONLY
        </span>
        <span className="flex-1 basis-[240px] min-w-0 text-[11px] text-dp-muted">
          Never feeds projection or dynasty score. Shares are his share of his team&apos;s weekly totals in the games he played — each week credited to the team he played for where that season&apos;s game logs are loaded, otherwise to his season team.
        </span>
        {/* The chip sits at the card's right edge, so its popover opens leftwards. */}
        {role && (
          <div className="shrink-0 ml-auto [&_[role=dialog]]:right-0">
            <DefinitionPopover term="Role" gloss={role.gloss}>
              <span data-testid="usage-role" className="whitespace-nowrap text-xs px-1.5 py-0.5 rounded bg-dp-chip text-dp-text-2">{role.label}</span>
            </DefinitionPopover>
          </div>
        )}
      </div>
      <FrozenScroll>
        {/* Row definitions open position:fixed (DefinitionPopover strategy), so the clipping scroll container never grows. */}
        <table data-testid="usage-grid" className="w-full border-separate border-spacing-x-0.5 border-spacing-y-1">
          <thead>
            <tr>
              <th aria-label="Metric" className={LABEL_CELL} />
              {grid.columns.map(c => (
                <th key={c.season} data-season={c.season} data-kind={c.kind} className="min-w-[84px] font-dp-mono text-[10.5px] font-normal text-dp-muted text-center whitespace-nowrap">
                  {c.kind === 'live' ? liveLabel : c.season}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.rows.map(row => (
              <tr key={row.id}>
                <th scope="row" className={`${LABEL_CELL} font-normal`}>
                  <DefinitionPopover
                    term={row.meta.label}
                    gloss={row.direction === 'down' ? `${row.meta.note} Lower is better.` : row.meta.note}
                    field={row.meta.field}
                    strategy="fixed"
                  >
                    <span className="text-xs text-dp-text-2 w-[104px] inline-block truncate text-left">{row.meta.label}</span>
                  </DefinitionPopover>
                </th>
                {row.cells.map((cell, i) => (
                  <GridCell key={cell.season} position={position} metric={row} column={grid.columns[i]} cell={cell} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </FrozenScroll>
      {showPreCliffNote && (
        <div className="mt-1">
          <span className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-text-5">NOT MEASURED THEN</span>
          <span className="text-[11px] text-dp-muted ml-1.5">
            off_snp is not tracked before 2020 — earlier seasons render as void slots.
          </span>
        </div>
      )}
      <Legend position={position} liveColumn={liveColumn} liveSeasonComplete={liveSeasonComplete} />
    </div>
  )
}
