// View-only, pure. The pop-up's `§usage` season grid (usage-efficiency-redesign): one row per metric,
// one column per axis season plus the live season, each cell a value, the player's rank at his position
// and the percentile that colours it. Values come from marketWindowStats.buildWindowStats — one
// whole-league pass per column, read by every row — so the numbers match Market's. Never feeds
// projectedPPG, the dynasty score, a `factors` entry or a snapshot, and never scores the live season
// (CR-21): it reads live stat counts only. No React.
//
// Pool rule: every player in the column's season rows whose playerMap position is the card's position and
// who has at least the column's games gate — not filtered by roster, starter status or playerRows. QB rows
// also apply Market's pass-attempt volume floor.
//
// Metric metadata: formatters, the raw field expression (for DefinitionPopover), and a label + one-line
// note that come from metricGlossary.js.

import { QUALIFYING_GP } from './outlookConsistency'
import { GLOSSARY } from './metricGlossary'
import { buildWindowStats } from './marketWindowStats'
import { windowSeasonRows } from './marketWeekly'
import { METRIC_BY_ID } from './marketMetrics'
import { percentileOf } from './starterPercentiles'

const pctFmt = v => `${(v * 100).toFixed(1)}%`
const pctDeltaFmt = d => `${d >= 0 ? '+' : ''}${(d * 100).toFixed(1)}pp`
const numFmt = d => v => v.toFixed(d)
const numDeltaFmt = d => v => `${v >= 0 ? '+' : ''}${v.toFixed(d)}`

// label and note come from metricGlossary.js (note = the glossary definition); `field` stays here.
const g = gid => ({ glossaryId: gid, label: GLOSSARY[gid].label, note: GLOSSARY[gid].definition })

