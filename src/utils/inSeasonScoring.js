// The one named seam through which the live season reaches scoring: the displayed season projection
// (applyInSeasonProjection), the dynasty score's latest level for the standard and SHORT-recent
// populations (buildInSeasonLevel → computeDynastyScore's inSeasonLevel) and the prospect score of
// years_exp 0/1 players (buildProspectLevel → computeDynastyScore's prospectLevel).
// computeNextSeasonProjection and the snapshot's `projection` never see it.
// in-season-evidence-2b-1-constants-snapshot.md §3, in-season-evidence-2b-2-scoring.md §2. Pure, no React, no I/O.
//
// Imports ./inSeasonConstants, ./qbTakeover, ./qbTakeoverConstants and ./fantasyPoints only (P6b Stage B:
// buildQbLiveStates). It must not import ./inSeasonEvidence (Market-only, guarded) or anything from src/api/.
// Guarded by src/__tests__/inSeasonEvidenceViewOnly.test.js.

import {
  K_ROS_POINTS, K_ROS_POINTS_ROOKIE0, K_ROS_POINTS_ROOKIE1P, K_ROS_POINTS_SHORT,
  K_DYN_POINTS_HISTORY, K_DYN_POINTS_ROOKIE0, K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_SHORT,
  K_DYN_PROSPECT_A_YE1, PROSPECT_PRIOR_KIND, PRIOR_MODEL_FROM,
} from './inSeasonConstants'
import { dpCode, iqCode, priorPPG, incPPG, expectedStarts, REG_SEASON_TEAM_GAMES } from './qbTakeover'
import { QB_HAZARD, QB_SAT_LONGER_DISCOUNT, QB_SAT_LONGER_BAND } from './qbTakeoverConstants'
import { calculateFantasyPoints } from './fantasyPoints'

// The live-state builder supplies dp/og/rk/iq (+ ps) only; a re-pin that adopts bn/wk/wp/dg must build it first (CR-27).
const QB_LIVE_BUILT_FEATURES = ['dp', 'og', 'rk', 'iq', 'ps']
for (const f of QB_HAZARD.features) {
  if (!QB_LIVE_BUILT_FEATURES.includes(f)) {
    throw new Error(`[inSeasonScoring] pinned QB hazard feature "${f}" is not built by buildQbLiveStates — build it before re-pinning`)
  }
}

export const IN_SEASON_SCORING_POSITIONS = ['QB', 'RB', 'WR', 'TE']

const r2 = x => Math.round(x * 100) / 100
const r4 = x => Math.round(x * 10000) / 10000
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const SNAPSHOT_PATH_RE = /^snapshots\/(\d{4}-\d{2}-\d{2})\.json$/

// Same rule as inSeasonEvidence.usableLiveSeason. Copied because that module is Market-only and Market may not
// import this seam. Both copies stay, kept identical by inSeasonScoring.test.js.
export function usableLiveSeason(currentSeasonTotals, dataSeason) {
  const s = currentSeasonTotals?.season
  return currentSeasonTotals?.complete === true && Number.isFinite(s)
    && Number.isFinite(dataSeason) && s > dataSeason
}

// (prior·k + obs·n)/(k+n). Null rule, in order (Phase 1's `blend`): prior non-finite → null;
// n not a finite integer ≥ 0 or k not finite ≥ 0 → null; n === 0 → { value: prior, weight: 0 };
// obs non-finite (n > 0) → null. weight = n/(n+k).
export function posteriorOf(prior, obs, n, k) {
  if (!Number.isFinite(prior)) return null
  if (!Number.isInteger(n) || n < 0 || !Number.isFinite(k) || k < 0) return null
  if (n === 0) return { value: prior, weight: 0 }
  if (!Number.isFinite(obs)) return null
  const weight = n / (n + k)
  const value = (prior * k + obs * n) / (k + n)
  return Number.isFinite(value) ? { value, weight } : null
}

// ─── Population ──────────────────────────────────────────────────────────────

