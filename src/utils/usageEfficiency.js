// dp-v2 Slice 4b — Usage & efficiency section pure helpers. This slice renders EXISTING
// derivations (outlookPositionStats.buildPositionStatSeries, outlookUsage.buildUsageHistory) onto
// one shared season axis; it computes and reads no stat key itself. No React.
//
// Metric metadata: an explicit `domain` for genuinely bounded fraction/percentage metrics
// (a share series compressed into an auto min–max window is unreadable — task file §3.4), value/
// delta formatters, the raw field expression (for DefinitionPopover), and a label + one-line note that
// come from metricGlossary.js. Count-
// and ratio-shaped metrics (sacks, yardsPerCarry, aDOT) have no natural fixed ceiling — a guessed
// one risks clipping a real outlier — so they're left on SeriesBars' auto min–max instead.
//
// dp-v2 Slice 4c added `buildRzShareSeries` — the red-zone share row 4b deferred (its only
// denominator source, `computeHistoricalTeamTotals`, is threaded onto ProfileDataContext in this
// slice, not before). CR-11: a new app-side reader of `rec_rz_tgt`/`rush_rz_att`.

import { QUALIFYING_GP } from './outlookConsistency'
import { resolvePlayerTeam } from './playerTeam'
import { GLOSSARY } from './metricGlossary'

const pctFmt = v => `${(v * 100).toFixed(1)}%`
const pctDeltaFmt = d => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`
const numFmt = d => v => v.toFixed(d)
const numDeltaFmt = d => v => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

// label and note come from metricGlossary.js (note = the glossary definition); `field` stays here.
const g = gid => ({ glossaryId: gid, label: GLOSSARY[gid].label, note: GLOSSARY[gid].definition })

export const METRIC_META = {
  cmpPct: {
    ...g('cmpPct'),
    domain: [0, 100],
    format: v => `${v.toFixed(1)}%`, deltaFormat: d => `${d >= 0 ? '+' : ''}${d.toFixed(1)}pp`,
    field: '100 × pass_cmp / pass_att (season totals)',
  },
  passerRating: {
    ...g('passerRating'),
    domain: [0, 158.3],
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'NFL passer-rating formula (season totals)',
  },
  sacks: {
    ...g('sacks'),
    domain: null,
    format: v => String(Math.round(v)), deltaFormat: d => `${d >= 0 ? '+' : ''}${Math.round(d)}`,
    field: 'pass_sack (season total)',
  },
  rushShare: {
    ...g('rushShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rush_att ÷ team rush_att (per-season-team)',
  },
  rbTargetShare: {
    ...g('seasonTgtShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rec_tgt ÷ team rec_tgt (per-season-team)',
  },
  yardsPerCarry: {
    ...g('ypc'),
    domain: null,
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'rush_yd ÷ rush_att',
  },
  targetShare: {
    ...g('seasonTgtShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rec_tgt ÷ team rec_tgt (per-season-team)',
  },
  airYardsShare: {
    ...g('seasonAySh'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rec_air_yd ÷ team rec_air_yd (per-season-team)',
  },
  aDOT: {
    ...g('aDOT'),
    domain: null,
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'rec_air_yd ÷ rec_tgt',
  },
  snapShare: {
    ...g('snapPct'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'off_snp ÷ tm_off_snp',
  },
  rushRzShare: {
    ...g('rushRzShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rush_rz_att ÷ team rush_rz_att (per-season-team)',
  },
  recRzShare: {
    ...g('recRzShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'rec_rz_tgt ÷ team rec_rz_tgt (per-season-team)',
  },

  // ── Written for the retired dp-v2 Slice 5b Efficiency set; no Market consumer since the Efficiency
  // fact view (market-efficiency-fact-view.md); retained. Single-season values (pinned to
  // dataSeason), not the multi-season level+trend shape the entries above serve. ──
  epaPerAtt: {
    ...g('epaPerAtt'),
    domain: null,
    format: numFmt(2), deltaFormat: numDeltaFmt(2),
    field: 'Σ passingEpa ÷ Σ attempts (gamelogs, REG only)',
  },
  cpoe: {
    ...g('cpoe'),
    domain: null,
    format: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}pp`, deltaFormat: numDeltaFmt(1),
    field: 'Σ(passingCpoe × attempts) ÷ Σattempts (gamelogs, REG only)',
  },
  sackPct: {
    ...g('sackRate'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'pass_sack ÷ (pass_att + pass_sack) (season totals)',
  },
  ayPerAtt: {
    ...g('ayPerAtt'),
    domain: null,
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'pass_air_yd ÷ pass_att (season totals)',
  },
  rushEpaTotal: {
    ...g('rushEpaTotal'),
    domain: null,
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'Σ rushingEpa (gamelogs, REG only)',
  },
  carrySh: {
    ...g('gamelogCarryShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'Σ gamelogs.carries ÷ Σ teamcontext.off.rushPlays, matched (team, week) (REG only)',
  },
  rushEpaPerAtt: {
    ...g('rushEpaPerAtt'),
    domain: null,
    format: numFmt(2), deltaFormat: numDeltaFmt(2),
    field: 'Σ rushingEpa ÷ Σ carries (gamelogs, REG only)',
  },
  yac: {
    ...g('yaco'),
    domain: null,
    format: v => String(Math.round(v)), deltaFormat: d => `${d >= 0 ? '+' : ''}${Math.round(d)}`,
    field: 'rush_yac (season total)',
  },
  btkl: {
    ...g('btkl'),
    domain: null,
    format: v => String(Math.round(v)), deltaFormat: d => `${d >= 0 ? '+' : ''}${Math.round(d)}`,
    field: 'rush_btkl (season total)',
  },
  epaPerTgt: {
    ...g('epaPerTgt'),
    domain: null,
    format: numFmt(2), deltaFormat: numDeltaFmt(2),
    field: 'Σ receivingEpa ÷ Σ targets (gamelogs, REG only)',
  },
  racr: {
    ...g('racr'),
    domain: null,
    format: numFmt(2), deltaFormat: numDeltaFmt(2),
    field: 'advStats.byId[id].racr (nflverse advanced receiving, served precomputed)',
  },
  drops: {
    ...g('drops'),
    domain: null,
    format: v => String(Math.round(v)), deltaFormat: d => `${d >= 0 ? '+' : ''}${Math.round(d)}`,
    field: 'rec_drop (season total)',
  },

  // dp-v2 advstats-live-season-column — written for the retired dp-v2 Slice 5b Efficiency set; no
  // Market consumer since the Efficiency fact view (market-efficiency-fact-view.md); retained.
  racrLive: {
    ...g('racr'),
    domain: null,
    format: numFmt(2), deltaFormat: numDeltaFmt(2),
    field: 'live-season advstats racr (nflverse advanced receiving, served precomputed), exact-year load',
    // MIN_TARGETS (src/utils/seasonEfficiency.js) is the EPA/target floor, reused here so the
    // live column shares one "per-target rate" floor with the rest of the set.
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
