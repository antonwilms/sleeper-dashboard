// weekly-decision-2-panels.md §3 — the season, week by week. Assembles the three groups from
// W2a's lineup rows plus `myTeam.reserve` (this module owns section membership — `buildSeasonGrid`
// itself does not) and renders `weeklySeasonGrid.js`'s six cell kinds. Nothing here reaches
// projection, scoring or a dynasty value.

import { Fragment, useMemo } from 'react'
import { buildSeasonGrid } from '../../utils/weeklySeasonGrid'

const GROUP_LABEL = { starters: 'STARTERS', bench: 'BENCH', ir: 'IR' }
const SEASON_WEEKS = 18

function cellClass(kind) {
  switch (kind) {
    // 'played' carries no static background class — its fill is scaled by value (see
    // playedCellStyle below), fix pass 1 item 1.6.
    case 'played': return ''
    case 'bye': return 'border border-dashed border-dp-border-raised'
    case 'projected': return 'border border-dp-border-raised'
    case 'future': return 'border border-dp-border'
    case 'dnp': return ''
    default: return '' // unknown — neutral, no glyph, no border (see weeklySeasonGrid.js resolveCell)
  }
}

// Fix pass 1, item 1.6 (§3 fidelity) — a 'played' cell's fill is scaled by points / max(points)
// over the grid's OWN played cells (not a global scale), using the existing `--color-dp-up`
// token as the base colour. A 0 stays a FILLED cell at the lowest intensity — never empty or
// transparent, the same null-is-not-0 invariant §3 states for the cell kinds themselves.
//
// Fix pass 2, item 2.1 — the intensity is applied to the BACKGROUND only (a color-mix alpha on
// the token), never to the cell's `opacity`: that would also fade the number inside it. The
// number keeps its own colour and full strength at every intensity.
//
// Fix pass 2, item 2.2 — an all-zero grid (every played week scored 0) must not invert the
// scale: `maxPlayedPoints <= 0` is guarded explicitly to the MINIMUM intensity, not the maximum.
const MIN_INTENSITY = 0.18
function playedCellStyle(points, maxPlayedPoints) {
  const ratio = (maxPlayedPoints == null || maxPlayedPoints <= 0)
    ? 0
    : Math.min(1, Math.max(0, (points ?? 0) / maxPlayedPoints))
  const intensity = MIN_INTENSITY + (1 - MIN_INTENSITY) * ratio
  return { backgroundColor: `color-mix(in srgb, var(--color-dp-up) ${(intensity * 100).toFixed(1)}%, transparent)` }
}

function cellText(cell) {
  if (cell.kind === 'played') return cell.points != null ? cell.points.toFixed(0) : ''
  if (cell.kind === 'projected') return cell.points != null ? cell.points.toFixed(0) : ''
  if (cell.kind === 'dnp') return '—'
  // bye, future, unknown: no glyph. `unknown` specifically must never read as `—` (asserts "did
  // not play") or dashed (asserts a bye that may never have happened). See weeklySeasonGrid.js's
  // resolveCell for the derivation and its tag.
  // PROVISIONAL(no-data): the `unknown` cell kind · a week this grid cannot resolve (failed
  // fetch or an incomplete/unresolved schedule) · a successful fetch and complete schedule would
  // resolve it to one of the other five kinds
  return ''
}

export function SeasonGrid({
  starters = [], bench = [], reserve = [], weeklyMaps = [], failedWeeks = [],
  scheduleIndex = null, projections = {}, scoringSettings = {}, currentWeek = 0,
}) {
  const groups = useMemo(() => {
    const starterPlayers = starters
      .filter(r => r.player_id != null)
      .map(r => ({ id: r.player_id, name: r.name, team: r.team }))
    const benchPlayers = bench.map(r => ({ id: r.player_id, name: r.name, team: r.team }))
    const irPlayers = reserve.map(p => ({ id: p.id, name: p.full_name, team: p.team }))
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

  let filled = 0
  let total = 0
  let maxPlayedPoints = null
  for (const g of grid) {
    for (const row of g.rows) {
      for (const cell of row.cells) {
        total += 1
        if (cell.kind === 'played' || (cell.kind === 'projected' && cell.points != null)) filled += 1
        if (cell.kind === 'played' && cell.points != null) {
          if (maxPlayedPoints == null || cell.points > maxPlayedPoints) maxPlayedPoints = cell.points
        }
      }
    }
  }

  return (
    <div className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
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
            </tr>
          </thead>
          <tbody>
            {visibleGroups.map(g => (
              <Fragment key={g.key}>
                <tr key={`divider-${g.key}`}>
                  <td colSpan={SEASON_WEEKS + 1} className="px-[18px] py-1 border-t border-dp-border-row bg-dp-card-quiet font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted">
                    {GROUP_LABEL[g.key] ?? g.key.toUpperCase()}
                  </td>
                </tr>
                {g.rows.map(row => (
                  <tr key={row.id} data-testid={`grid-row-${row.id}`} className="border-t border-dp-border-row">
                    <td className="px-[18px] py-1.5 text-[11.5px] text-dp-text whitespace-nowrap">{row.name}</td>
                    {row.cells.map(cell => (
                      <td key={cell.week} data-testid={`grid-cell-${row.id}-${cell.week}`} data-kind={cell.kind} className="px-0.5 py-1.5 text-center">
                        <div
                          className={`h-4 rounded-[2px] mx-auto ${cellClass(cell.kind)}`}
                          style={cell.kind === 'played' ? playedCellStyle(cell.points, maxPlayedPoints) : undefined}
                        >
                          <span className="font-dp-mono text-[9px] text-dp-text-2">{cellText(cell)}</span>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <div className="px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11px] text-dp-muted leading-relaxed">
        Nothing in this grid reaches projection, scoring or a dynasty value.
      </div>
    </div>
  )
}
