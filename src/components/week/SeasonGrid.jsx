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
    case 'played': return 'bg-dp-up-bg'
    case 'bye': return 'border border-dashed border-dp-border-raised'
    case 'projected': return 'border border-dp-border-raised'
    case 'future': return 'border border-dp-border'
    case 'dnp': return ''
    default: return '' // unknown — neutral, no glyph, no border (PROVISIONAL(no-data) below)
  }
}

function cellText(cell) {
  if (cell.kind === 'played') return cell.points != null ? cell.points.toFixed(0) : ''
  if (cell.kind === 'projected') return cell.points != null ? cell.points.toFixed(0) : ''
  if (cell.kind === 'dnp') return '—'
  // bye, future, unknown: no glyph. `unknown` specifically must never read as `—` (asserts "did
  // not play") or dashed (asserts a bye that may never have happened).
  // PROVISIONAL(no-data): the `unknown` cell kind · schedule/stats window can't answer for that
  // week (incomplete schedule, unresolved team, or a failed fetch) · a complete schedule + a
  // successful fetch for that week would resolve it to one of the other five kinds
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
  for (const g of grid) {
    for (const row of g.rows) {
      for (const cell of row.cells) {
        total += 1
        if (cell.kind === 'played' || (cell.kind === 'projected' && cell.points != null)) filled += 1
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
                        <div className={`h-4 rounded-[2px] mx-auto ${cellClass(cell.kind)}`}>
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
