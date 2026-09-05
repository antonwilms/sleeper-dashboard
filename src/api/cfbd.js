import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidCFBDRows } from './dataStore'

const CFBD_BASE = import.meta.env.DEV
  ? '/cfbd-proxy'
  : 'https://api.collegefootballdata.com'

// Bumped from `cfbd-players` when normalizeCollegeStats was made idempotent: pre-fix entries
// could be double-normalized to null (an already-pivoted cache value re-fed through the
// non-idempotent normalizer), and this namespace change lets those stale entries lapse rather
// than being read as valid cache hits.
// Exported so `classifyKey` in utils/exportData.js derives its route from this one
// constant instead of repeating the literal. A namespace bump that is not mirrored
// there silently reroutes every college entry into the export ZIP's raw/ catch-all.
export const CFBD_CACHE_NAMESPACE = 'cfbd-players-v2'

const COLLEGE_START_YEAR = 2017
// Defensive floor for the window's upper bound: the 2026 rookie class needs the
// 2025 college season. The live caller always passes the careerStats-derived
// current-season anchor (which auto-advances), so this floor only guards a
// missing/invalid anchor and a never-regress lower bound — it is not the source
// of truth and does not need an annual bump.
const COLLEGE_MIN_END_YEAR = 2025

// Inclusive CFBD season list, from the 2017 floor up through the later of
// COLLEGE_MIN_END_YEAR and the supplied season anchor. Pure — unit-tested.
export function collegeFetchYears(endYear) {
  const last = Math.max(
    COLLEGE_MIN_END_YEAR,
    Number.isFinite(endYear) ? endYear : COLLEGE_MIN_END_YEAR
  )
  const years = []
  for (let y = COLLEGE_START_YEAR; y <= last; y++) years.push(y)
  return years
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getHeaders() {
  return {
    'Authorization': `Bearer ${import.meta.env.VITE_CFBD_API_KEY}`,
    'Accept': 'application/json',
  }
}

// Normalises any accepted college-stats value (college-pivot.md §2.2) into the pivoted
// { [playerId]: {...} } shape consumed by collegeMatch.js: a long-form row array is pivoted,
// a pivoted envelope's `players` is returned directly, anything else is a miss for the caller.
//
// Idempotent: the cache stores the *normalized* result (§1.4), so a cache-hit read runs
// already-pivoted data back through this function. A flat object with no `players` wrapper is
// therefore treated as already-normalized and returned as-is, not as a miss.
export function normalizeCollegeStats(v) {
  if (Array.isArray(v)) return pivotStatRows(v)
  if (v && typeof v === 'object') return v.players ? v.players : v
  return null
}

export async function getBulkPlayerStats(year, category) {
  const cacheKey = `${CFBD_CACHE_NAMESPACE}/${year}/${category}`

  // (1) Cache check
  const record = await getCacheRecord(cacheKey)
  if (record && record.data !== null) {
    if (record.sourceLastModified) {
      const dsPath = `college/${category}/${year}.json`
      const entry = await getManifestEntry(dsPath)
      if (entry && new Date(entry.lastModified).getTime() > new Date(record.sourceLastModified).getTime()) {
        // Manifest is newer — fall through to data store
      } else {
        const normalized = normalizeCollegeStats(record.data)
        console.log(`[cfbd] cache hit: ${cacheKey} (${Object.keys(normalized ?? {}).length} players, ${Array.isArray(record.data) ? 'long-form' : 'pivoted'} cache entry)`)
        return normalized
      }
    } else {
      // Pre-phase-3 entry — fall through to data store for migration
    }
  }

  // (2) Data store
  const dsPath = `college/${category}/${year}.json`
  const dsResult = await tryDataStore(dsPath, { validate: isValidCFBDRows })
  if (dsResult !== null) {
    const normalized = normalizeCollegeStats(dsResult)
    const entry = await getManifestEntry(dsPath)
    await setCacheWithMeta(cacheKey, normalized, 999999, {
      sourceLastModified: entry?.lastModified ?? null,
      sourceSchemaVersion: entry?.schemaVersion ?? null,
    })
    console.log(`[cfbd] loaded from data store: ${cacheKey} (${Object.keys(normalized ?? {}).length} players, ${Array.isArray(dsResult) ? 'long-form' : 'pivoted'} source)`)
    return normalized
  }

  // (3) Live API
  const url = `${CFBD_BASE}/stats/player/season?year=${year}&category=${category}`
  const res = await fetch(url, { headers: getHeaders() })
  if (!res.ok) throw new Error(`CFBD ${res.status}: ${url}`)
  const data = await res.json()
  const normalized = normalizeCollegeStats(data)
  await setCacheWithMeta(cacheKey, normalized, 999999, {})
  console.log(`[cfbd] fetched ${cacheKey}: (${Object.keys(normalized ?? {}).length} players, long-form source)`)
  return normalized
}

// Groups stat rows by playerId, converting the per-row { statType, stat }
// format into a flat object: { playerId, player, team, position, YDS, TD, ... }
// All stat values are parsed as floats (they arrive as strings).
export function pivotStatRows(rows) {
  const result = {}
  for (const row of rows) {
    if (!result[row.playerId]) {
      result[row.playerId] = {
        playerId:   row.playerId,
        player:     row.player,
        team:       row.team,
        position:   row.position,
        conference: row.conference ?? null,
      }
    }
    result[row.playerId][row.statType] = parseFloat(row.stat)
  }
  return result
}

// Sums YDS and TD per team across all pivoted players.
export function computeTeamTotals(pivotedPlayers) {
  const totals = {}
  for (const p of Object.values(pivotedPlayers)) {
    if (!p.team) continue
    if (!totals[p.team]) totals[p.team] = { YDS: 0, TD: 0 }
    totals[p.team].YDS += p.YDS ?? 0
    totals[p.team].TD  += p.TD  ?? 0
  }
  return totals
}

// D1a — per-year × category player counts for loadCollegeStats' return shape, feeding
// projectionSnapshot's `inputStatus.college` coverage report. Reports a null/missing category
// as 0 rather than throwing — that gap (a bad cache entry, a failed fetch year) is exactly the
// failure mode this report exists to surface, not to crash on. Pure; does not widen
// loadCollegeStats' own return shape.
//
// `expectedYears` (optional) is the year list to iterate — pass `collegeFetchYears(anchor)` so a
// year missing from `receiving` ENTIRELY still reports as `{ receiving: 0, rushing: 0, passing: 0 }`
// instead of being absent from coverage altogether (which read as "nothing to check" rather than
// "empty", the false-negative this helper exists to catch). Omit it to fall back to today's
// union-of-`receiving` behaviour, which keeps this helper independently testable without a caller.
export function countCollegeCoverage({ receiving, rushing, passing }, expectedYears) {
  const years = expectedYears ?? Object.keys(receiving ?? {})
  const coverage = {}
  for (const year of years) {
    coverage[year] = {
      receiving: Object.keys(receiving?.[year] ?? {}).length,
      rushing:   Object.keys(rushing?.[year]   ?? {}).length,
      passing:   Object.keys(passing?.[year]   ?? {}).length,
    }
  }
  return coverage
}

export async function loadCollegeStats(endYear) {
  const receiving = {}
  const rushing   = {}
  const passing   = {}

  const years = collegeFetchYears(endYear)

  for (let i = 0; i < years.length; i++) {
    const year = years[i]
    receiving[year] = await getBulkPlayerStats(year, 'receiving')
    rushing[year]   = await getBulkPlayerStats(year, 'rushing')
    passing[year]   = await getBulkPlayerStats(year, 'passing')
    console.log(`[cfbd] ${year} rec: ${Object.keys(receiving[year] ?? {}).length} players, rush: ${Object.keys(rushing[year] ?? {}).length} players, pass: ${Object.keys(passing[year] ?? {}).length} players`)
    if (i < years.length - 1) await delay(400)   // preserve inter-year rate-limit pacing
  }

  return { receiving, rushing, passing }
}
