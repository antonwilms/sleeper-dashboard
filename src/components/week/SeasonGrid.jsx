// weekly-decision-2-panels.md §3 — the season, week by week. Assembles the three groups from
// W2a's lineup rows plus `myTeam.reserve` (this module owns section membership — `buildSeasonGrid`
// itself does not) and renders `weeklySeasonGrid.js`'s six cell kinds. Nothing here reaches
// projection, scoring or a dynasty value.

import { Fragment, useMemo } from 'react'
import { buildSeasonGrid } from '../../utils/weeklySeasonGrid'
import { ordinal } from '../../utils/environment'
import { scaleCss, scaleInk } from '../../utils/percentileColour'
import {
  LEGEND_POSITIONS, MIN_POOL_SAMPLES, percentileOf, percentileCutoffs,
} from '../../utils/starterPercentiles'

const GROUP_LABEL = { starters: 'STARTERS', bench: 'BENCH', ir: 'IR' }
const SEASON_WEEKS = 18

// W2b-1 — played cells are coloured by their percentile among league starters at the player's
// position (the `percentileBasis` prop, starterPercentiles.js). The scale is a rank, not a verdict.
function cellClass(kind) {
  switch (kind) {
    case 'bye': return 'bg-dp-bye-hatch'
    case 'dnp': return 'bg-dp-missed'
    case 'projected': return 'border border-dp-border-raised'
    case 'future': return 'border border-dp-border'
    default: return '' // played (styled in renderCell) and unknown — neutral, no glyph, no border
  }
}

const NEUTRAL_PLAYED = 'bg-dp-chip text-dp-text-2'

// One cell's inner div attributes + text. `pending` = basis loading; `basis` = the row position's basis.
function renderCell(cell, position, pending, basis) {
  if (cell.kind === 'played' && cell.points != null) {
    const text = cell.points.toFixed(0)
    const pts = `${cell.points.toFixed(1)} pts`
    if (pending) return { className: NEUTRAL_PLAYED, title: pts, text }
    if (basis) {
      const p = percentileOf(basis.values, cell.points)
      const pct = Math.round(p * 100)
      return {
        style: { backgroundColor: scaleCss(p), color: scaleInk(p) },
        title: `${pts} · ${ordinal(pct)} pct of ${position} starters (${basis.season})`,
        text, pct,
      }
    }
    // PROVISIONAL(no-data): played cell with no percentile basis · fewer than MIN_POOL_SAMPLES league-starter weeks at this position and no usable prior-season pool · a season reaching the threshold, or the prior league's matchups loading
    return { className: NEUTRAL_PLAYED, title: `${pts} · no ${position ?? 'position'} basis yet`, text }
  }
  if (cell.kind === 'dnp') return { role: 'img', label: 'Did not play', title: 'Did not play', text: '' }
  if (cell.kind === 'bye') return { role: 'img', label: 'Bye', title: 'Bye', text: '' }
  if (cell.kind === 'projected') return { text: cell.points != null ? cell.points.toFixed(0) : '' }
  // future, unknown: no glyph. `unknown` specifically must never read as `—` (asserts "did
  // not play") or dashed (asserts a bye that may never have happened). See weeklySeasonGrid.js's
  // resolveCell for the derivation and its tag.
  // PROVISIONAL(no-data): the `unknown` cell kind · a week this grid cannot resolve (failed
  // fetch or an incomplete/unresolved schedule) · a successful fetch and complete schedule would
  // resolve it to one of the other five kinds
  return { text: '' }
}

function legendBasisLine(basis, liveSeason, priorSeason) {
  const have = LEGEND_POSITIONS.filter(pos => basis?.[pos])
  if (have.length === 0) return 'No league-starter basis yet'
  const prior = have.filter(pos => basis[pos].source === 'prior')
  if (prior.length === 0) return `Basis: ${liveSeason} league starters`
  if (prior.length === have.length) {
    return `Basis: ${priorSeason} league starters (${liveSeason} has fewer than ${MIN_POOL_SAMPLES} starter-weeks per position)`
  }
  return `Basis: ${liveSeason} league starters; ${prior.join(', ')} use ${priorSeason} until ${MIN_POOL_SAMPLES} starter-weeks`
}

