/**
 * src/api/playerIds.js
 *
 * Loads the nflverse player-id crosswalk (CR-31) from the data store and reduces it to the small index
 * the KTC / draft / college matchers join on (src/utils/playerIdCrosswalk.js). The raw ~2 MB file is
 * never cached — only the index.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/playerids.json (schemaVersion 2; produced by
 *         `node bin/update.mjs playerids` in sleeper-dashboard-data)
 * Cache:  `nflverse/playerids` — one record { index, lastModified }, permanent TTL (999999 min).
 *         Fresh = index.version matches and (no manifest entry or lastModified equal).
 * Never throws: an unavailable store resolves to the stale cached index if there is one, else `null`
 * (the matchers then run on their name-only paths).
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { buildPlayerIdIndex, PLAYER_ID_INDEX_VERSION } from '../utils/playerIdCrosswalk'
import { tryDataStore, getManifestEntry, isValidPlayerIds, wasServedStale } from './dataStore'

const PATH = 'nflverse/playerids.json'
const CACHE_KEY = 'nflverse/playerids'

export async function loadPlayerIds() {
  try {
    const entry = await getManifestEntry(PATH)
    const rec = await getCacheRecord(CACHE_KEY)
    const cached = rec?.data?.index?.version === PLAYER_ID_INDEX_VERSION ? rec.data.index : null

    if (cached && (!entry || rec.data.lastModified === entry.lastModified)) {
      console.log('[playerIds] served from cache')
      return cached
    }

    const json = await tryDataStore(PATH, { validate: isValidPlayerIds })
    if (!json) {
      if (cached) {
        console.warn('[playerIds] store unavailable — using stale cached index')
        return cached
      }
      console.warn('[playerIds] store unavailable and no cached index — id joins disabled')
      return null
    }

    const index = buildPlayerIdIndex(json)
    if (!wasServedStale(PATH)) {
      await setCacheWithMeta(CACHE_KEY, { index, lastModified: entry?.lastModified ?? null }, 999999, {})
    }
    console.log(`[playerIds] fetched from store — ${Object.keys(index.bySleeper).length} Sleeper rows`)
    return index
  } catch (err) {
    console.warn('[playerIds] load failed — id joins disabled', err)
    return null
  }
}
