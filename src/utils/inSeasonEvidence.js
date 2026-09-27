// View-only opportunity display for Market's In-season set, plus the eligibility guard. Pure, no React,
// no I/O. The points posterior moved to the scoring seam (src/utils/inSeasonScoring.js) in
// in-season-evidence-2b-2; this module keeps only opportunity: the lookback baseline (most recent of the
// last three seasons with ≥ 4 games — verdict Q5 arm B), the new-role rule and the relative usage shift
// (verdict Q6), blended with the pinned K_ROS_OPP. Those definitions are mirrored by data
// `lib/inSeasonEvidence.mjs` (CR-25); the verdict measured them, so adopting them needs no re-fit.
//
// MARKET-ONLY: only `market/Market.jsx` may import this module. Nothing here may reach `seasonProjections`,
// `playerRows`, the dynasty score or a snapshot. Guarded by `src/__tests__/inSeasonEvidenceViewOnly.test.js`.
//
// Target share is deliberately not built: its k sits within 0.5 of opportunities', and a partial-season
// team share needs its own denominator work.

import { blendWeight } from './blendWeights'
import { K_ROS_OPP } from './inSeasonConstants'

export const IN_SEASON_POSITIONS = ['QB', 'RB', 'WR', 'TE']
// Baseline thresholds — the verdict's Q5 arm B (CR-25), not a judgment call.
export const MIN_BASELINE_GAMES = 4    // games needed for a season to serve as the opp/g baseline
export const MIN_BASELINE_OPP   = 2.0  // baseline opp/g below this = no role
const BASELINE_LOOKBACK = 3            // seasons examined: dataSeason, dataSeason−1, dataSeason−2

// Opportunity = QB: pass attempts + carries; RB/WR/TE: carries + targets (the verdict's Q6 definition, CR-25).
// Sleeper omits a zero stat, so an absent key counts as 0 — but only under the gamesPlayed > 0 gate; a
// present non-finite key is garbage → null.
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

// The single scoring basis of careerStats[dataSeason] (the eligibility guard's fallback for a player with
// no prior row). Position comes from `playerMap` (careerStats rows carry none); TEAM_<abbr> and bare-abbr
// DEF rows are excluded through that filter (CR-02's cross-row-reader rule).
// → { seasonBasis: string | null }
export function buildPriorSeasonContext(careerStats, dataSeason, playerMap) {
  return { seasonBasis: singleScoringBasis(careerStats?.[dataSeason] ?? {}, playerMap) }
}

// Baseline B: the first of dataSeason, dataSeason−1, dataSeason−2 in which the player has gp ≥ MIN_BASELINE_GAMES.
// The search stops at that season either way — a small role there is not looked past (the data side breaks too).
// → { oppPrior, baselineSeason, hasBaseline }
function opportunityBaseline(careerStats, dataSeason, id, pos) {
  for (let y = dataSeason; y > dataSeason - BASELINE_LOOKBACK; y--) {
    const row = careerStats?.[y]?.[id]
    if (row && row.gamesPlayed >= MIN_BASELINE_GAMES) {
      const oppPrior = opportunitiesPerGame(row, pos)
      return { oppPrior, baselineSeason: y, hasBaseline: oppPrior != null && oppPrior >= MIN_BASELINE_OPP }
    }
  }
  return { oppPrior: null, baselineSeason: null, hasBaseline: false }
}

// The single-basis rule, one definition for both sides of the in-season gate (season-rescore.md
// §3.7): the one `scoringBasis` label every skill-position row (via playerMap) carries, or null when
// any such row's label is missing or they differ (or there are none).
function singleScoringBasis(rows, playerMap) {
  let basis, mixed = false
  for (const id of Object.keys(rows ?? {})) {
    const pos = playerMap?.[id]?.position
    if (!IN_SEASON_POSITIONS.includes(pos)) continue
    const b = rows[id]?.scoringBasis
    if (typeof b !== 'string' || !b) mixed = true
    else if (basis === undefined) basis = b
    else if (basis !== b) mixed = true
  }
  return mixed || basis === undefined ? null : basis
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

// → null when the live season is unusable (caller renders its no-data state); else
// { liveSeason, priorSeason, maxGames, leagueScored, byId: Map<player_id, Result> }. `leagueScored` is
// true only when BOTH the prior season and the live rows were rescored onto the league's settings
// (the ppg cell renders the live row whether or not the player is eligible).
// `maxGames` is over the RESULTS only — currentSeasonTotals.players also holds TEAM_<abbr> and
// bare-abbr DEF rows (CR-02), whose gamesPlayed is a team's. The live row set is only ever indexed
// by a playerRows id.
export function buildInSeasonPosteriors({ playerRows, careerStats, dataSeason, playerMap, currentSeasonTotals }) {
  if (!usableLiveSeason(currentSeasonTotals, dataSeason)) return null
  const { seasonBasis } = buildPriorSeasonContext(careerStats, dataSeason, playerMap)
  const priorRows = careerStats?.[dataSeason] ?? {}
  const liveRows = currentSeasonTotals.players ?? {}
  const liveBasis = singleScoringBasis(liveRows, playerMap)
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
    const { oppPrior, baselineSeason, hasBaseline } = validPos
      ? opportunityBaseline(careerStats, dataSeason, id, pos)
      : { oppPrior: null, baselineSeason: null, hasBaseline: false }

    // Same scoring basis — a mismatch guard, not a guarantee: the prior careerStats row stands in
    // for the projection's basis (the projection is built from those rows), and a live-API fallback
    // season has no scoringBasis at all. Its limits are in the parent, finding 6.
    const priorBasis = prior ? prior.scoringBasis : seasonBasis
    const basisOk = !live || (typeof live.scoringBasis === 'string' && !!live.scoringBasis
      && typeof priorBasis === 'string' && live.scoringBasis === priorBasis)
    const eligible = validPos && basisOk
    // newRole requires eligibility too — an ineligible (e.g. basis-mismatch) row must never render
    // a "new role" chip. Its sort value is null: the relative shift is undefined without a baseline.
    const newRole = eligible && !hasBaseline && oppNow != null && oppNow >= MIN_BASELINE_OPP

    const result = {
      games, ppg, oppNow, oppPrior, baselineSeason, hasBaseline, newRole,
      rosOpp: null, rosOppWeight: null, oppShift: null, oppShiftRel: null, oppShiftSort: null,
    }

    if (eligible && hasBaseline) {
      const n = live && live.gamesPlayed > 0 ? live.gamesPlayed : 0
      const rosO = blend(oppPrior, oppNow, n, K_ROS_OPP[pos])
      result.rosOpp = rosO.value; result.rosOppWeight = rosO.weight
      // n = 0 → no evidence yet; a 0.0 shift reads as "no change" and would sort every unplayed
      // player above real declines. rosOpp/rosOppWeight keep the prior at weight 0 — only the
      // shift itself is withheld.
      result.oppShift = (n > 0 && rosO.value != null) ? rosO.value - oppPrior : null
      result.oppShiftRel = result.oppShift != null ? result.oppShift / oppPrior : null   // verdict Q6, relative
      result.oppShiftSort = result.oppShiftRel
    }

    if (games != null && games > maxGames) maxGames = games
    byId.set(id, result)
  }

  return {
    liveSeason: currentSeasonTotals.season, priorSeason: dataSeason, maxGames,
    leagueScored: seasonBasis === 'league' && liveBasis === 'league', byId,
  }
}
