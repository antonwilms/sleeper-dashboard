// W2b-3 — one season, one bar per completed REG week (shared: /week lineup and My Team's Starting ten/Bench in season).
// `cells` are weeklySeasonGrid.js cells (week < currentWeek: played | bye | dnp | unknown) —
// the season grid's own output, so the strip and grid cannot disagree. View-only.
import { VoidBar } from './SeriesBars'
import { scaleCss } from '../../utils/percentileColour'
import { basisView, percentileOf } from '../../utils/starterPercentiles'

const TRACK_H = 18
const BAR_W = 5

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
  const max = Math.max(1, ...playedPts)
  const last3 = new Set(
    cells.filter(c => c.kind === 'played').sort((a, z) => a.week - z.week).slice(-3).map(c => c.week)
  )

  return (
    <div data-testid="weekly-strip" style={{ width: 107 }}>
      <div className="flex items-end" style={{ gap: 1, height: TRACK_H }}>
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
          const extra = last3.has(cell.week) ? { 'data-last3': 'true' } : {}
          if (cell.kind === 'bye') {
            return <div key={cell.week} {...common} {...extra} className="bg-dp-bye-hatch" style={{ width: BAR_W, height: TRACK_H }} />
          }
          if (cell.kind === 'dnp') {
            return (
              <div
                key={cell.week}
                {...common}
                {...extra}
                className="bg-dp-missed"
                style={{ width: BAR_W, height: BAR_W, alignSelf: 'flex-start' }}
              />
            )
          }
          if (cell.kind === 'played' && cell.points != null) {
            const h = cell.points > 0 ? Math.max(3, Math.round((cell.points / max) * TRACK_H)) : 2
            if (pending) {
              return <div key={cell.week} {...common} {...extra} className="bg-dp-chip rounded-[1px]" style={{ width: BAR_W, height: h }} />
            }
            if (b) {
              const p = percentileOf(b.values, cell.points)
              return (
                <div
                  key={cell.week}
                  {...common}
                  {...extra}
                  data-pct={Math.round(p * 100)}
                  className="rounded-[1px]"
                  style={{ width: BAR_W, height: h, backgroundColor: scaleCss(p) }}
                />
              )
            }
            // PROVISIONAL(no-data): played strip bar with no percentile basis · fewer than MIN_POOL_SAMPLES league-starter weeks at this position and no usable prior-season pool · a season reaching the threshold, or the prior league's matchups loading
            return <div key={cell.week} {...common} {...extra} className="bg-dp-chip rounded-[1px]" style={{ width: BAR_W, height: h }} />
          }
          // PROVISIONAL(no-data): the unknown strip slot · a week this strip cannot resolve (failed fetch or an incomplete/unresolved schedule) · a successful fetch and complete schedule would resolve it
          return (
            <div key={cell.week} {...common} {...extra} style={{ width: BAR_W, height: 0 }}>
              <VoidBar width={BAR_W} />
            </div>
          )
        })}
      </div>
      <div className="flex mt-[2px]" style={{ gap: 1, height: 2 }}>
        {cells.map(cell => (
          <div
            key={cell.week}
            className={last3.has(cell.week) ? 'bg-dp-text-2' : undefined}
            style={{ width: BAR_W, height: 2 }}
          />
        ))}
      </div>
    </div>
  )
}
