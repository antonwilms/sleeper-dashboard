// Formatters
const PCT   = v => `${(v * 100).toFixed(1)}%`   // 0–1 fractions (shares) → percent
const RATIO = v => v.toFixed(2)                  // WOPR / RACR ratios

// To add a view-only stat: append one row here. `from` selects the value source:
//   'adv'        → advStats[key]            (nflverse served file — single source)
//   'usageSnap'  → snapShare                (reused in-app, projection.factors.snapShare)
//   'usageShare' → usageShare.value         (reused in-app, historicalShares)
// `positions` gates position-appropriateness; a row is also dropped when its resolved
// value is null/undefined/non-finite (handles RB null racr/airYardsShare, etc.).
// A future descriptor can read raw underlying numbers via advStats.components.* by
// adding a small resolver branch — the served `components` object is passed through.
const ADV_STAT_ROWS = [
  // ── Advanced — nflverse advstats (served file) ──
  { key: 'targetShare',   group: 'advanced', label: 'Target share',    positions: ['WR','TE','RB'], format: PCT,   from: 'adv' },
  { key: 'airYardsShare', group: 'advanced', label: 'Air-yards share', positions: ['WR','TE'],      format: PCT,   from: 'adv' },
  { key: 'wopr',          group: 'advanced', label: 'WOPR',            positions: ['WR','TE'],      format: RATIO, from: 'adv' },
  { key: 'racr',          group: 'advanced', label: 'RACR',            positions: ['WR','TE'],      format: RATIO, from: 'adv' },
  // ── Usage — already computed in-app (reused, not recomputed) ──
  { key: 'snapShare',  group: 'usage', label: 'Snap share',                                        positions: ['WR','TE','RB'], format: PCT, from: 'usageSnap' },
  { key: 'usageShare', group: 'usage', label: p => p === 'RB' ? 'Carry share' : 'Target share',   positions: ['WR','TE','RB'], format: PCT, from: 'usageShare' },
]

// Advanced group gets its own season label (advStatsSeason); Usage group gets its own
// (usageShare.season). The two sources may resolve to different seasons, so a single
// section-level label would be misleading.
const GROUPS = [
  { id: 'advanced', title: 'Advanced (nflverse)', getSeason: (advStatsSeason) => advStatsSeason },
  { id: 'usage',    title: 'Usage (in-app)',       getSeason: (_, usageShare) => usageShare?.season ?? null },
]

function resolveValue(row, { advStats, snapShare, usageShare }) {
  switch (row.from) {
    case 'adv':        return advStats ? advStats[row.key] : null
    case 'usageSnap':  return snapShare
    case 'usageShare': return usageShare?.value ?? null
    default:           return null
  }
}

const isShown = (v) => v != null && Number.isFinite(v)

export function AdvancedStatsPanel({ position, advStats, advStatsSeason, snapShare, usageShare }) {
  const ctx = { advStats, snapShare, usageShare }

  // Resolve every applicable, present row once.
  const resolved = ADV_STAT_ROWS
    .filter(r => r.positions.includes(position))
    .map(r => ({ row: r, value: resolveValue(r, ctx) }))
    .filter(({ value }) => isShown(value))

  if (resolved.length === 0) return null  // graceful absence — render nothing

  const renderGroup = (group) => {
    const rows = resolved.filter(({ row }) => row.group === group.id)
    if (rows.length === 0) return null
    const season = group.getSeason(advStatsSeason, usageShare)
    return (
      <div key={group.id}>
        <div className="flex items-baseline justify-between mb-2">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            {group.title}
          </h4>
          {season != null && (
            <span className="text-xs text-gray-400">{season} season</span>
          )}
        </div>
        <table className="w-full text-sm">
          <tbody>
            {rows.map(({ row, value }) => (
              <tr key={row.key} className="border-b last:border-0">
                <td className="py-1.5 text-gray-600">
                  {typeof row.label === 'function' ? row.label(position) : row.label}
                </td>
                <td className="py-1.5 text-right tabular-nums font-medium text-gray-800">
                  {row.format(value)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <section>
      <h3 className="text-sm font-semibold text-gray-700 mb-2">Advanced &amp; Usage</h3>
      <div className="space-y-4">
        {GROUPS.map(g => renderGroup(g))}
      </div>
    </section>
  )
}
