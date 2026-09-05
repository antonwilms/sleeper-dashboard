import { getCache, setCache } from '../utils/cache'
import { isDataStoreReady, tryDataStore } from './dataStore'
import { isValidKtcSnapshot } from '../utils/ktcHistory'

const CACHE_KEY  = 'ktc-values'
const CACHE_TTL  = 4320 // 3 days

const PROXY_BASE = '/ktc-proxy'

// All skill positions + rookie picks in one filter string
const ALL_FILTERS = 'QB%7CRB%7CWR%7CTE%7CRDP'

// ---------------------------------------------------------------------------
// DOM extraction — parse one page worth of .onePlayer rows
// ---------------------------------------------------------------------------
// Page structure (confirmed from DevTools):
//   div.onePlayer > div.single-ranking-wrapper > div.single-ranking
//     div.player-name > p > a         ← name
//                          span.player-team ← team abbrev
//     div.position-team               ← "QB" / "QB1" / "RB2" …
//     div.value > p                   ← dynasty value integer

function parsePage(html, label) {
  let doc
  try {
    doc = new DOMParser().parseFromString(html, 'text/html')
  } catch (e) {
    console.warn(`[KTC] DOMParser failed (${label}):`, e.message)
    return null
  }

  const rows = doc.querySelectorAll('div.onePlayer')
  console.log(`[KTC] Raw div.onePlayer count (${label}):`, rows.length)
  if (!rows.length) return null

  const players = []
  rows.forEach((el, i) => {
    const name     = el.querySelector('.player-name p a')?.textContent?.trim()
    const team     = el.querySelector('.player-team')?.textContent?.trim() || null
    const rawVal   = el.querySelector('.value p')?.textContent?.trim()
    const value    = rawVal ? parseInt(rawVal.replace(/,/g, ''), 10) : null

    if (!name || value == null || isNaN(value)) {
      console.log(`[KTC] Parsing entry ${i} (${label}): no name found`)
      return
    }

    const posRaw   = el.querySelector('.position-team')?.textContent?.trim() ?? ''
    const posMatch = posRaw.match(/\b(QB|RB|WR|TE|K)/i)
    const position = posMatch ? posMatch[1].toUpperCase() : null

    players.push({ name, team, value, position })
  })

  return players.length > 0 ? players : null
}

// ---------------------------------------------------------------------------
// DEV-only fresher override — the Vite dev proxy forwards server-side, so no
// CORS/proxy-key concerns apply. Never attempted outside `import.meta.env.DEV`:
// there is no equivalent transport in a production/preview build. See
// loadLatestKtcSnapshotFromStore() below for the primary, always-available source.
// ---------------------------------------------------------------------------

async function fetchDevProxyHtml(ktcPath) {
  const res = await fetch(PROXY_BASE + ktcPath)
  if (!res.ok) throw new Error(`dev proxy HTTP ${res.status}`)
  const text = await res.text()
  if (!text.includes('onePlayer')) throw new Error('dev proxy response missing onePlayer markup')
  return text
}

// KTC server caps each response at 50 players — loop pages 0–9 and concatenate
// to cover 300+ dynasty-relevant players, same pagination rule as the data-store
// snapshot capture (scripts/update-ktc.mjs, sibling repo).
async function fetchAllPlayersViaDevProxy() {
  const allPlayers = []
  const seen       = new Set()   // dedup key: "name|team"

  for (let page = 0; page <= 9; page++) {
    const path = `/dynasty-rankings?filters=${ALL_FILTERS}&format=2&page=${page}`
    let players

    try {
      const html = await fetchDevProxyHtml(path)
      players    = parsePage(html, `page ${page}`)
    } catch (e) {
      console.warn(`[KTC] Dev-proxy page ${page} fetch failed:`, e.message)
      break
    }

    if (!players) {
      console.log(`[KTC] Dev-proxy page ${page}: no data — stopping`)
      break
    }

    let newCount = 0
    for (const p of players) {
      const key = `${p.name}|${p.team}`
      if (!seen.has(key)) { seen.add(key); allPlayers.push(p); newCount++ }
    }

    console.log(`[KTC] Dev-proxy page ${page}: ${players.length} rows, ${newCount} new — running total ${allPlayers.length}`)

    // No new players → we've wrapped around or hit the end
    if (newCount === 0) { console.log('[KTC] Dev-proxy: no new players — stopping early'); break }
    // Fewer than 50 → this was the last page
    if (players.length < 50) { console.log('[KTC] Dev-proxy: partial page — done'); break }
  }

  return allPlayers.length > 0 ? allPlayers : null
}

// ---------------------------------------------------------------------------
// Primary source — the most recent ktc/snapshot-<date>.json from the data store.
// Same file family (and same row shape — matchKTCToSleeper/parseKtcPickRows both
// already consume it unmodified) that utils/ktcHistory.js reads for the trend
// window; this just wants the single newest one as the "current value" source.
// ---------------------------------------------------------------------------

const SNAPSHOT_RE = /^ktc\/snapshot-(\d{4}-\d{2}-\d{2})\.json$/

async function loadLatestKtcSnapshotFromStore() {
  if (!(await isDataStoreReady())) return null

  // Coupling note (mirrors utils/ktcHistory.js's own copy of this note): dataStore.js exposes
  // no manifest-enumeration export, so this reads the same 'data-store/manifest' IndexedDB key
  // directly. isDataStoreReady() has already triggered loadManifest(), which caches it there.
  // If dataStore.js ever renames its manifest cache key, update both copies.
  const manifest = await getCache('data-store/manifest')
  if (!manifest) return null

  let latest = null
  for (const path of Object.keys(manifest.files)) {
    const m = SNAPSHOT_RE.exec(path)
    if (!m) continue
    if (!latest || m[1] > latest.date) latest = { path, date: m[1] }
  }
  if (!latest) return null

  // KTC snapshots register inProgress:true by design (a "current-value" marker, not
  // mid-regeneration — see the data repo's Invariant 5), so this read must opt into
  // inProgress entries, same as loadKtcHistory's use of the same flag.
  const data = await tryDataStore(latest.path, { validate: isValidKtcSnapshot, allowInProgress: true })
  if (!data) return null

  console.log(`[KTC] Loaded ${latest.path} from data store (${data.length} rows)`)
  return data
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns an array of { name, team, value, position } on success, null on failure.
 * Never throws — KTC is an optional enhancement.
 *
 * Source order: in DEV, an optional fresher live scrape via the Vite dev proxy is tried
 * first (server-side forward, no CORS concerns) and falls through on any failure; the
 * primary and only production source is the most recent ktc/snapshot-<date>.json in the
 * data store (see loadLatestKtcSnapshotFromStore above).
 */
export async function getKTCValues() {
  console.log('[KTC] Starting fetch...')

  try {
    const cached = await getCache(CACHE_KEY)
    if (cached !== null) {
      console.log('[KTC] Cache hit —', cached.length, 'players')
      return cached
    }

    let players = null

    if (import.meta.env.DEV) {
      players = await fetchAllPlayersViaDevProxy()
    }

    if (!players) {
      players = await loadLatestKtcSnapshotFromStore()
    }

    if (!players) {
      console.warn('[KTC] No player data obtained')
      return null
    }

    console.log(`[KTC] Total: ${players.length} players. Sample:`, players.slice(0, 3))
    await setCache(CACHE_KEY, players, CACHE_TTL)
    return players
  } catch (err) {
    console.warn('[KTC] Unexpected error:', err.message)
    return null
  }
}
