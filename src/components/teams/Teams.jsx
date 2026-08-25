import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlayersTable } from '../../hooks/usePlayersTable'
import { SortTh } from '../dp/cells'
import { SeriesBars } from '../dp/SeriesBars'
import { DegradedBlock } from '../dp/DegradedBlock'
import { DefinitionPopover } from '../dp/DefinitionPopover'
import { compareNullsLast } from '../../utils/sortUtils'
import { buildTeamMetricsTable, deriveDataSeason } from '../../utils/environment'
import { buildExposure, exposureForTeam } from '../../utils/teamExposure'
import { buildFpaTable, rankFpaTable, PRIOR_WEIGHT_GAMES } from '../../utils/opponentStrength'
import { getManifestEntry } from '../../api/dataStore'

// Teams (dp-v2 Slice 6a) — the 32-team index. Zero new fetching: reads teamContextByYear[dataSeason],
// already loaded since Slice 2 (widened to five seasons by 4c), plus playerRows for the exposure
// column.
//
// The 32 rows are driven by teamContextForSeason.teams' own keys — NOT marketFilters.NFL_TEAMS
// (which carries the Sleeper domain, LAR) — so the join is domain-consistent by construction.
//
// Rows became clickable in dp-v2 Slice 6b, which added `/teams/:abbr` team detail — the explicit
// deferral 6a left off. Navigation is via `useNavigate()` (dp-v2 Slice 7 §8 — a carry-over fix:
// 6b originally used a plain `window.location.hash` write specifically to avoid wrapping
// Teams.test.jsx's renders in a Router, but that has it backwards — tests should follow
// production shape, not set it — and a raw hash write is invisible to the router, so a future
// route guard or navigation instrumentation would not see it. `Teams.test.jsx`'s 14 renders are
// now wrapped in `MemoryRouter` instead). `dp/cells.jsx`'s `ClickableRow` is deliberately NOT
// reused here — it hard-codes `onOpen(row.player_id)`, and a team row has `row.team`, no
// `player_id`.

const DEFAULT_SORT = { column: 'proe', direction: 'desc' }

const COLUMN_META = {
  proe:          { label: 'PROE',          format: v => fmtSignedPct(v),               mode: 'signed' },
  pace:          { label: 'PACE',          format: v => fmtSeconds(v),                 mode: 'scaled' },
  successRate:   { label: 'SUCC%',         format: v => fmtPct(v),                     mode: 'scaled', domain: [0, 1] },
  epaPerPlay:    { label: 'OFF EPA/PL',    format: v => fmtEpa(v),                     mode: 'signed' },
  rzTdRate:      { label: 'RZ TD%',        format: v => fmtPct(v),                     mode: 'scaled', domain: [0, 1] },
  defEpaPerPlay: { label: 'DEF EPA ALL',   format: v => fmtEpa(v),                     mode: 'signed' },
  pointsPerGame: { label: 'PTS/G',         format: v => fmtNum1(v),                    mode: 'scaled' },
  exposureShare: { label: 'YOUR EXPOSURE', format: v => (v != null ? `${(v * 100).toFixed(1)}%` : '—'), mode: 'scaled' },
  fpaQb: { label: 'FPA QB', format: v => fmtFpa(v), mode: 'scaled' },
  fpaRb: { label: 'FPA RB', format: v => fmtFpa(v), mode: 'scaled' },
  fpaWr: { label: 'FPA WR', format: v => fmtFpa(v), mode: 'scaled' },
  fpaTe: { label: 'FPA TE', format: v => fmtFpa(v), mode: 'scaled' },
}

const FPA_COLUMNS = [
  { key: 'fpaQb', pos: 'qb', label: 'FPA QB' },
  { key: 'fpaRb', pos: 'rb', label: 'FPA RB' },
  { key: 'fpaWr', pos: 'wr', label: 'FPA WR' },
  { key: 'fpaTe', pos: 'te', label: 'FPA TE' },
]

const FPA_POSITION_LABEL = { qb: 'QBs', rb: 'RBs', wr: 'WRs', te: 'TEs' }

function fmtPct(v) { return v != null ? `${(v * 100).toFixed(1)}%` : '—' }
function fmtSignedPct(v) { return v != null ? `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%` : '—' }
function fmtSeconds(v) { return v != null ? `${v.toFixed(1)}s` : '—' }
function fmtEpa(v) { return v != null ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : '—' }
function fmtNum1(v) { return v != null ? v.toFixed(1) : '—' }
function fmtFpa(v) { return v != null ? v.toFixed(1) : '—' }

