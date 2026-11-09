/**
 * src/api/nflOline.js
 *
 * READ-ONLY / LOADER-ONLY. Loads nflverse offensive-line depth (`nflverse/oline/<year>.json`) from
 * the data store for DISPLAY use only (the team page's depth chart, `?view=depth`). These values MUST
 * NOT feed the playerRows pipeline, projectedPPG, the dynasty score, or any projection `factors`
 * entry; enforced by src/__tests__/olineViewOnly.test.js. Do not import this module from any
 * projection/scoring file.
 *
 * Source: ${VITE_DATA_STORE_URL}/nflverse/oline/<year>.json (CR-35). Served shape:
 * { schemaVersion, season, generatedAt, rowCount, teams: { [scheduleAbbr]: { states: [
 *   { week, date, dt, ol: [{ slot, rank, name, gsisId, espnId }] } ] } } }.
 * Team keys are the schedule domain (LA, not LAR).
 *
 * Only the LATEST state per team (max `dt`, see depthChart.selectLatestOlineStates) is kept and
 * cached — never the full multi-MB file.
 *
 * Cache: `nfl-oline/<year>`, permanent TTL; freshness via the manifest entry's `lastModified`.
 *
 * Graceful absence: store down / disabled / file absent from manifest / shape mismatch →
 * OLINE_EMPTY. Consumers branch on `complete`, never on key presence.
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidOline, wasServedStale } from './dataStore'
import { selectLatestOlineStates } from '../utils/depthChart'

export const OLINE_EMPTY = Object.freeze({
  latestByTeam: Object.freeze({}), year: null, complete: false, generatedAt: null,
})

/**
 * @param {number} year explicit NFL season (= parseInt(nflState.season, 10))
 * @returns {Promise<{ latestByTeam: Object, year: number|null, complete: boolean, generatedAt: string|null }>}
 */
export async function loadNflOline(year) {
  const path = `nflverse/oline/${year}.json`

  const entry = await getManifestEntry(path)
  if (!entry) return { ...OLINE_EMPTY }

  const rec = await getCacheRecord(`nfl-oline/${year}`)
  if (rec?.data?.lastModified === entry.lastModified && rec?.data?.latestByTeam) {
    return { latestByTeam: rec.data.latestByTeam, year, complete: true, generatedAt: rec.data.generatedAt }
  }

  const json = await tryDataStore(path, { validate: isValidOline })
  if (!json) return { ...OLINE_EMPTY }

  const latestByTeam = selectLatestOlineStates(json.teams)
  if (!wasServedStale(path)) {
    await setCacheWithMeta(`nfl-oline/${year}`, {
      latestByTeam,
      generatedAt: json.generatedAt,
      lastModified: entry.lastModified,
    }, 999999, {})
  }
  return { latestByTeam, year, complete: true, generatedAt: json.generatedAt }
}
