// in-season-evidence-1-view.md §2 — blends the current projection with this season's games.
// Pure, no React, no I/O.
//
// VIEW-ONLY (Phase 1): only `market/Market.jsx` may import this module. Nothing here may reach
// `seasonProjections`, `playerRows`, the dynasty score or a snapshot — a posterior in a snapshot
// writes a contaminated 2026 projection that can never be removed. Guarded by
// `src/__tests__/inSeasonEvidenceViewOnly.test.js`.
//
// The k constants come from an out-of-repo 2012–2025 stability study (parent
// `.claude/tasks/in-season-evidence.md`); they are not reproduced in this repo. Target share is
// deliberately not built: its k sits within 0.5 of opportunities', and a partial-season team share
// needs its own denominator work.

import { blendWeight } from './blendWeights'

// PROVISIONAL(heuristic): every k below · measured by an out-of-repo 2012–2025 stability study (parent in-season-evidence.md), not reproduced in-repo · Phase 2's graded backtest re-fits them
export const K_ROS_POINTS        = { QB: 6,   RB: 3,   WR: 4.5, TE: 5.5 }
export const K_ROS_POINTS_WEAK   = { RB: 3,   WR: 3.5, TE: 4 }     // below-median prior volume
export const K_ROS_POINTS_STRONG = { RB: 3,   WR: 5,   TE: 6 }     // at/above median
export const K_ROS_OPP           = { QB: 5,   RB: 2,   WR: 2.5, TE: 2.5 }
export const K_DYN_POINTS        = { QB: 7.5, RB: 4.5, WR: 6.5, TE: 6.5 }
export const K_DYN_OPP           = { QB: 5.5, RB: 3.5, WR: 4.5, TE: 4 }
export const MIN_PRIOR_GAMES     = 8   // the study's population floor — below it, weights are extrapolated
export const IN_SEASON_POSITIONS = ['QB', 'RB', 'WR', 'TE']
// PROVISIONAL(heuristic): "meaningful opportunity baseline" thresholds · judgment, not measured · Phase 2 backtest
export const MIN_BASELINE_GAMES = 4    // prior-season games needed for an opp/g baseline
export const MIN_BASELINE_OPP   = 2.0  // prior opp/g below this = no role last season

const MEDIAN_POSITIONS = ['RB', 'WR', 'TE']

// PROVISIONAL(heuristic): opportunity definition · the study doc does not define it · Phase 2 fixes it when reproducing the study
// QB: pass attempts + carries. RB/WR/TE: carries + targets. Sleeper omits a zero stat, so an absent
// key counts as 0 — but only under the gamesPlayed > 0 gate; a present non-finite key is garbage → null.
export function opportunitiesPerGame(row, position) {
  const keys = position === 'QB' ? ['pass_att', 'rush_att']
    : (position === 'RB' || position === 'WR' || position === 'TE') ? ['rush_att', 'rec_tgt']
    : null
  if (!keys || !row) return null
  const g = row.gamesPlayed
  if (!Number.isFinite(g) || !(g > 0)) return null
  let total = 0
  for (const k of keys) {
    const v = row.stats?.[k]
    if (v === undefined) continue
    if (!Number.isFinite(v)) return null
    total += v
  }
  return total / g
}

