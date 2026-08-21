import { useMemo } from 'react'
import { SeriesBars } from './SeriesBars'
import { CoveragePips } from './CoveragePips'
import { DefinitionPopover } from './DefinitionPopover'
import { DegradedBlock } from './DegradedBlock'
import {
  buildTeamShareTotals, buildPerSeasonTeamShares, buildPositionStatSeries, POSITION_STAT_METRICS,
} from '../../utils/outlookPositionStats'
import { buildUsageHistory } from '../../utils/outlookUsage'
import { coverageBand } from '../../utils/coverageBand'
import { alignToAxis, buildMetricRow } from '../../utils/usageEfficiency'

// dp-v2 Slice 4b. Renders EXISTING derivations onto one shared season axis (task file §3.2a) —
// creates no new denominator, computes no new rate. Zero diff on outlookPositionStats.js /
// outlookUsage.js is the defining constraint; this component only calls them.
export function UsageEfficiencySection({ careerStats, playersMap, playerId, position, axisSeasons }) {
  // Accepted cost (§2.1): with no App.jsx change, this recomputes the whole-corpus share
  // denominators Market.jsx already computes independently. Hoisting to App.jsx is 4c's call.
  const teamShareTotals = useMemo(
    () => buildTeamShareTotals(careerStats ?? {}, playersMap ?? {}),
    [careerStats, playersMap]
  )
  const perSeasonTeamShares = useMemo(
    () => buildPerSeasonTeamShares(careerStats ?? {}, teamShareTotals, playersMap ?? {}),
    [careerStats, teamShareTotals, playersMap]
  )
  const positionSeries = useMemo(
    () => buildPositionStatSeries(playerId, position, careerStats, { perSeasonTeamShares, teamShareTotals }),
    [playerId, position, careerStats, perSeasonTeamShares, teamShareTotals]
  )
  // Snap share is buildUsageHistory's existing snapPct (off_snp ÷ tm_off_snp), sourced from the
  // same view-only perSeasonTeamShares Market.jsx already passes it — never recomputed (§3.1).
  const usageHistory = useMemo(
    () => buildUsageHistory(playerId, position, careerStats, perSeasonTeamShares),
    [playerId, position, careerStats, perSeasonTeamShares]
  )

  if (axisSeasons.length === 0) {
    return (
      <DegradedBlock kind="not-yet-accruing">
        No qualifying seasons yet for usage &amp; efficiency.
      </DegradedBlock>
    )
  }

  const metricIds = POSITION_STAT_METRICS[position] ?? []
  // SNAP_POSITIONS = {RB, WR, TE} — usageMetrics.js gates QB out deliberately (near-constant
  // ~0.95 snap share wrongly penalises injury-fill starters). Respected here by construction,
  // not re-imported: QB is the one position POSITION_STAT_METRICS.QB never overlaps with RB/WR/TE.
  const showSnapShare = position === 'RB' || position === 'WR' || position === 'TE'

  const rows = [
    ...metricIds.map(id => buildMetricRow(id, alignToAxis(positionSeries[id], axisSeasons, 'value'), axisSeasons)),
    ...(showSnapShare ? [buildMetricRow('snapShare', alignToAxis(usageHistory, axisSeasons, 'snapPct'), axisSeasons)] : []),
  ]

  if (rows.length === 0) {
    return (
      <DegradedBlock kind="never-available">
        No usage metrics are defined for this position.
      </DegradedBlock>
    )
  }

  const spanLabel = `${axisSeasons.length}y`
  const hasPreCliffSeason = axisSeasons.some(s => s < 2020)

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[10px] font-dp-mono tracking-[0.08em] text-dp-muted-2 border border-dp-border-raised rounded px-1.5 py-0.5">
          DISPLAY ONLY
        </span>
        <span className="text-[11px] text-dp-muted">
          Never feeds projection or dynasty score — every rate recomputed from raw counts, per-season-team attributed.
        </span>
      </div>
      <div className="flex flex-col gap-4">
        {rows.map(row => {
          const band = coverageBand(row.coverageCount)
          return (
            <div key={row.id}>
              <div className="flex items-center gap-3">
                <DefinitionPopover term={row.meta.label} gloss={row.meta.note} field={row.meta.field}>
                  <span className="text-xs text-dp-text-2 w-[112px] inline-block truncate text-left">{row.meta.label}</span>
                </DefinitionPopover>
                <div className="flex-1 min-w-0">
                  <SeriesBars
                    values={row.values}
                    mode="scaled"
                    domain={row.meta.domain ?? undefined}
                    height={26}
                    barWidth={10}
                    gap={3}
                  />
                  {row.meta.domain && (
                    <div className="text-[10px] text-dp-muted-2 mt-0.5">
                      floor {row.meta.format(row.meta.domain[0])} · ceiling {row.meta.format(row.meta.domain[1])}
                    </div>
                  )}
                </div>
                <span className="font-dp-mono text-xs text-dp-text w-[56px] text-right shrink-0">
                  {row.latest ? row.meta.format(row.latest.value) : '—'}
                </span>
                <span className={`font-dp-mono text-[11px] w-[56px] text-right shrink-0 ${
                  row.delta == null ? 'text-dp-muted' : row.delta >= 0 ? 'text-dp-up-text' : 'text-dp-down-text'
                }`}>
                  {row.delta != null ? row.meta.deltaFormat(row.delta) : '—'}
                </span>
                <div className="flex items-center gap-1.5 w-[54px] shrink-0">
                  <CoveragePips band={band} />
                  <span className="text-[10px] text-dp-muted-2">{spanLabel}</span>
                </div>
              </div>
              {row.id === 'snapShare' && hasPreCliffSeason && (
                <div className="ml-[124px] mt-1">
                  <span className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-text-5">NOT MEASURED THEN</span>
                  <span className="text-[11px] text-dp-muted ml-1.5">
                    off_snp is not tracked before 2020 — earlier seasons render as void slots.
                  </span>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