// The popover text names which season(s) are actually in play — until §0's data-repo prerequisite
// ships, currentSeason is always null and this must say so plainly, never imply a running blend.
function fpaPopoverText(pos, rank, n, { priorSeason, currentSeason, nflSeasonLabel }) {
  const label = FPA_POSITION_LABEL[pos]
  const basis = "Half-PPR basis (Sleeper's own scoring, not necessarily this league's)."
  const polarity = 'Lower = tougher defense — good for your own DST, bad for your starter at this position.'
  const rankText = rank != null ? ` Ranks ${rank} of ${n} (1 = toughest).` : ''

  if (currentSeason != null) {
    return {
      gloss: `Fantasy points allowed to ${label} per game — ${currentSeason} weighted by games played, `
        + `shrinking toward ${priorSeason} at a ${PRIOR_WEIGHT_GAMES}-game rate (a judgment call, not `
        + `backtested).${rankText} ${basis} ${polarity}`,
      field: `fan_pts_allow_${pos} ÷ gamesPlayed — ${currentSeason} blended with ${priorSeason}`,
    }
  }
  const notYet = nflSeasonLabel
    ? `The ${nflSeasonLabel} season isn't available yet, so this is ${priorSeason} alone, not a blend.`
    : `Only ${priorSeason} is available.`
  return {
    gloss: `${priorSeason} season fantasy points allowed to ${label} per game. ${notYet}${rankText} ${basis} ${polarity}`,
    field: `fan_pts_allow_${pos} ÷ gamesPlayed — ${priorSeason} season only`,
  }
}

// EPA colour: OFF EPA/PL is positive=good (blue, dp-up); DEF EPA ALL is the INVERSE — negative
// (allowing fewer points) is good — get this backwards and the best defences render as the worst,
// with nothing else on screen looking broken (task file §3.2).
function epaColorClass(v, inverted) {
  if (v == null || v === 0) return 'text-dp-text'
  const positive = v > 0
  const good = inverted ? !positive : positive
  return good ? 'text-dp-up-text' : 'text-dp-down-text'
}

function ExposureCell({ exposure }) {
  // myTeamName null → the whole column is `—` throughout, not hidden (Portfolio's precedent for
  // a null myTeamName is an explicit empty state, not a silently different layout).
  if (exposure == null) return <span className="text-dp-muted text-xs">—</span>
  if (exposure.count === 0) {
    return (
      <div className="leading-tight">
        <div className="text-[13px] text-dp-muted">none</div>
        <div className="text-[11px] text-dp-muted">—</div>
      </div>
    )
  }
  return (
    <div className="leading-tight">
      <div className="font-dp-mono text-[13px] text-dp-text">{exposure.count} player{exposure.count === 1 ? '' : 's'}</div>
      <div className="text-[11px] text-dp-muted">{exposure.share != null ? `${(exposure.share * 100).toFixed(1)}%` : '—'}</div>
    </div>
  )
}