export const METRIC_META = {
  cmpPct: {
    ...g('cmpPct'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'pass_cmp ÷ pass_att (season totals)',
  },
  passerRating: {
    ...g('passerRating'),
    domain: [0, 158.3],
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'NFL passer-rating formula (season totals)',
  },
  rushShare: {
    ...g('carryShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'Σ rush_att ÷ Σ team rush_att over his played weeks (week team)',
  },
  rbTargetShare: {
    ...g('tgtShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'Σ rec_tgt ÷ Σ team rec_tgt over his played weeks (week team)',
  },
  yardsPerCarry: {
    ...g('ypc'),
    domain: null,
    format: numFmt(1), deltaFormat: numDeltaFmt(1),
    field: 'rush_yd ÷ rush_att',
  },
  targetShare: {
    ...g('tgtShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'Σ rec_tgt ÷ Σ team rec_tgt over his played weeks (week team)',
  },
  airYardsShare: {
    ...g('aySh'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'Σ rec_air_yd ÷ Σ team rec_air_yd over his played weeks (week team)',
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
    field: 'Σ rush_rz_att ÷ Σ team rush_rz_att over his played weeks (week team)',
  },
  recRzShare: {
    ...g('recRzShare'),
    domain: [0, 1],
    format: pctFmt, deltaFormat: pctDeltaFmt,
    field: 'Σ rec_rz_tgt ÷ Σ team rec_rz_tgt over his played weeks (week team)',
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

// Copy of qbTakeover.REG_SEASON_TEAM_GAMES (qbTakeover.js:14) — not imported: inSeasonEvidenceViewOnly.test.js
// pins qbTakeover's importers. Equality test U11.
export const LIVE_SEASON_GAMES = 17

// The grid's rows per position. Snap share and red-zone share are RB/WR/TE only: QB snap share is near-constant
// (~0.95) and would wrongly penalise injury-fill starters (usageMetrics.js SNAP_POSITIONS), and a QB's share of
// his own team's red-zone pass attempts is ≈1.0 and carries no information.
export const USAGE_GRID_ROWS = {
  QB: ['cmpPct', 'passerRating', 'sackPct'],
  RB: ['rushShare', 'rbTargetShare', 'yardsPerCarry', 'snapShare', 'rushRzShare'],
  WR: ['targetShare', 'airYardsShare', 'aDOT', 'snapShare', 'recRzShare'],
}
USAGE_GRID_ROWS.TE = USAGE_GRID_ROWS.WR

// Rows with a volume floor → the METRIC_BY_ID id whose minVolume they adopt.
export const ROW_MIN_VOLUME = { cmpPct: 'cmpPct', passerRating: 'passerRating', sackPct: 'sackRate' }

// Team games completed in the live season: the most P/D weeks on any row (the team played that week).
export function liveTeamGamesCompleted(currentSeasonTotals) {
  if (currentSeasonTotals?.complete !== true) return null
  const rows = Object.values(currentSeasonTotals.players ?? {})
  if (rows.length === 0) return null
  return rows.reduce((max, row) => {
    const n = (row?.weeklyStatus ?? []).filter(c => c === 'P' || c === 'D').length
    return Math.max(max, n)
  }, 0)
}

// The live games gate: the completed-season gate pro-rated to the team games played so far.
export function liveQualifyingGp(currentSeasonTotals) {
  const teamGames = liveTeamGamesCompleted(currentSeasonTotals)
  if (!teamGames) return null
  return { teamGames, minGp: Math.max(1, Math.ceil(QUALIFYING_GP / LIVE_SEASON_GAMES * teamGames)) }
}

// A careerStats id absent from playerMap has no position and is not in the pool.
export function qualifyingPool({ rows, playerMap, position, minGp }) {
  return Object.keys(rows ?? {})
    .filter(pid => playerMap?.[pid]?.position === position && (rows[pid]?.gamesPlayed ?? 0) >= minGp)
    .sort()
}

// One buildWindowStats entry → the metric's value.
export const METRIC_VALUE = {
  cmpPct: e => e?.rates.cmpPct,
  passerRating: e => e?.rates.passerRating,
  sackPct: e => e?.rates.sackRate,
  rushShare: e => e?.usage.carryShare,
  rbTargetShare: e => e?.usage.tgtShare,
  yardsPerCarry: e => e?.rates.ypc,
  targetShare: e => e?.usage.tgtShare,
  airYardsShare: e => e?.usage.aySh,
  aDOT: e => e?.rates.aDOT,
  snapShare: e => e?.usage.snapPct,
  rushRzShare: e => e?.usage.rzRushShare,
  recRzShare: e => e?.usage.rzTgtShare,
}

// 'up' = higher is better (coloured, rank 1 = highest); 'down' = lower is better (coloured, rank 1 = lowest,
// percentile inverted); 'neutral' = rank 1 = highest, no colour.
export const METRIC_DIRECTION = {
  cmpPct: 'up', passerRating: 'up', sackPct: 'down',
  rushShare: 'up', rbTargetShare: 'up', yardsPerCarry: 'up',
  targetShare: 'up', airYardsShare: 'up', aDOT: 'neutral',
  snapShare: 'up', rushRzShare: 'up', recRzShare: 'up',
}

const finite = v => (Number.isFinite(v) ? v : null)

// Competition rank ("1224") of `value` among `poolValues` (the row's ranked values, finite only).
export function rankInPool(value, poolValues, { ascending }) {
  if (!Number.isFinite(value)) return null
  const better = poolValues.filter(v => (ascending ? v < value : v > value)).length
  const p = percentileOf([...poolValues].sort((a, b) => a - b), value)
  return { rank: 1 + better, of: poolValues.length, percentile: p == null ? null : (ascending ? 1 - p : p) }
}

/**
 * The season grid. One buildWindowStats call per column; every row, the player's value and the pool's
 * values read the same Map.
 * @returns {{
 *   columns: Array<{ season:number, kind:'season'|'live', minGp:number, teamGames:number|null, poolSize:number }>,
 *   rows: Array<{ id:string, meta:object, direction:string, cells: Array<{ season:number, value:number|null,
 *     gp:number, qualified:boolean, lowVolume:boolean, rank:number|null, of:number|null, percentile:number|null }> }>
 * }}
 */
export function buildUsageGrid({
  playerId, position, seasons, careerStats, playerMap, gameLogsByYear, currentSeasonTotals, liveUsable,
}) {
  const ids = USAGE_GRID_ROWS[position] ?? []
  if (ids.length === 0) return { columns: [], rows: [] }
  const rows = ids.map(id => ({ id, meta: METRIC_META[id], direction: METRIC_DIRECTION[id], cells: [] }))

  const plan = [...(seasons ?? [])].sort().map(season => ({ season, kind: 'season', minGp: QUALIFYING_GP, teamGames: null }))
  const live = liveUsable ? liveQualifyingGp(currentSeasonTotals) : null
  if (live) plan.push({ season: currentSeasonTotals.season, kind: 'live', minGp: live.minGp, teamGames: live.teamGames })

  const columns = plan.map(col => {
    const { season, kind, minGp } = col
    // A completed column never reads the live rows.
    const liveTotals = kind === 'live' ? currentSeasonTotals : null
    // PROVISIONAL(heuristic): pop-up share rows credit a week to the season team when that season's gamelogs are not loaded/complete · makeWeekTeam's fallback · complete gamelogs for every axis season
    const stats = buildWindowStats({
      window: { id: kind === 'live' ? 'live' : String(season), kind, seasons: [season] },
      careerStats, currentSeasonTotals: liveTotals, playerMap, gameLogsByYear,
    })
    const sourceRows = windowSeasonRows(season, careerStats, liveTotals)
    const pool = qualifyingPool({ rows: sourceRows, playerMap, position, minGp })
    const gp = sourceRows[playerId]?.gamesPlayed ?? 0
    const qualified = pool.includes(playerId)

    for (const row of rows) {
      const floor = ROW_MIN_VOLUME[row.id] ? METRIC_BY_ID[ROW_MIN_VOLUME[row.id]].minVolume : null
      const meets = pid => {
        const e = stats.get(pid)
        return !floor || (e != null && (e.totals[floor.stat] ?? 0) / e.gp >= floor.perGame)
      }
      // PROVISIONAL(no-data): share slot is — for a season without weekly stats coverage · games-played share needs per-week team totals · weeklyStats on every offence row of that season
      const poolValues = pool.filter(meets).map(pid => finite(METRIC_VALUE[row.id](stats.get(pid)))).filter(v => v != null)
      const value = finite(METRIC_VALUE[row.id](stats.get(playerId)))
      const lowVolume = qualified && !meets(playerId)
      const ranked = qualified && !lowVolume
        ? rankInPool(value, poolValues, { ascending: row.direction === 'down' })
        : null
      row.cells.push({
        season, value, gp, qualified, lowVolume,
        rank: ranked?.rank ?? null, of: ranked?.of ?? null, percentile: ranked?.percentile ?? null,
      })
    }
    return { ...col, poolSize: pool.length }
  })

  return { columns, rows }
}
