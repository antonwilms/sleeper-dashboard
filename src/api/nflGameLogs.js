/**
 * src/api/nflGameLogs.js
 *
 * VIEW-ONLY / LOADER-ONLY. Loads nflverse per-game player stats
 * (`nflverse/gamelogs/<year>.json`) from the data store and returns the
 * per-season players object for DISPLAY use only. These values MUST NOT feed
 * the playerRows pipeline, projectedPPG, the dynasty score, or any projection
 * `factors` entry. The decoupling is enforced by
 * src/__tests__/gameLogsViewOnly.test.js. Do not import this module from any
 * projection/scoring file.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/gamelogs/<year>.json
 *         Produced server-side by sleeper-dashboard-data. One file per season.
 *         Live on the CDN for 2012–2024; 2019 is ABSENT upstream (a known
 *         nflverse gap) — this loader degrades to the graceful empty shape for
 *         2019; it never substitutes an adjacent season.
 *
 * Served shape: { schemaVersion:1, season, generatedAt, rowCount, playerCount,
 *   unmapped, players }; players keyed by sleeper_id → { gsisId, name,
 *   position, games[] }; each game: { week, seasonType, team, opponent,
 *   …sparse per-game stats }.
 *
 * Sparse / null semantics: absent stat key ⇒ null (never 0); present 0 is a
 * real zero. The loader is PASS-THROUGH — it transforms nothing, so absent
 * keys stay absent and present zeros stay zero.
 *
 * Rate fields are single-game values (racr, targetShare, airYardsShare, wopr,
 * pacr, passingCpoe) — NEVER sum them; a consumer recomputes season figures
 * from components. fantasyPoints/fantasyPointsPpr are nflverse default scoring
 * — display/training only, NEVER reconciled with src/utils/fantasyPoints.js.
 *
 * Signature: loadNflGameLogs(year) takes an EXPLICIT season (no probe). The
 * game-log consumer needs an arbitrary past season for a player, so a
 * "most-recent-available" probe is the wrong shape here (and would silently
 * substitute an adjacent season for the absent 2019). A caller wanting the
 * current season resolves it from nflState.season:
 *   loadNflGameLogs(parseInt(nflState.season, 10))
 *
 * Cache: `nfl-gamelogs/<year>` per year, permanent TTL (999999 min). Each
 * record stores { players, season, rowCount, lastModified }. Past seasons are
 * immutable (permanent cache correct); the manifest lastModified freshness
 * check re-fetches a mutated current-season file.
 *
 * MIN_PLAYERGAME_ROWS (shared cross-repo constant, defined in dataStore.js) is
 * enforced three times: isValidGameLogs rejects a below-floor file at the
 * tryDataStore boundary, the cache-hit guard re-checks on the IndexedDB path,
 * and this loader re-asserts it on the declared rowCount after fetch. (The
 * floor is on declared rowCount — no flat top-level array to length-check.)
 *
 * Graceful absence: store down / disabled / file absent from manifest (incl.
 * 2019) / shape mismatch / below-floor rowCount →
 * { players: {}, year: null, complete: false, rowCount: 0 } (no crash, no NaN).
 * Consumers branch on `complete`, not `year`.
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidGameLogs, MIN_PLAYERGAME_ROWS } from './dataStore'

const EMPTY = { players: {}, year: null, complete: false, rowCount: 0 }

/**
 * Loads nflverse per-game player stats for one explicit season.
 * @param {number} year  explicit NFL season, e.g. 2023 (= parseInt(nflState.season, 10) for current)
 * @returns {Promise<{ players: object, year: number|null, complete: boolean, rowCount: number }>}
 */
export async function loadNflGameLogs(year) {
  const path = `nflverse/gamelogs/${year}.json`

  // 1. Manifest check — file not in store (e.g. 2019 gap) / store disabled → graceful empty
  const entry = await getManifestEntry(path)
  if (!entry) return { ...EMPTY }

  // 2. Cache check (lastModified-aware) — must still meet the sparsity floor
  const rec = await getCacheRecord(`nfl-gamelogs/${year}`)
  if (rec?.data?.rowCount >= MIN_PLAYERGAME_ROWS && rec.data.lastModified === entry.lastModified) {
    console.log(`[nflGameLogs] year=${year} served from cache (rows=${rec.data.rowCount})`)
    return { players: rec.data.players, year, complete: true, rowCount: rec.data.rowCount }
  }

  // 3. Fetch (isValidGameLogs rejects malformed / below-floor files at the boundary)
  const json = await tryDataStore(path, { validate: isValidGameLogs })
  if (!json) return { ...EMPTY }  // store unavailable / shape mismatch → graceful empty

  // 4. Sparsity re-assert on the declared rowCount (floor is on rowCount — no flat games array)
  if (json.rowCount < MIN_PLAYERGAME_ROWS) {
    console.log(`[nflGameLogs] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_PLAYERGAME_ROWS}), skipping`)
    return { ...EMPTY }
  }

  // 5. Cache with lastModified for next-load freshness
  await setCacheWithMeta(`nfl-gamelogs/${year}`, {
    players: json.players,
    season: json.season,
    rowCount: json.rowCount,
    lastModified: entry.lastModified,
  }, 999999, {})

  console.log(`[nflGameLogs] fetched year=${year} rows=${json.rowCount}`)
  return { players: json.players, year, complete: true, rowCount: json.rowCount }
}