// Mirrors the verdict's Coverage table (data `classifyArm`, `enumerateCandidates`), transposed onto the
// app's own routing, which is what data `rookiePathStateAt` reproduces. Two definitions transposed:
// arm P = veteran and S-1 gp ≥ 8 ('standard'); the X groups as in §3.3 of the data 2a task
// (ROOKIE0 / ROOKIE1P / SHORT).
// `qualifying` is exactly computeNextSeasonProjection's qualifying rule (seasonProjection.js:584-603),
// re-implemented and not imported; the rookie route is its `:612`.
export function classifyInSeasonPopulation({ playerId, careerStats, dataSeason, yearsExp }) {
  const seasons = Object.keys(careerStats ?? {})
  let anyRow = false
  let qualifying = 0
  for (const s of seasons) {
    const d = careerStats[s]?.[playerId]
    if (d == null) continue
    anyRow = true
    if (Number.isFinite(d.gamesPlayed) && d.gamesPlayed >= 8 && Number.isFinite(d.fantasyPoints)) qualifying++
  }
  if (qualifying === 0 || (yearsExp != null && yearsExp <= 1)) return anyRow ? 'ROOKIE1P' : 'ROOKIE0'
  const gp = careerStats?.[dataSeason]?.[playerId]?.gamesPlayed
  return Number.isFinite(gp) && gp >= 8 ? 'standard' : 'SHORT'
}

// ─── Frozen-prior gates ──────────────────────────────────────────────────────

// manifestPaths: string[] from listManifestPaths('snapshots/'). kickoffDate: nflState.season_start_date.
// Strict string order on UTC date keys needs no timezone reasoning; at most one day of freshness is lost.
export function selectFrozenPriorCandidate({ manifestPaths, kickoffDate, epoch = PRIOR_MODEL_FROM }) {
  if (typeof kickoffDate !== 'string' || !DATE_KEY_RE.test(kickoffDate)) return { dateKey: null, reason: 'no-kickoff' }
  let best = null
  for (const p of manifestPaths ?? []) {
    const m = SNAPSHOT_PATH_RE.exec(p)
    if (!m) continue
    const dateKey = m[1]
    if (dateKey < kickoffDate && (best === null || dateKey > best)) best = dateKey
  }
  if (best === null) return { dateKey: null, reason: 'no-snapshot' }
  if (best < epoch) return { dateKey: best, reason: 'model-changed' }
  return { dateKey: best, reason: null }
}

// → null | 'league' | 'season' | 'basis'. Absent (a pre-rescore capture), 'half_ppr', 'mixed' and 'unknown'
// are all refused. No pre-rescore capture passes the model gate, so the basis check guards later captures only.
export function checkFrozenSnapshot(env, { leagueId, liveSeason, projectionBasis }) {
  if (env?.leagueId !== leagueId) return 'league'
  if (env?.targetSeason !== liveSeason) return 'season'
  if (env?.projectionBasis !== 'league' || projectionBasis !== 'league') return 'basis'
  return null
}

// Keeps only finite players[id].projection.projectedPPG, plus the finite projection.factors.qbStarterPPG
// (the frozen QB starter prior, CR-26) and which of the kept rows were `qbTakeoverBasis: 'chain'` in the
// capture (`qbChain`, P11) — the cache never holds the 2.2 MB raw file.
export function trimFrozenSnapshot(snapshot) {
  const players = {}
  const starterPPG = {}
  const qbChain = {}
  for (const [id, p] of Object.entries(snapshot?.players ?? {})) {
    const v = p?.projection?.projectedPPG
    if (Number.isFinite(v)) {
      players[id] = v
      if (p.projection.factors?.qbTakeoverBasis === 'chain') qbChain[id] = true
    }
    const q = p?.projection?.factors?.qbStarterPPG
    if (Number.isFinite(q)) starterPPG[id] = q
  }
  return {
    env: {
      capturedAt: snapshot?.capturedAt,
      leagueId: snapshot?.leagueId,
      targetSeason: snapshot?.targetSeason,
      projectionBasis: snapshot?.projectionBasis ?? null,
    },
    players,
    starterPPG,
    qbChain,
  }
}

// ─── Posterior records ───────────────────────────────────────────────────────

