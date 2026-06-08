/**
 * src/api/nflRoster.js
 *
 * Loads the current NFL roster from nflverse release assets.
 * No API key required.
 *
 * Source: nflverse/nflverse-data, roster_<year>.csv (release asset)
 * URL pattern: release-download (NOT @master jsDelivr — nflverse no longer serves data via @master).
 * Has a `sleeper_id` column → direct join to Sleeper player IDs; no fuzzy matching.
 * ~86% of skill-position rows carry a sleeper_id (roster_2025: 834/972 skill rows).
 *
 * Absence signal is clean (genuine retirees fully absent from roster file).
 * Presence signal is authoritative but permissive (some stale INA rows exist).
 *
 * Cache: `nfl-roster/<year>` per year, permanent TTL (999999 min).
 * Probes currentSeason → currentSeason-1 → currentSeason-2.
 * MIN_ROSTER_IDS completeness gate: only trust a file with ≥1500 sleeper_id rows.
 * In the offseason, the upcoming-season file is unpublished (HTTP 504) → falls back to prior year.
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

// Release-asset base (NOT @master jsDelivr — that no longer serves nflverse data).
const NFLVERSE_ROSTER_URL = year =>
  `https://github.com/nflverse/nflverse-data/releases/download/rosters/roster_${year}.csv`

// A resolved roster is "complete enough" to trust absences only above this many
// sleeper-id-bearing rows. roster_2025 has ~2141; a preliminary file has a few hundred.
const MIN_ROSTER_IDS = 1500

// Status values treated as out-of-league. Only RET is dropped — bias against false exclusion.
// ACT, RES, INA, DEV, CUT, TRD, TRC are all treated as still active.
const OUT_STATUSES = new Set(['RET'])

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

/**
 * Splits a single CSV line respecting double-quoted fields.
 * Handles "Smith, Jr." style names without splitting on the internal comma.
 */
function splitCsvLine(line) {
  const fields = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuote = !inQuote
    } else if (ch === ',' && !inQuote) {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields
}

/**
 * Parses the nflverse roster CSV for a single season.
 * Column-defensive: requires `sleeper_id` + `status`; if missing, logs once and
 * returns an empty result.
 *
 * @param {string} csvText
 * @returns {{
 *   activeIds: Set<string>,          // sleeper_ids with status ∉ OUT_STATUSES
 *   byId: { [sleeperId]: { team, position, status, fullName } },
 *   season: number|null,
 *   rowCount: number                 // sleeper-id-bearing rows parsed
 * }}
 */
export function parseRosterCsv(csvText) {
  const empty = { activeIds: new Set(), byId: {}, season: null, rowCount: 0 }
  if (!csvText || typeof csvText !== 'string') return empty

  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) return empty

  const header = splitCsvLine(lines[0])
  const col = name => header.indexOf(name)

  const iSleeperId = col('sleeper_id')
  const iStatus    = col('status')

  if (iSleeperId === -1 || iStatus === -1) {
    const missing = [iSleeperId === -1 && 'sleeper_id', iStatus === -1 && 'status'].filter(Boolean)
    console.warn('[nflRoster] parseRosterCsv: missing required columns:', missing.join(', '))
    return empty
  }

  const iSeason   = col('season')
  const iTeam     = col('team')
  const iPosition = col('position')
  const iName     = col('full_name')

  const activeIds = new Set()
  const byId = {}
  let season = null
  let rowCount = 0

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i])
    const sleeperId = fields[iSleeperId]?.trim()
    if (!sleeperId) continue  // skip rows with no sleeper_id — can't join

    rowCount++

    if (season === null && iSeason >= 0) {
      const s = Number(fields[iSeason]?.trim())
      if (Number.isFinite(s)) season = s
    }

    const status   = fields[iStatus]?.trim()   ?? ''
    const team     = iTeam     >= 0 ? (fields[iTeam]?.trim()     ?? '') : ''
    const position = iPosition >= 0 ? (fields[iPosition]?.trim() ?? '') : ''
    const fullName = iName     >= 0 ? (fields[iName]?.trim()     ?? '') : ''

    byId[sleeperId] = { team, position, status, fullName }
    if (!OUT_STATUSES.has(status)) {
      activeIds.add(sleeperId)
    }
  }

  return { activeIds, byId, season, rowCount }
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Resolves the most-recent AVAILABLE roster, probing currentSeason downward.
 * Mirrors nflDraft.js cache+fetch+graceful-catch pattern.
 *
 * @param {number} currentSeason  e.g. 2026 (nflState.season — the actual current/upcoming NFL season)
 * @returns {Promise<{
 *   activeIds: Set<string>|null,   // null when nothing usable resolved
 *   year: number|null,             // the resolved roster year (e.g. 2025)
 *   complete: boolean,             // rowCount >= MIN_ROSTER_IDS
 *   byId: object|null,
 * }>}
 */
export async function loadCurrentRoster(currentSeason) {
  for (const year of [currentSeason, currentSeason - 1, currentSeason - 2]) {
    // 1. Cache check (permanent TTL)
    const rec = await getCacheRecord(`nfl-roster/${year}`)
    if (rec?.data && Array.isArray(rec.data.activeIds) && rec.data.rowCount >= MIN_ROSTER_IDS) {
      console.log(`[nflRoster] year=${year} served from cache (rows=${rec.data.rowCount})`)
      return {
        activeIds: new Set(rec.data.activeIds),
        year,
        complete: true,
        byId: rec.data.byId ?? null,
      }
    }

    // 2. Fetch with 5s timeout
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      let res
      try {
        res = await fetch(NFLVERSE_ROSTER_URL(year), { signal: controller.signal })
      } finally {
        clearTimeout(timer)
      }

      if (!res.ok) continue  // non-200 (e.g. 504 for unpublished year) → try next

      const csvText = await res.text()
      const parsed  = parseRosterCsv(csvText)

      if (parsed.rowCount < MIN_ROSTER_IDS) {
        // Sparse/preliminary file — do NOT cache as authoritative; try older year
        console.log(`[nflRoster] year=${year} too sparse (rows=${parsed.rowCount} < ${MIN_ROSTER_IDS}), skipping`)
        continue
      }

      // Cache with permanent TTL — serialize Set as array for IndexedDB
      await setCacheWithMeta(`nfl-roster/${year}`, {
        activeIds: [...parsed.activeIds],
        byId: parsed.byId,
        season: parsed.season,
        rowCount: parsed.rowCount,
      }, 999999, {})

      console.log(`[nflRoster] fetched year=${year} rows=${parsed.rowCount} active=${parsed.activeIds.size}`)

      return {
        activeIds: parsed.activeIds,
        year,
        complete: true,
        byId: parsed.byId,
      }
    } catch {
      // Network error or AbortError → try next year
    }
  }

  // No year yielded a complete roster → caller falls back to current behavior
  return { activeIds: null, year: null, complete: false, byId: null }
}