export function SeasonGrid({
  starters = [], bench = [], reserve = [], weeklyMaps = [], failedWeeks = [],
  scheduleIndex = null, projections = {}, scoringSettings = {}, currentWeek = 0,
  percentileBasis = null,
}) {
  const groups = useMemo(() => {
    const starterPlayers = starters
      .filter(r => r.player_id != null)
      .map(r => ({ id: r.player_id, name: r.name, team: r.team, position: r.position }))
    const benchPlayers = bench.map(r => ({ id: r.player_id, name: r.name, team: r.team, position: r.position }))
    const irPlayers = reserve.map(p => ({ id: p.id, name: p.full_name, team: p.team, position: p.position }))
    return [
      { key: 'starters', players: starterPlayers },
      { key: 'bench', players: benchPlayers },
      { key: 'ir', players: irPlayers },
    ]
  }, [starters, bench, reserve])

  const grid = useMemo(
    () => buildSeasonGrid({ groups, weeklyMaps, failedWeeks, scheduleIndex, projections, scoringSettings, currentWeek }),
    [groups, weeklyMaps, failedWeeks, scheduleIndex, projections, scoringSettings, currentWeek]
  )

  const visibleGroups = grid.filter(g => g.rows.length > 0)
  const pending = percentileBasis == null || percentileBasis.status === 'pending'
  const basis = pending ? {} : (percentileBasis.basis ?? {})
  const { liveSeason = null, priorSeason = null } = percentileBasis ?? {}

  let filled = 0
  let total = 0
  for (const g of grid) {
    for (const row of g.rows) {
      for (const cell of row.cells) {
        total += 1
        if (cell.kind === 'played' || (cell.kind === 'projected' && cell.points != null)) filled += 1
      }
    }
  }

  const gradient = `linear-gradient(to right, ${[0, 1, 2, 3, 4, 5].map(i => `var(--color-dp-scale-${i}) ${i * 20}%`).join(', ')})`

  return (
    <div className="bg-dp-card border border-dp-border rounded-[12px] overflow-hidden">
      <div className="flex items-baseline gap-2.5 px-[18px] py-3 border-b border-dp-border-row flex-wrap">
        <span className="text-[13px] font-semibold text-dp-text-strong">The season, week by week</span>
        <span className="ml-auto font-dp-mono text-[10px] tracking-[0.06em] text-dp-muted-2">
          {filled} of {total} CELLS FILLED
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-dp-card-quiet">
              <th className="text-left px-[18px] py-1.5 font-dp-mono text-[10px] text-dp-muted">PLAYER</th>
              {Array.from({ length: SEASON_WEEKS }, (_, i) => (
                <th key={i + 1} className="text-center px-1 py-1.5 font-dp-mono text-[9px] text-dp-muted">
                  {i + 1}
                </th>
              ))}
              <th className="text-right px-2 py-1.5 font-dp-mono text-[9px] text-dp-muted whitespace-nowrap">SEASON</th>
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map(g => (
              <Fragment key={g.key}>
                <tr key={`divider-${g.key}`}>
                  <td colSpan={SEASON_WEEKS + 2} className="px-[18px] py-1 border-t border-dp-border-row bg-dp-card-quiet font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted">
                    {GROUP_LABEL[g.key] ?? g.key.toUpperCase()}
                  </td>
                </tr>
                {g.rows.map(row => (
                  <tr key={row.id} data-testid={`grid-row-${row.id}`} className="border-t border-dp-border-row">
                    <td className="px-[18px] py-1.5 text-[11.5px] text-dp-text whitespace-nowrap">{row.name}</td>
                    {row.cells.map(cell => {
                      const r = renderCell(cell, row.position, pending, basis[row.position] ?? null)
                      return (
                        <td
                          key={cell.week}
                          data-testid={`grid-cell-${row.id}-${cell.week}`}
                          data-kind={cell.kind}
                          data-pct={r.pct != null ? r.pct : undefined}
                          className="px-0.5 py-1.5 text-center"
                        >
                          <div
                            className={`h-4 rounded-[2px] mx-auto ${cellClass(cell.kind)} ${r.className ?? ''}`}
                            style={r.style}
                            role={r.role}
                            aria-label={r.label}
                            title={r.title}
                          >
                            <span className={`font-dp-mono text-[9px] ${r.style ? '' : 'text-dp-text-2'}`}>{r.text}</span>
                          </div>
                        </td>
                      )
                    })}
                    <td data-testid={`grid-total-${row.id}`} className="px-2 py-1.5 text-right font-dp-mono text-[9px] text-dp-text-2 whitespace-nowrap">
                      {row.seasonTotal.games === 0 ? '—' : `${Math.round(row.seasonTotal.points)} · ${row.seasonTotal.games}`}
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div data-testid="grid-legend" className="px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11px] text-dp-muted leading-relaxed space-y-1">
        <div className="flex items-center gap-2">
          <span>bottom of starters</span>
          <span className="inline-block h-2 w-[120px] rounded-[2px]" style={{ background: gradient }} />
          <span>top</span>
        </div>
        {pending ? (
          <div data-testid="legend-basis">Loading the league-starter basis…</div>
        ) : (
          <>
            {LEGEND_POSITIONS.map(pos => {
              const b = basis[pos]
              return (
                <div key={pos} data-testid={`legend-cutoffs-${pos}`} className="font-dp-mono">
                  {b
                    ? `${pos}: ${percentileCutoffs(b.values).map(v => Math.round(v)).join(' / ')} pts${b.source === 'prior' ? ` · ${b.season}` : ''}`
                    : `${pos}: no basis yet`}
                </div>
              )
            })}
            <div data-testid="legend-basis">{legendBasisLine(basis, liveSeason, priorSeason)}</div>
          </>
        )}
        <div className="flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-[2px] bg-dp-missed" />Did not play
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-4 rounded-[2px] bg-dp-bye-hatch" />Bye
          </span>
        </div>
        <div>Nothing in this grid reaches projection, scoring or a dynasty value.</div>
      </div>
    </div>
  )
}
