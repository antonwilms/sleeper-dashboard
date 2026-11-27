// W2b-3 — one season, one bar per completed REG week (shared: /week lineup and My Team's Starting ten/Bench in season).
// `cells` are weeklySeasonGrid.js cells (week < currentWeek: played | bye | dnp | unknown) —
// the season grid's own output, so the strip and grid cannot disagree. View-only.
import { WeekSlot, WEEK_SLOT_GAP } from './WeekSlot'
import { scaleCss } from '../../utils/percentileColour'
import { basisView, percentileOf, quantile } from '../../utils/starterPercentiles'

const TRACK_H = 18
const BAR_W = 5
// Full height = a week at this quantile of the position's league-starter pool.
export const STRIP_SCALE_Q = 0.95

export const WEEKS_STRIP_TITLE = "Points in each completed week. Height: points on one scale for every player at his position — full height is a top-5% week among this league's starters there. Colour: how that week ranked among this league's starters at his position — light green the top, dark purple the bottom. Red ×: did not play. Hatched stub: bye. Dashed: not loaded."

function slotTitle(cell) {
  if (cell.kind === 'played' && cell.points != null) return `Wk ${cell.week} · ${cell.points.toFixed(1)} pts`
  if (cell.kind === 'bye') return 'Bye'
  if (cell.kind === 'dnp') return 'Did not play'
  return `Wk ${cell.week} · not loaded`
}

export function WeeklyStrip({ cells = [], position = null, percentileBasis = null }) {
  if (cells.length === 0) return <span className="text-dp-muted text-[12px]">—</span>

  const { pending, basis } = basisView(percentileBasis)
  const b = basis[position] ?? null

  const playedPts = cells.filter(c => c.kind === 'played' && c.points != null).map(c => c.points)
  const scaleTop = b ? quantile(b.values, STRIP_SCALE_Q) : null
  const sharedScale = Number.isFinite(scaleTop) && scaleTop > 0
  const top = sharedScale ? scaleTop : Math.max(1, ...playedPts)

  return (
    <div data-testid="weekly-strip" data-scale={sharedScale ? 'position' : 'own'} style={{ width: 107 }}>
      <div className="flex items-end" style={{ gap: WEEK_SLOT_GAP, height: TRACK_H + 1 }}>
        {cells.map(cell => {
          const title = slotTitle(cell)
          const common = {
            'data-testid': 'strip-slot',
            'data-week': cell.week,
            'data-kind': cell.kind,
            role: 'img',
            'aria-label': title,
            title,
          }
          const slot = { kind: cell.kind, width: BAR_W, trackH: TRACK_H, ...common }
          if (cell.kind === 'played' && cell.points != null) {
            const h = cell.points > 0 ? Math.max(3, Math.round(Math.min(1, cell.points / top) * TRACK_H)) : 2
            if (pending) {
              return <WeekSlot key={cell.week} {...slot} barHeight={h} barClassName="bg-dp-chip" />
            }
            if (b) {
              const p = percentileOf(b.values, cell.points)
              return (
                <WeekSlot
                  key={cell.week}
                  {...slot}
                  data-pct={Math.round(p * 100)}
                  barHeight={h}
                  barStyle={{ backgroundColor: scaleCss(p) }}
                />
              )
            }
            // PROVISIONAL(no-data): played strip bar with no percentile basis · fewer than MIN_POOL_SAMPLES league-starter weeks at this position and no usable prior-season pool · a season reaching the threshold, or the prior league's matchups loading
            return <WeekSlot key={cell.week} {...slot} barHeight={h} barClassName="bg-dp-chip" />
          }
          // PROVISIONAL(no-data): the unknown strip slot · a week this strip cannot resolve (failed fetch or an incomplete/unresolved schedule) · a successful fetch and complete schedule would resolve it
          return <WeekSlot key={cell.week} {...slot} />
        })}
      </div>
    </div>
  )
}
