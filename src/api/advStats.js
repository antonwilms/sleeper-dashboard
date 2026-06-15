/**
 * src/api/advStats.js
 *
 * VIEW-ONLY. Loads nflverse advanced stats (target share, air-yards share, WOPR,
 * RACR) from the data store and exposes them per sleeper_id for DISPLAY ONLY in the
 * Player Profile. These values MUST NOT feed projectedPPG, the dynasty score, or any
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
 * re-fetches.
 *
 * Probes currentSeason → currentSeason-1 (the most-recent COMPLETED season; in the
 * offseason the upcoming season's advstats are not yet published).
 * MIN_ADVSTATS_ROWS completeness gate: only trust a file with >= 250 rows (matches the
 * data-repo write-gate, shared constant).
 *
 * Graceful absence: store down / no qualifying year / shape mismatch →
 * { byId: null, year: null, complete: false, rowCount: 0 }. The panel then renders
 * nothing (no crash, no NaN).
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidAdvStats } from './dataStore'

// Shared with the data-repo write-gate. Files below this row count are preliminary
// and never trusted/cached as authoritative.
const MIN_ADVSTATS_ROWS = 250

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
    const path = `nflverse/advstats/${year}.json`

    // 1. Manifest check — not in store yet → try next year
    const entry = await getManifestEntry(path)
    if (!entry) continue

    // 2. Cache check (lastModified-aware) — must still satisfy the sparsity gate
    const rec = await getCacheRecord(`nfl-advstats/${year}`)
    if (rec?.data?.rowCount >= MIN_ADVSTATS_ROWS && rec.data.lastModified === entry.lastModified) {
      console.log(`[advStats] year=${year} served from cache (rows=${rec.data.rowCount})`)
      return { byId: rec.data.byId, year, complete: true, rowCount: rec.data.rowCount }
    }

    // 3. Fetch from data store
    const json = await tryDataStore(path, { validate: isValidAdvStats })
    if (!json) continue  // store unavailable / inProgress / shape mismatch → next year

    // 4. Sparsity gate — re-assert MIN_ADVSTATS_ROWS on the served rowCount
    if (json.rowCount < MIN_ADVSTATS_ROWS) {
      console.log(`[advStats] year=${year} too sparse (rowCount=${json.rowCount} < ${MIN_ADVSTATS_ROWS}), skipping`)
      continue
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

  // No qualifying year → graceful absence (panel renders nothing)
  return { byId: null, year: null, complete: false, rowCount: 0 }
}
