// dp-v2 Slice 4b — Usage & efficiency section pure helpers. This slice renders EXISTING
// derivations (outlookPositionStats.buildPositionStatSeries, outlookUsage.buildUsageHistory) onto
// one shared season axis; it computes and reads no stat key itself. No React.
//
// Metric metadata: label, an explicit `domain` for genuinely bounded fraction/percentage metrics
// (a share series compressed into an auto min–max window is unreadable — task file §3.4), value/
// delta formatters, the raw field expression (for DefinitionPopover), and a one-line note. Count-
// and ratio-shaped metrics (sacks, yardsPerCarry, aDOT) have no natural fixed ceiling — a guessed
// one risks clipping a real outlier — so they're left on SeriesBars' auto min–max instead.
//
// dp-v2 Slice 4c added `buildRzShareSeries` — the red-zone share row 4b deferred (its only
// denominator source, `computeHistoricalTeamTotals`, is threaded onto ProfileDataContext in this
// slice, not before). CR-11: a new app-side reader of `rec_rz_tgt`/`rush_rz_att`.

import { QUALIFYING_GP } from './outlookConsistency'
import { resolvePlayerTeam } from './playerTeam'

const pctFmt = v => `${(v * 100).toFixed(1)}%`
const pctDeltaFmt = d => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`
const numFmt = d => v => v.toFixed(d)
const numDeltaFmt = d => v => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

export const METRIC_META = {
  cmpPct: {
    label: 'Completion %', domain: [0, 100],
    format: v => `${v.toFixed(1)}%`, deltaFormat: d => `${d >= 0 ? '+' : ''}${d.toFixed(1)}pp`,
    field: '100 × pass_cmp / pass_att (season totals)',
    note: 'Recomputed from season pass_cmp/pass_att — never the stored weekly-sum rate.',
  },
  passerRating: {
    label: 'Passer rating', domain: [0, 158.3],
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'NFL passer-rating formula (season totals)',
    note: 'Standard NFL formula, recomputed from season counting stats.',
  },
  sacks: {
    label: 'Sacks taken', domain: null,
    format: v => String(Math.round(v)), deltaFormat: d => `${d >= 0 ? '+' : ''}${Math.round(d)}`,
    field: 'pass_sack (season total)',
    note: 'Season total, not a rate.',
  },
  rushShare: {
    label: 'Rush share', domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rush_att ÷ team rush_att (per-season-team)',
    note: "Share of the team's carries, attributed by per-season team.",
  },
  rbTargetShare: {
    label: 'Target share', domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rec_tgt ÷ team rec_tgt (per-season-team)',
    note: "RB's share of the team's targets, attributed by per-season team.",
  },
  yardsPerCarry: {
    label: 'Yards / carry', domain: null,
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'rush_yd ÷ rush_att',
    note: 'Rushing yards per carry, recomputed from season counts.',
  },
  targetShare: {
    label: 'Target share', domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rec_tgt ÷ team rec_tgt (per-season-team)',
    note: "Share of the team's targets, attributed by per-season team.",
  },
  airYardsShare: {
    label: 'Air yards share', domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rec_air_yd ÷ team rec_air_yd (per-season-team)',
    note: "Share of the team's air yards, attributed by per-season team.",
  },
  aDOT: {
    label: 'aDOT', domain: null,
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'rec_air_yd ÷ rec_tgt',
    note: 'Average depth of target, recomputed from season counts.',
  },
  snapShare: {
    label: 'Snap share', domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'off_snp ÷ tm_off_snp',
    note: 'Offensive snap share. off_snp is tracked from 2020 only — earlier seasons are void slots, never 0.',
  },
  rushRzShare: {
    label: 'Red-zone share', domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rush_rz_att ÷ team rush_rz_att (per-season-team)',
    note: "Share of the team's red-zone rush attempts, attributed by per-season team.",
  },
  recRzShare: {
    label: 'Red-zone share', domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rec_rz_tgt ÷ team rec_rz_tgt (per-season-team)',
    note: "Share of the team's red-zone targets, attributed by per-season team.",
  },
}

/**
 * Projects a sparse `[{season, [valueKey]}]` series onto `axisSeasons` (a flat, positional array
 * matching what SeriesBars expects) — a season absent from the series, or with a non-finite
 * value, becomes `null` (a void slot), never `0`.
 */
export function alignToAxis(entries, axisSeasons, valueKey = 'value') {
  const bySeason = new Map((entries ?? []).map(e => [e.season, e[valueKey]]))
  return axisSeasons.map(s => {
    const v = bySeason.get(s)
    return (v == null || !Number.isFinite(v)) ? null : v
  })
}

/**
 * One metric row's display data: the latest real (non-null) value on the axis, and the signed
 * delta vs. the FIRST season shown specifically (axis[0]) — not the latest-vs-prior trend
 * `computeMetricSummary` computes elsewhere. `null` when axis[0] itself has no value (no
 * baseline), rather than silently substituting a different season.
 */
export function buildMetricRow(id, alignedValues, axisSeasons) {
  const meta = METRIC_META[id]
  const coverageCount = alignedValues.filter(v => v != null).length

  let latest = null
  for (let i = alignedValues.length - 1; i >= 0; i--) {
    if (alignedValues[i] != null) { latest = { value: alignedValues[i], season: axisSeasons[i] }; break }
  }
  const first = alignedValues.length > 0 ? alignedValues[0] : null
  const delta = (first != null && latest != null) ? latest.value - first : null

  return { id, meta, values: alignedValues, latest, delta, coverageCount }
}

/**
 * Red-zone share series (dp-v2 Slice 4c §5) — RB reads rush_rz_att ÷ team rushRz; WR/TE reads
 * rec_rz_tgt ÷ team recRz. `historicalTeamTotals` is the projection-side
 * `computeHistoricalTeamTotals` output (unbiased — keeps retired ids, unlike the view-only
 * `buildTeamShareTotals` 4b already uses for the other shares), read only, never written. QB is
 * excluded entirely (its own-team red-zone pass-attempt share is ≈1.0, no signal — same reasoning
 * that gates it out of snap share). Player-season total ÷ team-season total, never a per-game
 * average; a zero or absent numerator/denominator omits the season (void slot), never `0`.
 * @param {object} careerStats
 * @param {string} playerId
 * @param {'QB'|'RB'|'WR'|'TE'} position
 * @param {object} historicalTeamTotals  computeHistoricalTeamTotals(careerStats, playerMap) output
 * @returns {Array<{season:number, value:number}>}
 */
export function buildRzShareSeries(careerStats, playerId, position, historicalTeamTotals) {
  if (!careerStats || (position !== 'RB' && position !== 'WR' && position !== 'TE')) return []

  const numeratorKey = position === 'RB' ? 'rush_rz_att' : 'rec_rz_tgt'
  const denomKey = position === 'RB' ? 'rushRz' : 'recRz'
  const seasons = Object.keys(careerStats).map(Number).sort()
  const result = []

  for (const season of seasons) {
    const seasonData = careerStats[season]?.[playerId]
    if (!seasonData || (seasonData.gamesPlayed ?? 0) < QUALIFYING_GP) continue

    const num = seasonData.stats?.[numeratorKey] ?? 0
    if (num <= 0) continue

    const team = resolvePlayerTeam({ careerStats }, playerId, season)
    if (!team) continue
    const denom = historicalTeamTotals?.[season]?.[team]?.[denomKey] ?? 0
    if (denom <= 0) continue

    const value = num / denom
    if (!Number.isFinite(value)) continue
    result.push({ season, value })
  }

  return result
}