export function Teams({ playerRows = [], loaded = false, careerStats, teamContextByYear, myTeamName = null, nflState = null }) {
  const navigate = useNavigate()
  // Not module-level (as it was pre-Slice-7) — useNavigate() is a hook and can only be called
  // inside the component; goToTeam is a component-scoped callback for exactly that reason.
  const goToTeam = team => navigate(`/teams/${team}`)

  const dataSeason = useMemo(() => deriveDataSeason(careerStats), [careerStats])
  const teamContextForSeason = teamContextByYear?.[dataSeason]

  const { sortState, sortProps } = usePlayersTable({ storageKey: 'teams-sort', defaultSort: DEFAULT_SORT })

  const exposureData = useMemo(() => buildExposure(playerRows, myTeamName), [playerRows, myTeamName])

  // §3 of the task file: "current season" is nflState.season (the live NFL season, a string) ONLY
  // once a season-totals file actually exists for it — checked without a fetch via
  // getManifestEntry, the manifest is memoised so this is cheap. Deliberately NOT dataSeason
  // (the most-recent season WITH DATA, i.e. 2025 today) — these are different derivations on
  // purpose; conflating them would make the current-season term never populate OR populate against
  // a file that does not exist. Until the §0 prerequisite ships this always resolves false, so the
  // blend is the prior season alone — correct behaviour today, not a bug.
  const [currentSeasonAvailable, setCurrentSeasonAvailable] = useState(false)
  const nflSeasonLabel = nflState?.season ?? null
  useEffect(() => {
    if (!nflSeasonLabel) return
    let cancelled = false
    getManifestEntry(`nfl/season-totals/${nflSeasonLabel}.json`).then(entry => {
      if (!cancelled) setCurrentSeasonAvailable(!!entry)
    })
    return () => { cancelled = true }
  }, [nflSeasonLabel])
  const currentSeason = currentSeasonAvailable ? Number(nflSeasonLabel) : null

  // One pass over the DEF rows per season (opponentStrength.js) — independent of teamContext, so
  // this is computed and available even before/without a resolved teamContextForSeason.
  const fpaTable = useMemo(
    () => buildFpaTable(careerStats, { priorSeason: dataSeason, currentSeason }),
    [careerStats, dataSeason, currentSeason]
  )
  const fpaRanks = useMemo(() => rankFpaTable(fpaTable), [fpaTable])
  const fpaTeamCount = Object.keys(fpaTable).length
  // API-only mode (VITE_DATA_STORE_URL unset): the live-API fallback filters on activePlayerIds,
  // and DEF entries carry status: null — so it produces ZERO DEF rows (task §1/§6). Detected here
  // by table emptiness rather than by inspecting the data-store config directly, since that is the
  // one observable symptom that actually matters to the render.
  const defenseRowsAvailable = fpaTeamCount > 0

  const rows = useMemo(() => {
    if (!teamContextForSeason?.complete) return []
    const metricsTable = buildTeamMetricsTable(teamContextForSeason)
    return Object.keys(teamContextForSeason.teams).map(team => ({
      team,
      ...metricsTable[team],
      exposure: exposureForTeam(exposureData, team),
      fpaQb: fpaTable[team]?.qb ?? null,
      fpaRb: fpaTable[team]?.rb ?? null,
      fpaWr: fpaTable[team]?.wr ?? null,
      fpaTe: fpaTable[team]?.te ?? null,
    }))
  }, [teamContextForSeason, exposureData, fpaTable])

  const displayRows = useMemo(() => {
    const dir = sortState.direction === 'asc' ? 1 : -1
    const key = sortState.column
    if (key === 'team') return [...rows].sort((a, b) => dir * a.team.localeCompare(b.team))
    if (key === 'exposureShare') {
      return [...rows].sort((a, b) => compareNullsLast(a.exposure?.share ?? null, b.exposure?.share ?? null, dir))
    }
    return [...rows].sort((a, b) => compareNullsLast(a[key], b[key], dir))
  }, [rows, sortState])

  // The league distribution strip (§3.4) — the CURRENTLY SORTED column's values, in the same
  // order as the table rows, re-drawn on every sort change. Reuses SeriesBars: a distribution
  // over 32 teams is exactly SeriesBars' shape (an arbitrary-length array of numbers, no time
  // axis implied), so a local build would be bending nothing this primitive doesn't already do.
  const stripMeta = COLUMN_META[sortState.column]
  const stripValues = useMemo(() => {
    if (sortState.column === 'team' || !stripMeta) return null
    if (sortState.column === 'exposureShare') return displayRows.map(r => r.exposure?.share ?? null)
    return displayRows.map(r => r[sortState.column] ?? null)
  }, [displayRows, sortState.column, stripMeta])

  if (!loaded) {
    return (
      <div className="bg-dp-canvas flex flex-col gap-4">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">Teams</h1>
        <p className="text-sm text-dp-muted italic">Player data loading in background…</p>
      </div>
    )
  }

  // loaded === true but the season's teamContext is absent or incomplete — one whole-surface
  // DegradedBlock, distinct from the loading state above (§4). There is nothing else on this
  // screen to show, unlike the pop-up's per-section degradation.
  if (!teamContextForSeason?.complete) {
    return (
      <div className="bg-dp-canvas flex flex-col gap-4">
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">Teams</h1>
        <DegradedBlock kind="not-yet-accruing">
          No team-context data loaded for the {dataSeason ?? 'current'} season yet.
        </DegradedBlock>
      </div>
    )
  }

  return (
    <div className="bg-dp-canvas flex flex-col gap-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">Teams</h1>
        <p className="text-[13px] text-dp-muted mt-1">{dataSeason} season · all 32 NFL teams</p>
      </div>

      {!defenseRowsAvailable && (
        <div
          className="bg-dp-card-quiet border-dp-border-raised rounded-[10px] px-[16px] py-[10px] text-[12px] text-dp-muted"
          style={{ borderWidth: 1, borderStyle: 'dashed' }}
        >
          FPA QB/RB/WR/TE read "—" below — defense rows aren't served in API-only mode
          (VITE_DATA_STORE_URL unset). Connect the data store to see these columns.
        </div>
      )}

      {stripValues && (
        <div className="bg-dp-card border border-dp-border rounded-[10px] px-[16px] py-[12px]">
          <div className="text-[11px] text-dp-muted mb-2">{stripMeta.label} across all 32 teams</div>
          {/* colour="neutral" (dp-v2 6b) — signed-mode metrics (PROE, DEF EPA ALL, OFF EPA/PL)
              would otherwise colour by raw sign via SeriesBars' default, contradicting DEF EPA
              ALL's own inverted cell colours above (6a's flagged follow-up). scaled-mode metrics
              ignore this prop; it's already neutral there. */}
          <SeriesBars values={stripValues} mode={stripMeta.mode} domain={stripMeta.domain} colour="neutral" height={36} barWidth={8} gap={2} />
        </div>
      )}

      <div className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-dp-row-head">
                <SortTh label="Team" col="team" {...sortProps} />
                <SortTh label="PROE" col="proe" {...sortProps} align="right" />
                <SortTh label="Pace" col="pace" {...sortProps} align="right" />
                <SortTh label="Succ%" col="successRate" {...sortProps} align="right" />
                <SortTh label="Off EPA/pl" col="epaPerPlay" {...sortProps} align="right" />
                <SortTh label="RZ TD%" col="rzTdRate" {...sortProps} align="right" />
                <SortTh label="Def EPA all" col="defEpaPerPlay" {...sortProps} align="right" />
                <SortTh label="Pts/G" col="pointsPerGame" {...sortProps} align="right" />
                <SortTh label="FPA QB" col="fpaQb" {...sortProps} align="right" />
                <SortTh label="FPA RB" col="fpaRb" {...sortProps} align="right" />
                <SortTh label="FPA WR" col="fpaWr" {...sortProps} align="right" />
                <SortTh label="FPA TE" col="fpaTe" {...sortProps} align="right" />
                <SortTh label="Your exposure" col="exposureShare" {...sortProps} />
              </tr>
            </thead>
            <tbody>
              {displayRows.map(row => (
                <tr
                  key={row.team}
                  data-testid={`row-${row.team}`}
                  tabIndex={0}
                  onClick={() => goToTeam(row.team)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      goToTeam(row.team)
                    }
                  }}
                  className="border-t border-dp-border-row cursor-pointer hover:bg-dp-row-self focus:outline-none focus:bg-dp-row-self"
                >
                  <td className="px-[18px] py-3 font-dp-mono text-[13px] font-semibold text-dp-text">{row.team}</td>
                  <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">{fmtSignedPct(row.proe)}</td>
                  <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">{fmtSeconds(row.pace)}</td>
                  <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">{fmtPct(row.successRate)}</td>
                  <td data-testid={`offepa-${row.team}`} className={`px-3 py-3 text-right font-dp-mono text-[13px] ${epaColorClass(row.epaPerPlay, false)}`}>{fmtEpa(row.epaPerPlay)}</td>
                  <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">{fmtPct(row.rzTdRate)}</td>
                  <td data-testid={`defepa-${row.team}`} className={`px-3 py-3 text-right font-dp-mono text-[13px] ${epaColorClass(row.defEpaPerPlay, true)}`}>{fmtEpa(row.defEpaPerPlay)}</td>
                  <td className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text">{fmtNum1(row.pointsPerGame)}</td>
                  {FPA_COLUMNS.map(({ key, pos, label }) => {
                    const rank = fpaRanks[row.team]?.[pos] ?? null
                    const { gloss, field } = fpaPopoverText(pos, rank, fpaTeamCount, { priorSeason: dataSeason, currentSeason, nflSeasonLabel })
                    return (
                      // Stop propagation — this <td> sits inside a whole-row onClick/onKeyDown
                      // navigate-to-team-detail handler (below); without this, opening the
                      // popover (click) or operating it by keyboard (Enter/Space) would also
                      // navigate away.
                      <td
                        key={key}
                        data-testid={`${key}-${row.team}`}
                        className="px-3 py-3 text-right font-dp-mono text-[13px] text-dp-text"
                        onClick={e => e.stopPropagation()}
                        onKeyDown={e => e.stopPropagation()}
                      >
                        <DefinitionPopover term={label} gloss={gloss} field={field}>
                          {fmtFpa(row[key])}
                        </DefinitionPopover>
                      </td>
                    )
                  })}
                  <td data-testid={`exposure-${row.team}`} className="px-[18px] py-3"><ExposureCell exposure={row.exposure} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
