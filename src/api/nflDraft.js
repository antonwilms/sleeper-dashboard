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

// Years to load — matches CFBD coverage start. Dynasty rosters are dominated
// by ≤8-year vets; anyone drafted before 2017 won't hit the rookie path.
// The data store stores all years ≥ 2010; we filter here at read time.
const DRAFT_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

/**
 * Loads NFL draft picks for DRAFT_YEARS. Returns { [year]: DraftPick[] }.
 *
 * Flow:
 *   1. Get manifest entry for lastModified freshness token.
 *   2. Check cache for each year (fresh = picks present AND (manifest unavailable OR lastModified matches)).
 *      Manifest unavailable → serve any permanent cached picks rather than marking missing.
 *      All satisfied → return from cache (no network call).
 *   3. Else fetch once from data store.
 *      Store unavailable → return whatever was fresh in cache (graceful).
 *   4. Re-cache all DRAFT_YEARS with new lastModified; return result.
 */
export async function loadNflDraftPicks() {
  const entry = await getManifestEntry('nflverse/draft/draft_picks.json')

  const result = {}
  const missing = []

  // ── 1. Cache check (lastModified-aware) ─────────────────────────────────
  for (const year of DRAFT_YEARS) {
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

  // ── 2. Fetch from data store ─────────────────────────────────────────────
  const json = await tryDataStore('nflverse/draft/draft_picks.json', { validate: isValidDraft })

  if (!json) {
    // Store unavailable — return whatever was fresh in cache; missing years get []
    console.warn('[nflDraft] store unavailable — using cached data only')
    for (const year of missing) {
      result[year] = []
    }
    return result
  }

  // ── 3. Cache all years and populate result ───────────────────────────────
  for (const year of DRAFT_YEARS) {
    const data = json.picksByYear[year] ?? []
    await setCacheWithMeta(`nfl-draft/${year}`, {
      picks: data,
      lastModified: entry?.lastModified ?? null,
    }, 999999, {})
    result[year] = data
  }

  console.log(
    `[nflDraft] fetched from store — picks: ${Object.values(result).reduce((s, a) => s + a.length, 0)}`
  )

  return result
}
