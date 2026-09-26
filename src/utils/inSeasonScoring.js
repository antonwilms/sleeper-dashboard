// The one named seam through which the live season reaches the season projection and the dynasty
// score (2b-2). In 2b-1 its output reaches only the snapshot field.
// in-season-evidence-2b-1-constants-snapshot.md §3. Pure, no React, no I/O.
//
// Imports ./inSeasonConstants only. It must not import ./inSeasonEvidence (Market-only, guarded) or
// anything from src/api/. Guarded by src/__tests__/inSeasonEvidenceViewOnly.test.js.

import {
  K_ROS_POINTS, K_ROS_POINTS_ROOKIE0, K_ROS_POINTS_ROOKIE1P, K_ROS_POINTS_SHORT,
  K_DYN_POINTS_HISTORY, K_DYN_POINTS_ROOKIE0, K_DYN_POINTS_ROOKIE1P, K_DYN_POINTS_SHORT,
  PRIOR_MODEL_FROM,
} from './inSeasonConstants'

export const IN_SEASON_SCORING_POSITIONS = ['QB', 'RB', 'WR', 'TE']

const r2 = x => Math.round(x * 100) / 100
const r4 = x => Math.round(x * 10000) / 10000
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/
const SNAPSHOT_PATH_RE = /^snapshots\/(\d{4}-\d{2}-\d{2})\.json$/

// Same rule as inSeasonEvidence.usableLiveSeason. Copied because that module is Market-only and Market may not
// import this seam, so both copies stay; inSeasonScoring.test.js asserts they agree.
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

// Keeps only finite players[id].projection.projectedPPG — the cache never holds the 2.2 MB raw file.
export function trimFrozenSnapshot(snapshot) {
  const players = {}
  for (const [id, p] of Object.entries(snapshot?.players ?? {})) {
    const v = p?.projection?.projectedPPG
    if (Number.isFinite(v)) players[id] = v
  }
  return {
    env: {
      capturedAt: snapshot?.capturedAt,
      leagueId: snapshot?.leagueId,
      targetSeason: snapshot?.targetSeason,
      projectionBasis: snapshot?.projectionBasis ?? null,
    },
    players,
  }
}

// ─── Posterior records ───────────────────────────────────────────────────────

const ROS_K = { standard: K_ROS_POINTS, ROOKIE0: K_ROS_POINTS_ROOKIE0, ROOKIE1P: K_ROS_POINTS_ROOKIE1P, SHORT: K_ROS_POINTS_SHORT }
const NEXT_K = { standard: K_DYN_POINTS_HISTORY, ROOKIE0: K_DYN_POINTS_ROOKIE0, ROOKIE1P: K_DYN_POINTS_ROOKIE1P, SHORT: K_DYN_POINTS_SHORT }

// → null | Map<playerId, InSeasonRecord>. `frozenPrior` is the loader result (src/api/frozenPrior.js):
// { status: 'ok', dateKey, players } or { status, reason, dateKey? }; every status but 'ok' yields the
// live prior with the reason carried through.
export function buildScoringPosteriors({
  seasonProjections, careerStats, dataSeason, playerMap, currentSeasonTotals, projectionBasis, frozenPrior,
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
    const ros = posteriorOf(projPrior, obs, n, kRos)

    // Standard's `next` uses the history prior: the dynasty score builds its level from completed-season
    // PPG, not projectedPPG. K_DYN_POINTS_HISTORY (arm R, raw S-1 PPG prior) is the k measured for exactly
    // that base, and a projection-prior shift would carry the prior's known optimism (c ≈ 0.80–0.86)
    // into every veteran's dynasty score. Rookie and SHORT `next` is the verdict's measured
    // projection-prior predictor (arm X), recorded for grading only (Anton, 2026-09-26: their dynasty
    // score is unchanged in 2b).
    const kNext = NEXT_K[population][pos]
    let priorKind, nextPrior
    if (population === 'standard') {
      const s1 = careerStats?.[dataSeason]?.[id]
      priorKind = 'history'
      nextPrior = s1 && Number.isFinite(s1.gamesPlayed) && s1.gamesPlayed > 0 ? s1.fantasyPoints / s1.gamesPlayed : NaN
    } else {
      priorKind = 'projection'
      nextPrior = projPrior
    }
    const next = posteriorOf(nextPrior, obs, n, kNext)
    if (ros == null || next == null) continue

    out.set(id, {
      season: currentSeasonTotals.season,
      n,
      population,
      frozen,
      priorSource,
      notFrozenReason,
      ros:  { prior: projPrior, k: kRos, weight: r4(ros.weight), value: r2(ros.value) },
      next: { priorKind, prior: r2(nextPrior), k: kNext, weight: r4(next.weight), value: r2(next.value) },
    })
  }
  return out
}
