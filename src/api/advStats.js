/**
 * src/api/advStats.js
 *
 * VIEW-ONLY. Loads nflverse advanced stats (target share, air-yards share, WOPR,
 * RACR) from the data store and exposes them per sleeper_id for Market's Efficiency
 * column set. These values MUST NOT feed projectedPPG, the dynasty score, or any
 * projection `factors` entry. Activation is parked — see the "Advstats & Signal
 * Grading — Findings and Open Items" doc. The decoupling is enforced by
 * src/__tests__/advStatsViewOnly.test.js. Do not import this module from any
 * projection/scoring file.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/advstats/<year>.json
 *         Produced server-side by sleeper-dashboard-data (Phase 1a). sleeper_id-keyed,
 *         WR/TE/RB. inProgress:false, schemaVersion:1.
 *
 * Cache: `nfl-advstats/<year>` per year, permanent TTL (999999 min). Freshness via the
 * manifest entry's `lastModified` stored in the cache record — a changed token
 * re-fetches. Both entry points below share this cache key per year: a year has one
 * file and one cache record, whichever loader asked for it.
 *
 * Two entry points:
 *  - `loadAdvStats` probes `currentSeason → currentSeason − 1` and returns the first
 *    year that passes the manifest, shape and `MIN_ADVSTATS_ROWS` gates. It serves the
 *    completed-season column.
 *  - `loadAdvStatsForSeason` is exact-year with no fallback and serves the live-season
 *    column. A caller must never pass the live season to `loadAdvStats`, because the
 *    fallback would return the previous season's numbers under the live season's label.
 *  - A live file registers `inProgress: false` like every advstats file. Weekly change
 *    is picked up through `lastModified`.
 *
 * Graceful absence: store down / no qualifying year / shape mismatch →
 * { byId: null, year: null, complete: false, rowCount: 0 }. The consumer then renders
 * `—` (completed column) or hides the column (live).
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidAdvStats } from './dataStore'

// Shared with the data-repo write-gate. Files below this row count are preliminary
// and never trusted/cached as authoritative.
const MIN_ADVSTATS_ROWS = 250

const EMPTY = { byId: null, year: null, complete: false, rowCount: 0 }

/**
 * @param {number} year
 * @param {{ allowInProgress?: boolean }} [opts]
 * @returns {Promise<{ byId: Object, year: number, complete: true, rowCount: number }|null>}
 */
async function loadAdvStatsYear(year, { allowInProgress = false } = {}) {
  const path = `nflverse/advstats/${year}.json`

  // 1. Manifest check — not in store yet
  const entry = await getManifestEntry(path)
  if (!entry) return null

  // 2. Cache check (lastModified-aware) — must still satisfy the sparsity gate
  const rec = await getCacheRecord(`nfl-advstats/${year}`)
  if (rec?.data?.rowCount >= MIN_ADVSTATS_ROWS && rec.data.lastModified === entry.lastModified) {
    console.log(`[advStats] year=${year} served from cache (rows=${rec.data.rowCount})`)
    return { byId: rec.data.byId, year, complete: true, rowCount: rec.data.rowCount }
  }

  // 3. Fetch from data store
  const json = await tryDataStore(path, { validate: isValidAdvStats, allowInProgress })
  if (!json) return null  // store unavailable / inProgress / shape mismatch

  // 4. Sparsity gate — re-assert MIN_ADVSTATS_ROWS on the served rowCount
  if (json.rowCount < MIN_ADVSTATS_ROWS) {
    console.log(`[advStats] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_ADVSTATS_ROWS}), skipping`)
    return null
  }

  // 5. Cache with lastModified for next-load freshness
  await setCacheWithMeta(`nfl-advstats/${year}`, {
    byId: json.players,
    season: json.season,
    rowCount: json.rowCount,
    lastModified: entry.lastModified,
  }, 999999, {})

  console.log(`[advStats] fetched year=${year} rows=${json.rowCount}`)
  return { byId: json.players, year, complete: true, rowCount: json.rowCount }
}

/**
 * @param {number} currentSeason  most-recent COMPLETED season (careerStats-derived)
 * @returns {Promise<{
 *   byId: Object|null,    // { [sleeper_id]: { position, targetShare, airYardsShare, wopr, racr, components } }
 *   year: number|null,
 *   complete: boolean,
 *   rowCount: number,
 * }>}
 */
export async function loadAdvStats(currentSeason) {
  for (const year of [currentSeason, currentSeason - 1]) {
    const r = await loadAdvStatsYear(year)
    if (r) return r
  }
  return EMPTY
}

/**
 * Exact-year, no-fallback load for the live season. Opts in to `allowInProgress`
 * because a live file *is* in progress. Today the data repo registers it
 * `inProgress: false`, but if that flag were ever corrected to `true`, the default
 * `tryDataStore` gate would silently hide the column.
 *
 * @param {number} year
 * @returns {Promise<{ byId: Object|null, year: number|null, complete: boolean, rowCount: number }>}
 */
export async function loadAdvStatsForSeason(year) {
  return (await loadAdvStatsYear(year, { allowInProgress: true })) ?? EMPTY
}
