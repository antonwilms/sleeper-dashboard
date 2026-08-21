import { DegradedBlock } from './DegradedBlock'
import { CoveragePips } from './CoveragePips'
import { coverageBand } from '../../utils/coverageBand'
import { extractGamePoints } from '../../utils/outlookConsistency'
import { bucketPoints, bucketAxisPercent } from '../../utils/distribution'

function ShapeRow({ testId, label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-dp-muted">{label}</span>
      <span data-testid={testId} className="font-dp-mono text-dp-text">{value}</span>
    </div>
  )
}

// dp-v2 Slice 4a. Pools over `consistency`'s OWN window (its `seasons` list, from
// computeConsistency) rather than re-deriving the season set, so this section's SD is provably
// the same number as the Overview tile's ±SD (task file §4).
export function DistributionSection({ careerStats, playerId, consistency }) {
  if (!consistency) {
    return (
      <DegradedBlock kind="not-yet-accruing">
        Not enough qualifying seasons yet to characterise game-to-game variance.
      </DegradedBlock>
    )
  }

  const { mean, sd, cv, pooledGames, window, seasons } = consistency
  const points = seasons.flatMap(s => extractGamePoints(careerStats?.[s.season]?.[playerId]))
  const buckets = bucketPoints(points)
  const maxCount = Math.max(1, ...buckets.map(b => b.count))
  const over20 = points.filter(v => v > 20).length
  const under10 = points.filter(v => v < 10).length
  const band = coverageBand(pooledGames)

  return (
    <div className="flex flex-col dpwide:flex-row gap-6">
      <div className="flex-1 min-w-0">
        <div className="relative">
          <div className="flex items-end gap-1.5 h-[110px]">
            {buckets.map(b => (
              <div key={b.id} className="flex-1 flex flex-col items-center justify-end" style={{ height: 110 }}>
                {b.count > 0 ? (
                  <div
                    className="w-full bg-dp-slate-2 rounded-t-[2px]"
                    style={{ height: Math.max(4, Math.round((b.count / maxCount) * 100)) }}
                  />
                ) : (
                  <div className="w-full" style={{ height: 0, borderTop: '1px dashed var(--color-dp-slate-2)' }} />
                )}
              </div>
            ))}
          </div>
          {/* ±1 SD, dashed pair — not drawn when sd is null (pooled games < MIN_POOLED_GAMES) */}
          {sd != null && (
            <>
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${bucketAxisPercent(mean - sd)}%`, borderLeft: '1px dashed var(--color-dp-muted-2)' }} />
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${bucketAxisPercent(mean + sd)}%`, borderLeft: '1px dashed var(--color-dp-muted-2)' }} />
            </>
          )}
        </div>
        <div className="flex gap-1.5 mt-1.5">
          {buckets.map(b => (
            <div key={b.id} className="flex-1 text-center text-[10px] text-dp-muted">{b.label}</div>
          ))}
        </div>
      </div>

      <div className="w-full dpwide:w-[210px] shrink-0 flex flex-col gap-2">
        <ShapeRow testId="dist-mean" label="Mean" value={mean != null ? mean.toFixed(1) : '—'} />
        <ShapeRow testId="dist-sd" label="SD" value={sd != null ? `±${sd.toFixed(1)}` : '—'} />
        <ShapeRow testId="dist-cv" label="CV" value={cv != null ? cv.toFixed(2) : '—'} />
        <ShapeRow testId="dist-over20" label="Over 20" value={`${over20} of ${pooledGames}`} />
        <ShapeRow testId="dist-under10" label="Under 10" value={`${under10} of ${pooledGames}`} />
        <div className="flex items-center gap-1.5 pt-1">
          <CoveragePips band={band} />
          <span className="text-[11px] text-dp-muted-2">{window}y</span>
        </div>
      </div>
    </div>
  )
}
