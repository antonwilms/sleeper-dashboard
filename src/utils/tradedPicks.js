/**
 * src/utils/tradedPicks.js — dp-v2 Slice 7.
 *
 * Pure helpers for reconstructing rookie-pick ownership from Sleeper's `traded_picks` endpoint.
 * Extracted out of App.jsx/Portfolio.jsx for the same reason `utils/tabState.js` was: this logic
 * is unit-testable without mounting the whole app, which otherwise has no way to exercise it.
 *
 * Two traps this file exists to avoid:
 * - `traded_picks` still returns rows for a season whose draft has already been held (this
 *   league: 15 rows for season "2026", a complete draft) — pricing those double-counts against
 *   players already on rosters. `deriveFirstLiveSeason`/`deriveLiveSeasons` exclude them.
 * - `traded_picks`' `owner_id`/`previous_owner_id` are ROSTER IDs (small ints), not user ids —
 *   the field name collides with `rosters[].owner_id` (a user id string). Never conflate the two;
 *   this file only ever reads/returns roster_ids, and callers resolve names via `rosterTeams`.
 */

/**
 * The first pick season that has not yet been drafted. Reads the CURRENT season's draft
 * directly (its own `season`/`status` fields) — deliberately NOT `utils/rookieDraft.js`'s
 * `selectRookieDraft`/`isRookieDraft`, which answer a different question ("which draft, among
 * possibly several, is the rookie draft") via a rounds/roster-size heuristic irrelevant here.
 * @param {Array<{season?: string, status?: string}>} drafts  the league's raw drafts list
 * @param {{season?: string}} league
 * @returns {number|null}
 */
export function deriveFirstLiveSeason(drafts, league) {
  const leagueSeasonNum = Number(league?.season)
  if (!Number.isFinite(leagueSeasonNum)) return null
  const currentSeasonDraft = (drafts ?? []).find(d => d?.season === league?.season)
  return currentSeasonDraft?.status === 'complete' ? leagueSeasonNum + 1 : leagueSeasonNum
}

/**
 * Live pick seasons — the intersection of "KTC prices this season" and "≥ first-live". Never
 * hard-coded and never taken from `traded_picks` alone (it carries dead seasons) or from KTC
 * alone (it prices dead ones too, e.g. today's snapshot still has "2026 …" rows).
 * @param {number|null} firstLiveSeason
 * @param {object|null} ktcPickTable  parseKtcPickRows(...) output
 * @returns {number[]}  ascending
 */
export function deriveLiveSeasons(firstLiveSeason, ktcPickTable) {
  if (firstLiveSeason == null) return []
  return Object.keys(ktcPickTable ?? {})
    .map(Number)
    .filter(s => s >= firstLiveSeason)
    .sort((a, b) => a - b)
}

/**
 * Reconstructs ownership for every (season, round, roster) triple across the live window. Every
 * roster starts holding its own pick in each round × live season; a `traded_picks` row keyed
 * `(season, round, roster_id)` reassigns it to that row's `owner_id`. Both are roster_ids.
 * @param {object} args
 * @param {Array<{rosterId: number}>} args.rosterTeams
 * @param {Array<{season: string, round: number, roster_id: number, owner_id: number}>|null} args.tradedPicks
 * @param {number[]} args.liveSeasons
 * @param {number|null} args.draftRounds  league.settings.draft_rounds — falls back to 4 (KTC's
 *   own priced ceiling) if the league doesn't carry it, so a missing field degrades to "the
 *   rounds KTC can price" rather than enumerating zero rounds.
 * @returns {Array<{season: number, round: number, originalRosterId: number, ownerRosterId: number}>}
 */
export function reconstructPickOwnership({ rosterTeams, tradedPicks, liveSeasons, draftRounds }) {
  const rounds = Number.isFinite(draftRounds) && draftRounds > 0 ? draftRounds : 4

  const tradeByKey = new Map()
  for (const p of (tradedPicks ?? [])) {
    tradeByKey.set(`${p.season}-${p.round}-${p.roster_id}`, p.owner_id)
  }

  const picks = []
  for (const season of liveSeasons) {
    for (let round = 1; round <= rounds; round++) {
      for (const team of (rosterTeams ?? [])) {
        const originalRosterId = team.rosterId
        const key = `${season}-${round}-${originalRosterId}`
        const ownerRosterId = tradeByKey.has(key) ? tradeByKey.get(key) : originalRosterId
        picks.push({ season, round, originalRosterId, ownerRosterId })
      }
    }
  }
  return picks
}
