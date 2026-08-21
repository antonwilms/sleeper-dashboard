/**
 * src/api/teamContext.js
 *
 * VIEW-ONLY / LOADER-ONLY. Loads the nflverse team-context pack
 * (`nflverse/teamcontext/<year>.json`) from the data store and returns the
 * per-season teams object for DISPLAY use only. These values MUST NOT feed
 * the playerRows pipeline, projectedPPG, the dynasty score, or any projection
 * `factors` entry. The decoupling is enforced by
 * src/__tests__/teamContextViewOnly.test.js. Do not import this module from
 * any projection/scoring file.
 *
 * NOT the same module as src/utils/teamContext.js — that file
 * (`computeTeamContext`, etc.) is a projection-pipeline module legitimately
 * imported by dynastyScore.js/seasonProjection.js. This loader is unrelated;
 * export names are globally unique and non-colliding (`loadTeamContext`,
 * `getTeamSeasonRows`, `getTeamWeekRow` vs the utils module's `compute*`
 * names).
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/teamcontext/<year>.json
 *         Produced server-side by sleeper-dashboard-data. One file per
 *         season. Live on the CDN for 2012–2025 (all 14 seasons present in
 *         the manifest).
 *
 * Served shape: { schemaVersion:1, season, generatedAt, rowCount, teamCount,
 *   teams }; teams is the FIRST TEAM-keyed family — keyed by era-accurate
 *   team abbr (STL/SD/OAK for old seasons, not LA/LAC/LV) → { games[] };
 *   each game: { week, seasonType, gameId, opponent, off:{…31 fields},
 *   def:{…18 fields} }. Row identity is (team, week), NOT sleeper_id. Week
 *   numbering is continuous REG→POST and unique within a team-season.
 *
 * Rate fields are single-game values (proe, epaPerPlay, successRate,
 * rzPassRate, neutralSecPerPlay, passRate, …) — NEVER sum or average them
 * across weeks; the rows ship the counting components (epaSum/epaPlays,
 * proeXpassSum/proePlays, neutralSeconds/neutralGaps, …) precisely so a
 * consumer aggregates components and re-divides. Note PROE's pairing
 * specifically: proeXpassSum divides by proePlays, NOT the also-present
 * proePassPlays — verified arithmetically against real data (dp-v2 Slice 4c;
 * ARI week 1 2025: 37/61 − 36.561/61 = +0.0072 matches the stored proe of
 * 0.007, while 37/61 − 36.561/37 = −0.3816 does not). The loader is
 * PASS-THROUGH — it transforms nothing.
 *
 * Joins: a consumer resolving a player's team for a given season/week uses
 * src/utils/playerTeam.js (`resolvePlayerTeam`), which returns era-accurate
 * codes in the same domain as these `teams` keys.
 *
 * Signature: loadTeamContext(year) takes an EXPLICIT season (no probe). A
 * teamcontext consumer needs an arbitrary past season, so a
 * "most-recent-available" probe is the wrong shape here — same reasoning as
 * the schedule/gamelogs loaders. A caller wanting the current season
 * resolves it from nflState.season:
 *   loadTeamContext(parseInt(nflState.season, 10))
 *
 * Cache: `nfl-teamcontext/<year>` per year, permanent TTL (999999 min). Each
 * record stores { teams, season, rowCount, lastModified }. Past seasons are
 * immutable (permanent cache correct); the manifest lastModified freshness
 * check re-fetches a mutated current-season file (2025 mutates weekly during
 * the season).
 *
 * MIN_TEAMCONTEXT_ROWS (shared cross-repo constant, defined in dataStore.js)
 * is enforced three times: isValidTeamContext rejects a below-floor file at
 * the tryDataStore boundary, the cache-hit guard re-checks on the IndexedDB
 * path, and this loader re-asserts it on the declared rowCount after fetch.
 * (The floor is on declared rowCount — teams is an object of objects with
 * nested games[], no flat top-level array to length-check.)
 *
 * Graceful absence: store down / disabled / file absent from manifest /
 * shape mismatch / below-floor rowCount →
 * { teams: {}, year: null, complete: false, rowCount: 0 } (no crash, no NaN).
 * Consumers branch on `complete`, not `year`.
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidTeamContext, MIN_TEAMCONTEXT_ROWS } from './dataStore'

const EMPTY = { teams: {}, year: null, complete: false, rowCount: 0 }

/**
 * Loads the nflverse team-context pack for one explicit season.
 * @param {number} year  explicit NFL season, e.g. 2013 (= parseInt(nflState.season, 10) for current)
 * @returns {Promise<{ teams: object, year: number|null, complete: boolean, rowCount: number }>}
 */
export async function loadTeamContext(year) {
  const path = `nflverse/teamcontext/${year}.json`

  // 1. Manifest check — absent season / store disabled → graceful empty
  const entry = await getManifestEntry(path)
  if (!entry) return { ...EMPTY }

  // 2. Cache check (lastModified-aware) — must still meet the sparsity floor
  const rec = await getCacheRecord(`nfl-teamcontext/${year}`)
  if (rec?.data?.rowCount >= MIN_TEAMCONTEXT_ROWS && rec.data.lastModified === entry.lastModified) {
    console.log(`[teamContext] year=${year} served from cache (rows=${rec.data.rowCount})`)
    return { teams: rec.data.teams, year, complete: true, rowCount: rec.data.rowCount }
  }

  // 3. Fetch (isValidTeamContext rejects malformed / below-floor files at the boundary)
  const json = await tryDataStore(path, { validate: isValidTeamContext })
  if (!json) return { ...EMPTY }

  // 4. Sparsity re-assert on the declared rowCount (no flat top-level array)
  if (json.rowCount < MIN_TEAMCONTEXT_ROWS) {
    console.log(`[teamContext] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_TEAMCONTEXT_ROWS}), skipping`)
    return { ...EMPTY }
  }

  // 5. Cache with lastModified for next-load freshness
  await setCacheWithMeta(`nfl-teamcontext/${year}`, {
    teams: json.teams,
    season: json.season,
    rowCount: json.rowCount,
    lastModified: entry.lastModified,
  }, 999999, {})

  console.log(`[teamContext] fetched year=${year} rows=${json.rowCount}`)
  return { teams: json.teams, year, complete: true, rowCount: json.rowCount }
}

/**
 * All game rows for one team within a loaded season. `team` must be an ERA-ACCURATE code
 * (resolvePlayerTeam output / teamcontext key domain). Null on miss or empty load — never throws.
 * @param {{ teams: object }} loaded  loadTeamContext(year) result
 * @param {string} team
 * @returns {Array<object>|null}
 */
export function getTeamSeasonRows(loaded, team) {
  if (!team) return null
  return loaded?.teams?.[team]?.games ?? null
}

/**
 * One team-week row within a loaded season. Weeks are continuous REG→POST and unique per
 * team-season; a bye/absent week returns null. Never throws.
 * @returns {object|null}
 */
export function getTeamWeekRow(loaded, team, week) {
  const games = getTeamSeasonRows(loaded, team)
  if (!games) return null
  return games.find(g => g.week === week) ?? null
}