const ROS_K = { standard: K_ROS_POINTS, ROOKIE0: K_ROS_POINTS_ROOKIE0, ROOKIE1P: K_ROS_POINTS_ROOKIE1P, SHORT: K_ROS_POINTS_SHORT }
const NEXT_K = { standard: K_DYN_POINTS_HISTORY, ROOKIE0: K_DYN_POINTS_ROOKIE0, ROOKIE1P: K_DYN_POINTS_ROOKIE1P, SHORT: K_DYN_POINTS_SHORT }

// The completed-season row a player's history prior reads: 'standard' → the dataSeason row; 'SHORT' → the
// dataSeason − 1 row when it qualifies (gp ≥ 8, finite fantasyPoints) — a SHORT-recent player, the slot
// `historyPriorOf`'s L = S-2 measures; anything else (incl. SHORT-stale, rookies) → null.
export function historyRowOf({ careerStats, dataSeason, id, population }) {
  if (population === 'standard') return careerStats?.[dataSeason]?.[id] ?? null
  if (population === 'SHORT') {
    const row = careerStats?.[dataSeason - 1]?.[id]
    return row && Number.isFinite(row.gamesPlayed) && row.gamesPlayed >= 8 && Number.isFinite(row.fantasyPoints) ? row : null
  }
  return null
}

// Standard and SHORT-recent dynasty-side posterior, shared by buildScoringPosteriors (the record's `next`) and
// buildInSeasonLevel (the dynasty level), so the two can never disagree. prior = raw S-1 PPG
// (`row` = careerStats[dataSeason][id], gp ≥ 8 by population); n and obs come from the live row.
// → null | { prior, k, weight, value }, rounded exactly as the record stores them.
function historyNextOf({ row, live, pos }) {
  const n = live && Number.isFinite(live.gamesPlayed) && live.gamesPlayed > 0 ? live.gamesPlayed : 0
  const obs = n > 0 && Number.isFinite(live.fantasyPoints) ? live.fantasyPoints / n : null
  const prior = row && Number.isFinite(row.gamesPlayed) && row.gamesPlayed > 0 ? row.fantasyPoints / row.gamesPlayed : NaN
  const k = K_DYN_POINTS_HISTORY[pos]
  const p = posteriorOf(prior, obs, n, k)
  return p == null ? null : { prior: r2(prior), k, weight: r4(p.weight), value: r2(p.value) }
}

