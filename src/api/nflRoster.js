/**
 * src/api/nflRoster.js
 *
 * Loads the current NFL roster from the data store (sleeper-dashboard-data),
 * which ingests nflverse release-asset CSVs server-side and serves them as JSON
 * via jsDelivr. The direct nflverse release URLs are CORS-blocked in the browser
 * (302 → release-assets.githubusercontent.com, no Access-Control-Allow-Origin)
 * so this loader goes through the data store instead.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/roster/<year>.json
 *         Produced by: `node bin/update.mjs roster` in sleeper-dashboard-data
 *         (weekly Tuesday Action; content-hash dedup; inProgress: false)
 *
 * `sleeper_id` direct join — no fuzzy matching.
 * ~86% of skill-position rows carry a sleeper_id (roster_2025: ~2141 rows).
 *
 * Cache: `nfl-roster/<year>` per year, permanent TTL (999999 min).
 * Freshness: manifest entry's `lastModified` is stored in the cache record and
 * compared on each load; a changed lastModified triggers a re-fetch so the weekly
 * roster refresh is picked up despite the permanent TTL.
 *
 * Probes currentSeason → currentSeason-1 → currentSeason-2.
 * MIN_ROSTER_IDS completeness gate: only trust a file with ≥ 1500 sleeper_id rows.
 * In the offseason, roster_<upcoming> is not yet published, so the probe typically
 * resolves to currentSeason − 1.
 *
 * Graceful fallback: if the data store is down or no year resolves above the
 * sparsity threshold, returns { activeIds: null, year: null, complete: false,
 * byId: null } — the relevance filter treats all statuses as 'unknown' (no change
 * to prior behavior).
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidRoster } from './dataStore'

// A resolved roster is "complete enough" to trust absences only above this many
// sleeper-id-bearing rows. Matches the data-repo write-gate (shared constant).
const MIN_ROSTER_IDS = 1500

// Status values treated as out-of-league. Only RET is dropped — bias against
// false exclusion. ACT, RES, INA, DEV, CUT, TRD, TRC are all treated as active.
const OUT_STATUSES = new Set(['RET'])

/**
 * Resolves the most-recent AVAILABLE roster year, probing currentSeason downward.
 *
 * @param {number} currentSeason  e.g. 2026 (nflState.season)
 * @returns {Promise<{
 *   activeIds: Set<string>|null,
 *   year: number|null,
 *   complete: boolean,
 *   byId: object|null,
 * }>}
 */
export async function loadCurrentRoster(currentSeason) {
  for (const year of [currentSeason, currentSeason - 1, currentSeason - 2]) {
    const path = `nflverse/roster/${year}.json`

    // 1. Manifest check — if file not in store yet, skip this year (like an old 504)
    const entry = await getManifestEntry(path)
    if (!entry) continue

    // 2. Cache check (lastModified-aware) — serve from IndexedDB if still fresh
    const rec = await getCacheRecord(`nfl-roster/${year}`)
    if (rec?.data?.rowCount >= MIN_ROSTER_IDS && rec.data.lastModified === entry.lastModified) {
      console.log(`[nflRoster] year=${year} served from cache (rows=${rec.data.rowCount})`)
      // Rehydrate activeIds from byId, re-applying OUT_STATUSES
      const activeIds = new Set(
        Object.entries(rec.data.byId)
          .filter(([, p]) => !OUT_STATUSES.has(p.status))
          .map(([id]) => id)
      )
      return { activeIds, year, complete: true, byId: rec.data.byId }
    }

    // 3. Fetch from data store
    const json = await tryDataStore(path, { validate: isValidRoster })
    if (!json) continue  // store unavailable or shape mismatch → try next year

    // 4. Sparsity gate — treat preliminary/sparse files the same as before
    if (json.rowCount < MIN_ROSTER_IDS) {
      console.log(`[nflRoster] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_ROSTER_IDS}), skipping`)
      continue
    }

    // 5. Build byId and activeIds (status filtering stays app-side)
    const byId = json.players
    const activeIds = new Set(
      Object.entries(byId)
        .filter(([, p]) => !OUT_STATUSES.has(p.status))
        .map(([id]) => id)
    )

    // 6. Cache with lastModified so the freshness check works on next load
    await setCacheWithMeta(`nfl-roster/${year}`, {
      byId,
      season: json.season,
      rowCount: json.rowCount,
      lastModified: entry.lastModified,
      activeIds: [...activeIds],
    }, 999999, {})

    console.log(`[nflRoster] fetched year=${year} rows=${json.rowCount} active=${activeIds.size}`)

    return { activeIds, year, complete: true, byId }
  }

  // No year yielded a complete roster → caller falls back to 'unknown' behavior
  return { activeIds: null, year: null, complete: false, byId: null }
}
