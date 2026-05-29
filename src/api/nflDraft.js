/**
 * src/api/nflDraft.js
 *
 * Loads NFL draft picks from nflverse via jsDelivr CDN. No API key required.
 *
 * Source: nflverse/nflverse-data, draft_picks.csv
 * URL pinned to @master for always-current data. Column-defensive parsing
 * tolerates added columns; missing-column handling is graceful (logs once,
 * returns {}). For reproducibility, bump @master to a specific release tag
 * (e.g. @release-draft_picks-2025-04-29) if CDN drift becomes a concern.
 *
 * Verified column set (as of 2025-04-29, nflverse draft_picks.csv):
 *   season, round, pick, team, pfr_player_name, cfb_player_name,
 *   position, college, age  — all present in the dataset.
 * File size: ~350 KB uncompressed (~80 KB gzip) for full history.
 * Year range in CSV: 1936–current; we filter to DRAFT_YEARS at parse time.
 *
 * Cache strategy: `nfl-draft/<year>` per year, permanent TTL (999999 min).
 * Matches CFBD precedent. A future "D1b" batch can migrate to the
 * sleeper-dashboard-data repo distribution pattern — not done here.
 *
 * UDFA note: nflverse draft CSV does not include UDFAs. From the projection's
 * perspective a UDFA looks identical to a name-match miss: no entry in
 * nflDraftMatches → nflDraftMultiplier = 1.0 (neutral). Distinguishing
 * verified UDFAs from match misses is deferred to a future batch (D1.5).
 */

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

// Pin to @master for always-current data (see module header for release-tag option).
const NFLVERSE_DRAFT_URL =
  'https://cdn.jsdelivr.net/gh/nflverse/nflverse-data@master/data/draft_picks/draft_picks.csv'

// Years to load — matches CFBD coverage start. Dynasty rosters are dominated
// by ≤8-year vets; anyone drafted before 2017 won't hit the rookie path.
const DRAFT_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

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
 * Parses the full nflverse draft_picks CSV string into a per-year object.
 *
 * @param {string} csvText
 * @returns {{ [year: number]: DraftPick[] }}
 *          DraftPick = { year, round, pick, team, fullName, position, college, age }
 *          Returns {} if any required column is missing (logs once).
 */
export function parseDraftCsv(csvText) {
  if (!csvText || typeof csvText !== 'string') return {}

  const lines = csvText.split('\n').filter(l => l.trim())
  if (lines.length < 2) return {}

  const header = splitCsvLine(lines[0])
  const col = name => header.indexOf(name)

  // Required columns — fail-soft if any missing
  const REQUIRED = ['season', 'round', 'pick', 'pfr_player_name']
  const missing = REQUIRED.filter(c => col(c) === -1)
  if (missing.length > 0) {
    console.warn('[nflDraft] parseDraftCsv: missing required columns:', missing.join(', '))
    return {}
  }

  const iSeason  = col('season')
  const iRound   = col('round')
  const iPick    = col('pick')
  const iTeam    = col('team')
  const iPrimary = col('pfr_player_name')    // primary name source
  const iFallbk  = col('cfb_player_name')    // fallback
  const iPos     = col('position')
  const iCollege = col('college')
  const iAge     = col('age')

  const result = {}
  let malformedCount = 0

  for (let i = 1; i < lines.length; i++) {
    const fields = splitCsvLine(lines[i])
    if (fields.length < header.length - 2) continue   // allow a couple of trailing empties

    const season = Number(fields[iSeason])
    if (!DRAFT_YEARS.includes(season)) continue        // filter to our year window

    const roundRaw = fields[iRound]?.trim()
    if (!roundRaw || roundRaw === 'NA' || roundRaw === 'supplemental' || roundRaw === '') continue
    const round = Number(roundRaw)
    if (!Number.isFinite(round) || round < 1 || round > 10) {
      malformedCount++
      continue
    }

    const pick = Number(fields[iPick])
    if (!Number.isFinite(pick)) { malformedCount++; continue }

    const fullName = (
      (iFallbk >= 0 ? fields[iFallbk]?.trim() : '') ||
      fields[iPrimary]?.trim() ||
      ''
    )
    if (!fullName) continue

    const age = iAge >= 0 ? Number(fields[iAge]) : NaN

    const entry = {
      year:     season,
      round,
      pick,
      team:     iTeam >= 0 ? (fields[iTeam]?.trim() ?? '') : '',
      fullName: fullName.replace(/^"|"$/g, ''),   // strip stray outer quotes
      position: iPos >= 0 ? (fields[iPos]?.trim() ?? '') : '',
      college:  iCollege >= 0 ? (fields[iCollege]?.trim() ?? '') : '',
      age:      Number.isFinite(age) ? age : null,
    }

    if (!result[season]) result[season] = []
    result[season].push(entry)
  }

  if (malformedCount > 0) {
    console.warn(`[nflDraft] parseDraftCsv: skipped ${malformedCount} malformed rows`)
  }

  return result
}

// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------

/**
 * Loads NFL draft picks for DRAFT_YEARS. Returns { [year]: DraftPick[] }.
 *
 * Flow:
 *   1. For each year, try cache (nfl-draft/<year>) first.
 *   2. If any year is missing, fetch the full CSV once, parse, and cache each
 *      year independently (permanent TTL).
 *   3. On fetch failure, return whatever cached years exist (possibly {}).
 */
export async function loadNflDraftPicks() {
  const result = {}
  const missing = []

  // ── 1. Cache check ──────────────────────────────────────────────────────
  for (const year of DRAFT_YEARS) {
    const rec = await getCacheRecord(`nfl-draft/${year}`)
    if (rec && Array.isArray(rec.data) && rec.data.length > 0) {
      result[year] = rec.data
    } else {
      missing.push(year)
    }
  }

  if (missing.length === 0) {
    console.log('[nflDraft] all years served from cache')
    return result
  }

  // ── 2. Fetch CSV ────────────────────────────────────────────────────────
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch(NFLVERSE_DRAFT_URL, { signal: controller.signal })
    clearTimeout(timer)

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const csvText = await res.text()
    const parsed  = parseDraftCsv(csvText)

    // Cache each missing year independently (permanent TTL = 999999 min)
    for (const year of missing) {
      const data = parsed[year] ?? []
      await setCacheWithMeta(`nfl-draft/${year}`, data, 999999, {})
      result[year] = data
    }

    console.log(
      `[nflDraft] fetched CSV — years loaded: ${Object.keys(result).length},`,
      `picks: ${Object.values(result).reduce((s, a) => s + a.length, 0)}`
    )
  } catch (err) {
    console.warn('[nflDraft] fetch failed:', err.message, '— using cached data only')
  }

  return result
}