// → null | Map<playerId, InSeasonRecord>. `frozenPrior` is the loader result (src/api/frozenPrior.js):
// { status: 'ok', dateKey, players, starterPPG, qbChain } or { status, reason, dateKey? }; every status but 'ok' yields the
// live prior with the reason carried through.
//
// P6b: `qbLiveStates` (buildQbLiveStates, null while loading) switches a QB who is not his team's week-1
// starter onto the start chain — evidence is his STARTS (D3), the prior is the starter prior, and `ros` is
// at the chain's expected share of the remaining team games; the record gains `start`.
// P11: on a frozen record, whether the prior is share-weighted is the capture's own `qbTakeoverBasis`
// (`frozenPrior.qbChain`), never the live one.
export function buildScoringPosteriors({
  seasonProjections, careerStats, dataSeason, playerMap, currentSeasonTotals, projectionBasis, frozenPrior,
  qbLiveStates = null,
}) {
  if (!usableLiveSeason(currentSeasonTotals, dataSeason)) return null
  if (projectionBasis !== 'league' && projectionBasis !== 'half_ppr') return null

  const frozenOk = frozenPrior?.status === 'ok'
  const out = new Map()

  for (const id of Object.keys(seasonProjections ?? {})) {
    const info = playerMap?.[id]
    const pos = info?.position
    if (!IN_SEASON_SCORING_POSITIONS.includes(pos)) continue

    const live = currentSeasonTotals.players?.[id] ?? null
    if (live && live.scoringBasis !== projectionBasis) continue

    const n = live && Number.isFinite(live.gamesPlayed) && live.gamesPlayed > 0 ? live.gamesPlayed : 0
    const obs = n > 0 && Number.isFinite(live.fantasyPoints) ? live.fantasyPoints / n : null

    let projPrior, frozen, priorSource, notFrozenReason
    const frozenValue = frozenOk ? frozenPrior.players?.[id] : undefined
    if (Number.isFinite(frozenValue)) {
      projPrior = frozenValue
      frozen = true
      priorSource = 'snapshot:' + frozenPrior.dateKey
      notFrozenReason = null
    } else {
      projPrior = seasonProjections[id].projectedPPG
      frozen = false
      priorSource = 'live'
      notFrozenReason = frozenOk ? 'absent' : (frozenPrior?.reason ?? 'unavailable')
    }

    const population = classifyInSeasonPopulation({
      playerId: id, careerStats, dataSeason, yearsExp: info.years_exp ?? null,
    })

    const kRos = ROS_K[population][pos]

    // QB starter prior (P6b, plan-gate flags 4 and 8): frozen `starterPPG` on a frozen record, else the live
    // `factors.qbStarterPPG`, else projPrior. Equals projPrior (to rounding) on every row the share never touched,
    // except a `yearsExp` 0 rookie QB with known draft capital, whose starter prior is the pinned rookie group level (P12b).
    let starterPrior = projPrior
    let startPriorSource = 'projection'
    const qs = pos === 'QB' ? (qbLiveStates?.get(id) ?? null) : null
    const startState = qs && (qs.kind === 'backup' || qs.kind === 'starter') ? qs : null
    if (pos === 'QB') {
      const frozenStarter = frozen ? frozenPrior.starterPPG?.[id] : undefined
      const liveStarter = seasonProjections[id].factors?.qbStarterPPG
      if (Number.isFinite(frozenStarter)) { starterPrior = frozenStarter; startPriorSource = 'frozen' }
      else if (Number.isFinite(liveStarter)) { starterPrior = liveStarter; startPriorSource = 'live' }
    }
    // A preseason-`chain` QB with no live state: omit the record (never blend a per-team-game prior with
    // per-game-played evidence that includes relief and kneel-down games).
    if (pos === 'QB' && !qs && seasonProjections[id].factors?.qbTakeoverBasis === 'chain') continue

    let ros, start = null, nonStartPrior = projPrior
    if (startState) {
      const sObs = startState.starts > 0 ? startState.startPoints / startState.starts : null
      const p = posteriorOf(starterPrior, sObs, startState.starts, kRos)
      if (p) {
        ros = { weight: p.weight, value: p.value * startState.fraction }
        start = {
          kind: startState.kind, fraction: r4(startState.fraction), expected: r4(startState.expected),
          remaining: startState.remaining, pNext: r4(startState.pNext), starts: startState.starts,
          seasonPoints: r2(startState.seasonPoints), starterPrior, starterValue: r2(p.value), priorSource: startPriorSource,
        }
      } else ros = null
    } else {
      // A share-weighted prior (P6b fix pass 1; P11): the prior is a per-team-game chain value when the row it
      // came from was `chain` — the frozen capture's basis on a frozen record, the live basis on a live one.
      // Then the starter prior is the right base for his real starter scoring; every other row keeps projPrior.
      // A live-`chain` row also takes the starter prior (fix pass 1's live-`original` path, unchanged).
      const liveChain = seasonProjections[id].factors?.qbTakeoverBasis === 'chain'
      const priorChain = frozen ? frozenPrior.qbChain?.[id] === true : liveChain
      nonStartPrior = pos === 'QB' && (priorChain || liveChain) ? starterPrior : projPrior
      ros = posteriorOf(nonStartPrior, obs, n, kRos)
    }

    // `next` for standard and SHORT-recent uses the history prior: the dynasty score builds its level from
    // completed-season PPG, not projectedPPG. K_DYN_POINTS_HISTORY (arm R, raw completed-season PPG prior)
    // is the k measured for exactly that base, and a projection-prior shift would carry the prior's known
    // optimism (c ≈ 0.80–0.86) into every veteran's dynasty score. SHORT-recent's `next` is the level it
    // feeds. A rookie's `next` (and SHORT-stale's) is the KTC-inclusive projection posterior, recorded for
    // grading, and is NOT the dynasty prior (buildProspectLevel's market-neutral recompute).
    const historyRow = historyRowOf({ careerStats, dataSeason, id, population })
    let next
    if (historyRow || population === 'standard') {
      const h = historyNextOf({ row: historyRow, live, pos })
      next = h && { priorKind: 'history', prior: h.prior, k: h.k, weight: h.weight, value: h.value }
    } else {
      const kNext = NEXT_K[population][pos]
      const nextPrior = pos === 'QB' ? starterPrior : projPrior
      const p = posteriorOf(nextPrior, obs, n, kNext)
      next = p && { priorKind: 'projection', prior: r2(nextPrior), k: kNext, weight: r4(p.weight), value: r2(p.value) }
    }
    if (ros == null || next == null) continue

    out.set(id, {
      season: currentSeasonTotals.season,
      n,
      population,
      frozen,
      priorSource,
      notFrozenReason,
      ros:  { prior: start ? starterPrior * startState.fraction : nonStartPrior, k: kRos, weight: r4(ros.weight), value: r2(ros.value) },
      next,
      ...(start ? { start } : {}),
    })
  }
  return out
}

