/**
 * src/api/nflSchedule.js
 *
 * READ-ONLY / LOADER-ONLY. Loads nflverse NFL schedule / results / Vegas lines
 * (`nflverse/schedule/<year>.json`) from the data store and returns the per-season
 * games array for DISPLAY use only (the NFL-stats game-log tab and the matchup
 * view — both later app-arc slices; no consumer in this slice). These values MUST
 * NOT feed the playerRows pipeline, projectedPPG, the dynasty score, or any
 * projection `factors` entry. The decoupling is enforced by
 * src/__tests__/scheduleViewOnly.test.js. Do not import this module from any
 * projection/scoring file.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/schedule/<year>.json
 *         Produced server-side by sleeper-dashboard-data (scripts/update-schedule.mjs
 *         ← nflverse `nfldata` games.csv, weekly Action). One file per season.
 *
 * Served shape: { schemaVersion:1, season, generatedAt, rowCount, games[] }; each
 * game has exactly 15 fields (gameId, season, week, gameType, homeTeam, awayTeam,
 * homeScore, awayScore, result, spreadLine, totalLine, roof, surface, temp, wind).
 * Null semantics tolerated, never coerced: homeScore/awayScore/result are null for
 * unplayed games (the whole CURRENT season ships null-scored with spreadLine/
 * totalLine populated); temp/wind null for domes/older seasons; result is the home
 * margin and 0 is a TIE (never 0 → null).
 *
 * Signature: loadNflSchedule(year) takes an EXPLICIT season (no probe). Consumer
 * (a) needs an arbitrary past season for a player; consumer (b) resolves the
 * current season from nflState.season: loadNflSchedule(parseInt(nflState.season, 10)).
 *
 * Cache: `nfl-schedule/<year>` per year, permanent TTL (999999 min). Freshness via
 * the manifest entry's `lastModified` stored in the cache record — a changed token
 * re-fetches. Past seasons are immutable (permanent cache correct); the current
 * season's file mutates weekly as scores fill in and is re-fetched on lastModified
 * change, exactly like the weekly roster refresh.
 *
 * MIN_SCHEDULE_GAMES (shared cross-repo constant, defined in dataStore.js) is
 * enforced twice: isValidSchedule rejects a short games array at the tryDataStore
 * boundary, and this loader re-asserts it on the declared rowCount after fetch.
 *
 * Graceful absence: store down / disabled / file absent from manifest / shape
 * mismatch / below-floor rowCount → { games: [], year: null, complete: false,
 * rowCount: 0 } (no crash, no NaN). Consumers branch on `complete`, not `year`.
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidSchedule, MIN_SCHEDULE_GAMES } from './dataStore'

const EMPTY = { games: [], year: null, complete: false, rowCount: 0 }

/**
 * Loads the NFL schedule for one explicit season.
 *
 * @param {number} year  explicit NFL season, e.g. 2026 (= parseInt(nflState.season, 10))
 * @returns {Promise<{
 *   games: Array<object>,   // raw Game[] (15-field rows; null scores/result/temp/wind tolerated)
 *   year: number|null,
 *   complete: boolean,
 *   rowCount: number,
 * }>}
 */
export async function loadNflSchedule(year) {
  const path = `nflverse/schedule/${year}.json`

  // 1. Manifest check — file not in store yet / store disabled → graceful empty
  const entry = await getManifestEntry(path)
  if (!entry) return { ...EMPTY }

  // 2. Cache check (lastModified-aware) — must still meet the sparsity floor
  const rec = await getCacheRecord(`nfl-schedule/${year}`)
  if (rec?.data?.rowCount >= MIN_SCHEDULE_GAMES && rec.data.lastModified === entry.lastModified) {
    console.log(`[nflSchedule] year=${year} served from cache (rows=${rec.data.rowCount})`)
    return { games: rec.data.games, year, complete: true, rowCount: rec.data.rowCount }
  }

  // 3. Fetch from data store (isValidSchedule rejects short / malformed files)
  const json = await tryDataStore(path, { validate: isValidSchedule })
  if (!json) return { ...EMPTY }  // store unavailable / shape mismatch → graceful empty

  // 4. Sparsity re-assert on the declared rowCount
  if (json.rowCount < MIN_SCHEDULE_GAMES) {
    console.log(`[nflSchedule] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_SCHEDULE_GAMES}), skipping`)
    return { ...EMPTY }
  }

  // 5. Cache with lastModified for next-load freshness
  await setCacheWithMeta(`nfl-schedule/${year}`, {
    games: json.games,
    season: json.season,
    rowCount: json.rowCount,
    lastModified: entry.lastModified,
  }, 999999, {})

  console.log(`[nflSchedule] fetched year=${year} rows=${json.rowCount}`)
  return { games: json.games, year, complete: true, rowCount: json.rowCount }
}
