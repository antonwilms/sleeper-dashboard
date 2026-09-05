/**
 * src/api/nflDraft.js
 *
 * Loads NFL draft picks from the data store (sleeper-dashboard-data),
 * which ingests the nflverse release-asset CSV server-side and serves it as JSON
 * via jsDelivr. The direct nflverse release URL is CORS-blocked in the browser
 * (302 → release-assets.githubusercontent.com, no Access-Control-Allow-Origin)
 * and the old @master jsDelivr path no longer serves nflverse data.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/draft/draft_picks.json
 *         Produced by: `node bin/update.mjs draft` in sleeper-dashboard-data
 *         (yearly May Action; inProgress: false)
 *
 * JSON shape: { schemaVersion: 1, picksByYear: { [year]: DraftPick[] }, count }
 * DraftPick = { year, round, pick, team, fullName, position, college, age|null }
 *
 * Cache: `nfl-draft/<year>` per year, permanent TTL (999999 min).
 * `nfl-draft/years` caches the derived year list itself (same TTL/freshness rule)
 * so a fully-fresh cache never needs a network round trip just to learn which
 * years exist.
 * Freshness: manifest entry's `lastModified` stored in each cache record.
 * A changed lastModified triggers a full re-fetch so draft-day additions land.
 * Old-format cache entries (pre-migration, stored as raw arrays) lack lastModified,
 * fail the freshness check, and re-fetch harmlessly — no migration needed.
 *
 * Return shape: { [year]: DraftPick[] } — identical to before, so matchNflDraftToSleeper,
 * App.jsx, and nflDraftMatch.js are all unchanged.
 *
 * UDFA note: nflverse draft CSV does not include UDFAs. A UDFA looks identical to
 * a name-match miss: no entry in nflDraftMatches → nflDraftMultiplier = 1.0 (neutral).
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidDraft } from './dataStore'

// Dynasty rosters are dominated by ≤8-year vets, so years before this never hit
// the rookie path — no need to load or cache picks earlier than the CFBD coverage start.
const MIN_DRAFT_YEAR = 2017
const YEARS_CACHE_KEY = 'nfl-draft/years'

function deriveDraftYears(picksByYear) {
  const currentYear = new Date().getFullYear()
  return Object.keys(picksByYear)
    .map(Number)
    .filter((y) => y >= MIN_DRAFT_YEAR && y <= currentYear)
    .sort((a, b) => a - b)
}

// Reads the cached year list, honoring the same lastModified-freshness rule as
// individual year records. Returns null when the list is unknown or stale —
// callers must fetch from the store to (re)learn it.
async function getCachedDraftYears(entry) {
  const rec = await getCacheRecord(YEARS_CACHE_KEY)
  if (rec?.data?.years && (!entry || rec.data.lastModified === entry.lastModified)) {
    return rec.data.years
  }
  return null
}

/**
 * Loads NFL draft picks for every year ≥ 2017 present in the store, through the
 * current season. Returns { [year]: DraftPick[] }.
 *
 * Flow:
 *   1. Get manifest entry for lastModified freshness token.
 *   2. Resolve the year list: from cache if fresh, else unknown (must fetch).
 *   3. If years are known, check cache for each year (fresh = picks present AND
 *      (manifest unavailable OR lastModified matches)).
 *      Manifest unavailable → serve any permanent cached picks rather than marking missing.
 *      All satisfied → return from cache (no network call).
 *   4. Else fetch once from data store, deriving the year list from picksByYear's keys.
 *      Store unavailable → return whatever was fresh in cache (graceful); if the
 *      year list itself was unknown, return {} (nothing to serve).
 *   5. Re-cache all years (and the year list) with new lastModified; return result.
 */
export async function loadNflDraftPicks() {
  const entry = await getManifestEntry('nflverse/draft/draft_picks.json')
  const cachedYears = await getCachedDraftYears(entry)

  const result = {}
  const missing = []

  // ── 1. Cache check (lastModified-aware), only possible once years are known ──
  if (cachedYears) {
    for (const year of cachedYears) {
      const rec = await getCacheRecord(`nfl-draft/${year}`)
      if (rec?.data?.picks && (!entry || rec.data.lastModified === entry.lastModified)) {
        result[year] = rec.data.picks
      } else {
        missing.push(year)
      }
    }

    if (missing.length === 0) {
      console.log('[nflDraft] all years served from cache')
      return result
    }
  }

  // ── 2. Fetch from data store ─────────────────────────────────────────────
  const json = await tryDataStore('nflverse/draft/draft_picks.json', { validate: isValidDraft })

  if (!json) {
    if (!cachedYears) {
      console.warn('[nflDraft] store unavailable and year list unknown — returning empty')
      return {}
    }
    // Store unavailable — return whatever was fresh in cache; missing years get []
    console.warn('[nflDraft] store unavailable — using cached data only')
    for (const year of missing) {
      result[year] = []
    }
    return result
  }

  // ── 3. Derive the year list from the store and cache everything ─────────
  const draftYears = deriveDraftYears(json.picksByYear)
  await setCacheWithMeta(YEARS_CACHE_KEY, {
    years: draftYears,
    lastModified: entry?.lastModified ?? null,
  }, 999999, {})

  const fullResult = {}
  for (const year of draftYears) {
    const data = json.picksByYear[year] ?? []
    await setCacheWithMeta(`nfl-draft/${year}`, {
      picks: data,
      lastModified: entry?.lastModified ?? null,
    }, 999999, {})
    fullResult[year] = data
  }

  console.log(
    `[nflDraft] fetched from store — picks: ${Object.values(fullResult).reduce((s, a) => s + a.length, 0)}`
  )

  return fullResult
}