// ─── The dynasty level ───────────────────────────────────────────────────────

// → Map<playerId, number>: the history posterior (`next.value`) for every standard-population or
// SHORT-recent skill player with a live row on the projection's scoring basis and n > 0. n = 0 ids are omitted — the dynasty score
// then reads its own unchanged value. Pipeline-independent (needs no projection), so it can run before
// playerRows. Invariant, tested: level.get(id) === scoringPosteriors.get(id).next.value where both exist.
export function buildInSeasonLevel({ careerStats, dataSeason, playerMap, currentSeasonTotals, projectionBasis }) {
  const out = new Map()
  if (!usableLiveSeason(currentSeasonTotals, dataSeason)) return out
  if (projectionBasis !== 'league' && projectionBasis !== 'half_ppr') return out

  const ids = new Set([...Object.keys(careerStats?.[dataSeason] ?? {}), ...Object.keys(careerStats?.[dataSeason - 1] ?? {})])
  for (const id of ids) {
    const info = playerMap?.[id]
    const pos = info?.position
    if (!IN_SEASON_SCORING_POSITIONS.includes(pos)) continue
    const population = classifyInSeasonPopulation({ playerId: id, careerStats, dataSeason, yearsExp: info.years_exp ?? null })
    if (population !== 'standard' && population !== 'SHORT') continue
    const row = historyRowOf({ careerStats, dataSeason, id, population })
    if (!row) continue
    const live = currentSeasonTotals.players?.[id]
    if (!live || live.scoringBasis !== projectionBasis) continue
    if (!(Number.isFinite(live.gamesPlayed) && live.gamesPlayed > 0) || !Number.isFinite(live.fantasyPoints)) continue
    const h = historyNextOf({ row, live, pos })
    if (h) out.set(id, h.value)
  }
  return out
}

// ─── The prospect level (in-season-evidence-2c-wiring §3.5) ──────────────────

