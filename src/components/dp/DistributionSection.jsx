import { DegradedBlock } from './DegradedBlock'
import { CoveragePips } from './CoveragePips'
import { coverageBand } from '../../utils/coverageBand'
import { extractDisplayGamePoints, summarizeGamePoints } from '../../utils/outlookConsistency'
import { bucketPoints, bucketAxisPercent } from '../../utils/distribution'

function ShapeRow({ testId, label, value }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-dp-muted">{label}</span>
      <span data-testid={testId} className="font-dp-mono text-dp-text">{value}</span>
    </div>
  )
}

// dp-v2 Slice 4a. Reuses `consistency`'s OWN window (its `seasons` list, from computeConsistency)
// rather than re-deriving the season set. The values are computed over the DISPLAY series
// (weekly-points-display-basis.md §2.2), so the SD equals the Overview tile's ±SD only for rows
// whose weeks are league-scored; a caption states the basis.
export function DistributionSection({ careerStats, playerId, consistency }) {
  if (!consistency) {
    return (
      <DegradedBlock kind="not-yet-accruing">
        Not enough qualifying seasons yet to characterise game-to-game variance.
      </DegradedBlock>
    )
  }

  const { window, seasons } = consistency
  const perSeason = seasons.map(s => ({
    season: s.season,
    ...extractDisplayGamePoints(careerStats?.[s.season]?.[playerId]),
  }))
  const points = perSeason.flatMap(p => p.points)
  const { games: pooledGames, mean, sd, cv } = summarizeGamePoints(points)
  const buckets = bucketPoints(points)
  const maxCount = Math.max(1, ...buckets.map(b => b.count))
  const over20 = points.filter(v => v > 20).length
  const under10 = points.filter(v => v < 10).length
  const band = coverageBand(pooledGames)

  const basisSeasons = (b) => perSeason
    .filter(p => p.points.length > 0 && p.basis === b)
    .map(p => p.season)
    .sort((a, c) => a - c)
  const halfSeasons = basisSeasons('half_ppr')
  const leagueSeasons = basisSeasons('league')
  let basisCopy = null
  if (halfSeasons.length && leagueSeasons.length) {
    basisCopy = `Per-game points mix scoring bases — half-PPR: ${halfSeasons.join(', ')} · league: ${leagueSeasons.join(', ')}. League scoring isn't available week by week for stored seasons.`
  } else if (halfSeasons.length) {
    basisCopy = "Per-game points are half-PPR — league scoring isn't available week by week. The Overview's ±SD is measured on league-scaled weeks, so it differs from the SD here."
  } else if (leagueSeasons.length) {
    basisCopy = "Per-game points are league-scored from Sleeper's weekly stats, with the scoring settings in effect when each season was first loaded."
  }

  return (
    <div>
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
    {basisCopy && (
      <p data-testid="dist-basis" className="mt-2 text-[11px] text-dp-muted">{basisCopy}</p>
    )}
    </div>
  )
}
