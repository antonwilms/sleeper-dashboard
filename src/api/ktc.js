import { getCache, setCache } from '../utils/cache'

const CACHE_KEY  = 'ktc-values'
const CACHE_TTL  = 4320 // 3 days

const KTC_BASE   = 'https://keeptradecut.com'
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
// HTTP — Vite proxy first, corsproxy.io fallback
// ---------------------------------------------------------------------------

async function fetchHtml(ktcPath) {
  if (import.meta.env.DEV) {
    try {
      const res = await fetch(PROXY_BASE + ktcPath)
      if (res.ok) {
        const text = await res.text()
        if (text.includes('onePlayer')) return text
      }
    } catch { /* proxy not running — fall through */ }
  }

  const res = await fetch('https://corsproxy.io/?' + encodeURIComponent(KTC_BASE + ktcPath))
  if (!res.ok) throw new Error(`corsproxy HTTP ${res.status}`)
  return res.text()
}

// ---------------------------------------------------------------------------
// Paginated collection — KTC server caps each response at 50 players.
// Fetch pages 1–6 and concatenate to cover 300+ dynasty-relevant players.
// ---------------------------------------------------------------------------

async function fetchAllPlayers() {
  const allPlayers = []
  const seen       = new Set()   // dedup key: "name|team"

  for (let page = 0; page <= 9; page++) {
    const path = `/dynasty-rankings?filters=${ALL_FILTERS}&format=2&page=${page}`
    let players = null

    try {
      const html = await fetchHtml(path)
      players    = parsePage(html, `page ${page}`)
    } catch (e) {
      console.warn(`[KTC] Page ${page} fetch failed:`, e.message)
      break
    }

    if (!players) {
      console.log(`[KTC] Page ${page}: no data — stopping`)
      break
    }

    let newCount = 0
    for (const p of players) {
      const key = `${p.name}|${p.team}`
      if (!seen.has(key)) { seen.add(key); allPlayers.push(p); newCount++ }
    }

    console.log(`[KTC] Page ${page}: ${players.length} rows, ${newCount} new — running total ${allPlayers.length}`)

    // No new players → we've wrapped around or hit the end
    if (newCount === 0) { console.log('[KTC] No new players — stopping early'); break }
    // Fewer than 50 → this was the last page
    if (players.length < 50) { console.log('[KTC] Partial page — done'); break }
  }

  return allPlayers.length > 0 ? allPlayers : null
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns an array of { name, team, value, position } on success, null on failure.
 * Never throws — KTC is an optional enhancement.
 */
export async function getKTCValues() {
  console.log('[KTC] Starting fetch...')

  try {
    const cached = await getCache(CACHE_KEY)
    if (cached !== null) {
      console.log('[KTC] Cache hit —', cached.length, 'players')
      return cached
    }

    const players = await fetchAllPlayers()
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