// → Map<playerId, { priorKind, prior, n, obs, k }>, nothing rounded — computeDynastyScore's `prospectLevel`,
// read only for years_exp 0/1 prospects. Arm B as measured: a 'projection' entry starts from the
// market-neutral rookie projection (rookieDynastyPriors, prospectPrior.js) at the 2a K_DYN_POINTS_ROOKIE0 /
// K_DYN_POINTS_ROOKIE1P; a 'position' entry (PROSPECT_PRIOR_KIND — second-year WRs, the two-season check,
// §1b) keeps the position-prior start and takes K_DYN_PROSPECT_A_YE1. Every eligible id gets an entry, n = 0
// when there is no usable live row, so the prior swap applies all year.
//
// P6b: a rookie QB flagged `satLonger` by buildQbLiveStates (his starts trail the preseason chain's by more than
// QB_SAT_LONGER_BAND games) has his 'projection' prior × QB_SAT_LONGER_DISCOUNT; the entry carries `satLongerDiscount`.
export function buildProspectLevel({ rookieDynastyPriors, careerStats, dataSeason, playerMap, currentSeasonTotals, projectionBasis, qbLiveStates = null }) {
  const out = new Map()
  const liveOk = usableLiveSeason(currentSeasonTotals, dataSeason)
    && (projectionBasis === 'league' || projectionBasis === 'half_ppr')
  for (const id of Object.keys(rookieDynastyPriors ?? {})) {
    const info = playerMap?.[id]
    const pos = info?.position
    if (!IN_SEASON_SCORING_POSITIONS.includes(pos)) continue
    const yearsExp = info.years_exp
    if (yearsExp !== 0 && yearsExp !== 1) continue
    const kind = PROSPECT_PRIOR_KIND[yearsExp]?.[pos]
    let prior = null
    let k
    if (kind === 'projection') {
      prior = rookieDynastyPriors[id]
      if (!Number.isFinite(prior)) continue
      const pop = classifyInSeasonPopulation({ playerId: id, careerStats, dataSeason, yearsExp })
      if (pop !== 'ROOKIE0' && pop !== 'ROOKIE1P') continue
      k = NEXT_K[pop][pos]
    } else if (kind === 'position') {
      if (!Number.isFinite(rookieDynastyPriors[id])) continue
      k = K_DYN_PROSPECT_A_YE1[pos]
    } else continue
    let satLongerDiscount
    if (kind === 'projection' && pos === 'QB' && qbLiveStates?.get(id)?.satLonger === true) {
      // PROVISIONAL(heuristic): rookie-QB sat-longer prospect discount · Q5 report-only (n=15, confounded), D1 · a data-side Q5 replication on the app's definition (D-60)
      prior *= QB_SAT_LONGER_DISCOUNT
      satLongerDiscount = QB_SAT_LONGER_DISCOUNT
    }
    let n = 0
    let obs = null
    if (liveOk) {
      const live = currentSeasonTotals.players?.[id]
      if (live && live.scoringBasis === projectionBasis && Number.isInteger(live.gamesPlayed) && live.gamesPlayed > 0 && Number.isFinite(live.fantasyPoints)) {
        n = live.gamesPlayed
        obs = live.fantasyPoints / n
      }
    }
    out.set(id, { priorKind: kind, prior, n, obs, k, ...(satLongerDiscount != null ? { satLongerDiscount } : {}) })
  }
  return out
}

// ─── The QB start chain's live state (qb-takeover-wiring-b §3.2) ─────────────

const pidLess = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// → Map<`${team}|${week}`, { pid, dropbacks, attempts }>: each team game's primary passer, from Sleeper weekly
// rows (`weeks` = [{ week, rows }], the loader's shape). dropbacks = pass_att + pass_sack (absent → 0), must be
// > 0; ties: more attempts, then the smaller pid (data `betterPasser`). team = the row's own team (Sleeper domain).
export function primaryPassersByTeamWeek(weeks) {
  const out = new Map()
  for (const { week, rows } of weeks ?? []) {
    for (const [pid, row] of Object.entries(rows ?? {})) {
      if (pid.startsWith('TEAM_') || !row?.stats || row.team == null) continue
      const attempts = row.stats.pass_att ?? 0
      const dropbacks = attempts + (row.stats.pass_sack ?? 0)
      if (!(dropbacks > 0)) continue
      const key = `${row.team}|${week}`
      const cur = out.get(key)
      const better = !cur || dropbacks > cur.dropbacks
        || (dropbacks === cur.dropbacks && (attempts > cur.attempts || (attempts === cur.attempts && pidLess(pid, cur.pid) < 0)))
      if (better) out.set(key, { pid, dropbacks, attempts })
    }
  }
  return out
}