function median(list) {
  if (list.length === 0) return null
  const s = [...list].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

// One pass over careerStats[dataSeason] — the per-position prior-volume medians and the season's
// single scoringBasis. Position comes from `playerMap` (careerStats rows carry none). Both halves
// exclude `TEAM_<abbr>` and bare-abbr DEF rows through that filter: neither has a playerMap entry
// with a skill position (CR-02's cross-row-reader rule).
// → { medians: { RB, WR, TE } (median | null), seasonBasis: string | null }
export function buildPriorSeasonContext(careerStats, dataSeason, playerMap) {
  const season = careerStats?.[dataSeason] ?? {}
  const lists = { RB: [], WR: [], TE: [] }
  let basis, mixed = false
  for (const id of Object.keys(season)) {
    const pos = playerMap?.[id]?.position
    if (!IN_SEASON_POSITIONS.includes(pos)) continue
    const row = season[id]
    const b = row?.scoringBasis
    if (typeof b !== 'string' || !b) mixed = true
    else if (basis === undefined) basis = b
    else if (basis !== b) mixed = true
    if (MEDIAN_POSITIONS.includes(pos) && Number.isFinite(row?.gamesPlayed) && row.gamesPlayed >= MIN_PRIOR_GAMES) {
      const o = opportunitiesPerGame(row, pos)
      if (o != null) lists[pos].push(o)
    }
  }
  return {
    medians: { RB: median(lists.RB), WR: median(lists.WR), TE: median(lists.TE) },
    seasonBasis: mixed || basis === undefined ? null : basis,
  }
}

export function usableLiveSeason(currentSeasonTotals, dataSeason) {
  const s = currentSeasonTotals?.season
  return currentSeasonTotals?.complete === true && Number.isFinite(s)
    && Number.isFinite(dataSeason) && s > dataSeason
}

// posterior = prior + w·(observed − prior)  ==  (prior·k + obs·n)/(k+n). Null rule, in order:
// no prior → null; n = 0 → weight 0 and the prior (a missed game is not evidence; `observed` is not
// read); observed missing with n > 0 → null (JS would coerce null to 0 and print a wrong number).
function blend(priorValue, observed, n, k) {
  if (!Number.isFinite(priorValue)) return { value: null, weight: null }
  const w = blendWeight(n, k)
  if (w == null) return { value: null, weight: null }
  if (n === 0) return { value: priorValue, weight: 0 }
  if (!Number.isFinite(observed)) return { value: null, weight: null }
  const value = priorValue + w * (observed - priorValue)
  return Number.isFinite(value) ? { value, weight: w } : { value: null, weight: null }
}

const EMPTY_POSTERIOR = {
  rosPpg: null, rosWeight: null, dynPpg: null, dynWeight: null,
  rosOpp: null, rosOppWeight: null, dynOpp: null, dynOppWeight: null,
  oppShift: null, oppShiftSort: null,
}

// → null when the live season is unusable (caller renders its no-data state); else
// { liveSeason, priorSeason, maxGames, byId: Map<player_id, Result> }.
// `maxGames` is over the RESULTS only — currentSeasonTotals.players also holds TEAM_<abbr> and
// bare-abbr DEF rows (CR-02), whose gamesPlayed is a team's. The live row set is only ever indexed
// by a playerRows id.
export function buildInSeasonPosteriors({ playerRows, careerStats, dataSeason, playerMap, currentSeasonTotals }) {
  if (!usableLiveSeason(currentSeasonTotals, dataSeason)) return null
  const { medians, seasonBasis } = buildPriorSeasonContext(careerStats, dataSeason, playerMap)
  const priorRows = careerStats?.[dataSeason] ?? {}
  const liveRows = currentSeasonTotals.players ?? {}
  const byId = new Map()
  let maxGames = 0

  for (const row of (playerRows ?? [])) {
    const id = row.player_id
    const pos = row.position
    const live = liveRows[id] ?? null
    const prior = priorRows[id] ?? null
    const validPos = IN_SEASON_POSITIONS.includes(pos)

    const games = Number.isFinite(live?.gamesPlayed) ? live.gamesPlayed : null
    const ppg = live && live.gamesPlayed > 0 && Number.isFinite(live.fantasyPoints)
      ? live.fantasyPoints / live.gamesPlayed : null
    const oppNow = validPos ? opportunitiesPerGame(live, pos) : null
    const oppPrior = validPos ? opportunitiesPerGame(prior, pos) : null
    const proj = Number.isFinite(row.projectedPPG) ? row.projectedPPG : null
    const extrapolated = validPos && !(prior && prior.gamesPlayed >= MIN_PRIOR_GAMES)
    const hasBaseline = validPos && !!prior && prior.gamesPlayed >= MIN_BASELINE_GAMES
      && oppPrior != null && oppPrior >= MIN_BASELINE_OPP

    // Band: RB/WR/TE only. Extrapolated players are 'weak' by rule; a null median → no band.
    let band = null
    if (validPos && pos !== 'QB') {
      if (extrapolated) band = 'weak'
      else if (medians[pos] != null) band = oppPrior != null && oppPrior < medians[pos] ? 'weak' : 'strong'
    }

    // Same scoring basis — a mismatch guard, not a guarantee: the prior careerStats row stands in
    // for projectedPPG's basis (the projection is built from those rows), and a live-API fallback
    // season has no scoringBasis at all. Its limits are in the parent, finding 6.
    const priorBasis = prior ? prior.scoringBasis : seasonBasis
    const basisOk = !live || (typeof live.scoringBasis === 'string' && !!live.scoringBasis
      && typeof priorBasis === 'string' && live.scoringBasis === priorBasis)
    const eligible = validPos && basisOk
    // newRole requires eligibility too — an ineligible (e.g. basis-mismatch) row must never render
    // a "new role" chip its oppShiftSort can't back (fix pass 1, item 1).
    const newRole = eligible && !hasBaseline && oppNow != null && oppNow >= MIN_BASELINE_OPP

    const result = {
      games, ppg, oppNow, oppPrior, extrapolated, hasBaseline, newRole, proj, band,
      ...EMPTY_POSTERIOR,
    }

    if (eligible) {
      const n = live && live.gamesPlayed > 0 ? live.gamesPlayed : 0
      let kRos = K_ROS_POINTS[pos]
      if (pos !== 'QB' && band === 'weak') kRos = K_ROS_POINTS_WEAK[pos]
      else if (pos !== 'QB' && band === 'strong') kRos = K_ROS_POINTS_STRONG[pos]
      const ros = blend(proj, ppg, n, kRos)
      const dyn = blend(proj, ppg, n, K_DYN_POINTS[pos])
      result.rosPpg = ros.value; result.rosWeight = ros.weight
      result.dynPpg = dyn.value; result.dynWeight = dyn.weight
      if (hasBaseline) {
        const rosO = blend(oppPrior, oppNow, n, K_ROS_OPP[pos])
        const dynO = blend(oppPrior, oppNow, n, K_DYN_OPP[pos])
        result.rosOpp = rosO.value; result.rosOppWeight = rosO.weight
        result.dynOpp = dynO.value; result.dynOppWeight = dynO.weight
        // n = 0 → no evidence yet; a 0.0 shift reads as "no change" and would sort every unplayed
        // player above real declines (fix pass 1, item 2). rosOpp/rosOppWeight keep the prior at
        // weight 0 (true, and Phase 2 reads them) — only the shift itself is withheld.
        result.oppShift = (n > 0 && rosO.value != null) ? rosO.value - oppPrior : null
      }
      result.oppShiftSort = result.oppShift != null ? result.oppShift
        : newRole ? blendWeight(n, K_ROS_OPP[pos]) * oppNow
        : null
    }

    if (games != null && games > maxGames) maxGames = games
    byId.set(id, result)
  }

  return { liveSeason: currentSeasonTotals.season, priorSeason: dataSeason, maxGames, byId }
}