function medianOf(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// → Map<playerId, QbLiveState>; an empty Map unless qbWeekly.complete && no failed week (a missing week breaks the
// team-game index and the streaks — omit, never approximate). The data repo's `buildRows`/`definitions`, transposed
// onto Sleeper weekly rows (CR-27). `preseason` = buildPreseasonQbShares' map (the D1 baseline).
// QbLiveState = { kind: 'original'|'starter'|'backup', team, gamesPlayed, remaining, pNext, expected, fraction,
//   starts, startPoints, seasonPoints, residual, satLonger } — original carries null pNext/expected/fraction.
// `pNext` is the chain's probability that he is his team's primary passer in the next game.
export function buildQbLiveStates({ qbWeekly, playerMap, careerStats, dataSeason, scoringSettings, preseason }) {
  const out = new Map()
  if (!qbWeekly?.complete || (qbWeekly.failedWeeks ?? []).length > 0) return out
  const weeks = [...qbWeekly.weeks].sort((a, b) => a.week - b.week)
  const rowsByWeek = new Map(weeks.map(w => [w.week, w.rows ?? {}]))

  // 1. The games each team played: a TEAM_<T> row with a non-null opponent.
  const gamesOf = new Map()                       // team → ascending weeks
  for (const { week, rows } of weeks) {
    for (const [id, row] of Object.entries(rows ?? {})) {
      if (!id.startsWith('TEAM_') || row?.opponent == null) continue
      const T = id.slice('TEAM_'.length)
      if (!gamesOf.has(T)) gamesOf.set(T, [])
      gamesOf.get(T).push(week)
    }
  }

  // 2. Primaries per team game; the incumbent is the primary of the team's LAST game.
  const primaries = primaryPassersByTeamWeek(weeks)
  const startsOf = new Map()                      // pid → weeks he was a team's primary
  for (const [key, v] of primaries) {
    const w = Number(key.slice(key.lastIndexOf('|') + 1))
    if (!startsOf.has(v.pid)) startsOf.set(v.pid, [])
    startsOf.get(v.pid).push(w)
  }
  const primaryOf = (T, w) => primaries.get(`${T}|${w}`)?.pid ?? null
  const scoredRow = (pid, w) => {
    const row = rowsByWeek.get(w)?.[pid]
    return row?.stats ? calculateFantasyPoints(row.stats, scoringSettings ?? {}) : null
  }

  // 3. iq: each incumbent's incPPG over his league-scored games so far, relative to the all-teams median.
  const incByTeam = new Map()
  const incPPGByTeam = new Map()
  for (const [T, G] of gamesOf) {
    const inc = primaryOf(T, G[G.length - 1])
    if (inc == null) continue
    incByTeam.set(T, inc)
    const obs = []
    for (const { rows } of weeks) {
      const row = rows?.[inc]
      if (row?.stats && row.stats.gp >= 1) obs.push(calculateFantasyPoints(row.stats, scoringSettings ?? {}))
    }
    incPPGByTeam.set(T, incPPG(priorPPG(careerStats?.[dataSeason]?.[inc]), obs))
  }
  const median = medianOf([...incPPGByTeam.values()].filter(v => v != null))

  for (const [x, info] of Object.entries(playerMap ?? {})) {
    if (info?.position !== 'QB') continue
    const T = info.team ?? null
    if (T == null || T === 'FA') continue
    const G = gamesOf.get(T)
    const inc = incByTeam.get(T)
    if (!G || !G.length || inc == null) continue
    const g = G.length
    const remaining = REG_SEASON_TEAM_GAMES - g
    if (!(remaining > 0)) continue

    const P1 = primaryOf(T, G[0])
    const rk = info.years_exp === 0 ? 1 : 0
    const xStarts = startsOf.get(x) ?? []
    let startPoints = 0
    for (const w of xStarts) startPoints += scoredRow(x, w) ?? 0
    let seasonPoints = 0
    for (const { rows } of weeks) {
      const row = rows?.[x]
      if (row?.stats && row.stats.gp >= 1) seasonPoints += calculateFantasyPoints(row.stats, scoringSettings ?? {})
    }

    let kind, r = null
    // the chain has no injury input; an injured week-1 starter keeps the starter path (P6b fix pass 1)
    const injured = typeof info.injury_status === 'string' && info.injury_status !== ''
    if (x === inc && x === P1) kind = 'original'
    else if (x === P1 && x !== inc && injured) kind = 'original'
    else if (x === inc) {
      kind = 'starter'
      let s = 0
      for (let i = G.length - 1; i >= 0 && primaryOf(T, G[i]) === x; i--) s++
      r = expectedStarts({
        start: { role: 'S', ps: 1, c: 0, s, g: g + 1, hazardCodes: { dp: 0, og: 0, rk, iq: 3 }, stickCodes: {} },
        remaining,
      })
    } else {
      kind = 'backup'
      const hazardCodes = { dp: dpCode(info.depth_chart_order ?? null), og: x === P1 ? 1 : 0, rk, iq: iqCode(incPPGByTeam.get(T), median) }
      r = expectedStarts({
        start: { role: 'B', ps: xStarts.length > 0 ? 1 : 0, c: 0, g: g + 1, hazardCodes, stickCodes: {} },
        remaining,
      })
    }

    // D1 (sat longer): a rookie QB the preseason chain called a backup, whose starts trail its expected starts.
    let residual = null, satLonger = null
    const pre = preseason?.[x]
    if (rk === 1 && pre?.role === 'backup') {
      let expectedSoFar = 0
      for (let i = 0; i < g; i++) expectedSoFar += pre.perGame[i] ?? 0
      residual = xStarts.length - expectedSoFar
      // PROVISIONAL(heuristic): sat-longer flag from a fixed games band · Q5 report-only (n=15, confounded), D1 · a data-side Q5 replication on the app's definition (D-60)
      satLonger = residual < -QB_SAT_LONGER_BAND
    }

    out.set(x, {
      kind, team: T, gamesPlayed: g, remaining,
      pNext: r ? r.perGame[0] : null, expected: r ? r.expected : null, fraction: r ? r.fraction : null,
      starts: xStarts.length, startPoints, seasonPoints, residual, satLonger,
    })
  }
  return out
}

// ─── The displayed season projection ─────────────────────────────────────────

const r1 = x => Math.round(x * 10) / 10

// → seasonProjections itself when there are no posteriors; otherwise a new object in which every id with a
// record (and a finite ros.value) is replaced by a copy carrying the rest-of-season rate as `projectedPPG`,
// `projectedTotalPts` = points scored so far + that rate × remaining projected games, and `inSeason`.
// `projectedGames` stays the full-season figure (the frozen prior carries PPG only). Never mutates inputs;
// ids without a record keep the same object reference.
export function applyInSeasonProjection(seasonProjections, scoringPosteriors, currentSeasonTotals) {
  if (!scoringPosteriors || scoringPosteriors.size === 0) return seasonProjections
  const out = { ...seasonProjections }
  for (const [id, record] of scoringPosteriors) {
    const proj = seasonProjections?.[id]
    if (!proj || !Number.isFinite(record?.ros?.value)) continue
    const projectedPPG = r1(record.ros.value)
    if (record.start) {
      // A QB on the start chain: points so far come from the same weekly rows the chain counts (plan-gate flag 5),
      // the rest is his starter rate × the chain's expected starts. Season totals' fantasyPoints is not read.
      const s = record.start
      out[id] = { ...proj, projectedPPG, projectedTotalPts: r1(s.seasonPoints + s.starterValue * s.expected), inSeason: record }
      continue
    }
    const live = currentSeasonTotals?.players?.[id]
    // League-rescored; the record's existence already implies the basis matched.
    const pointsSoFar = Number.isFinite(live?.fantasyPoints) ? live.fantasyPoints : 0
    const remainingGames = Math.max(0, proj.projectedGames - record.n)
    out[id] = { ...proj, projectedPPG, projectedTotalPts: r1(pointsSoFar + projectedPPG * remainingGames), inSeason: record }
  }
  return out
}

// ─── QB-quality firewall (in-season-evidence-2b-2 §4.2a, fix pass 1 item 1) ──────────────────
// Both computeQBQualityByTeam maps must be built from dynasty scores computed without the live level:
// a QB's own level-free score is substituted wherever App.jsx pushed one as `dynastyScoreBase`
// (every QB, once any level exists at all — the peer pool couples them). Rows without a
// `dynastyScoreBase` pass through unchanged.
export function withBaseDynastyScores(rows) {
  return rows.map(r => (r.dynastyScoreBase ? { ...r, dynastyScore: r.dynastyScoreBase } : r))
}
