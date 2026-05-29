import { getCacheRecord, setCacheWithMeta } from '../utils/cache'
import { tryDataStore, getManifestEntry, isValidCFBDRows } from './dataStore'

const CFBD_BASE = import.meta.env.DEV
  ? '/cfbd-proxy'
  : 'https://api.collegefootballdata.com'

const COLLEGE_YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024]

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function getHeaders() {
  return {
    'Authorization': `Bearer ${import.meta.env.VITE_CFBD_API_KEY}`,
    'Accept': 'application/json',
  }
}

export async function getBulkPlayerStats(year, category) {
  const cacheKey = `cfbd-players/${year}/${category}`

  // (1) Cache check
  const record = await getCacheRecord(cacheKey)
  if (record && record.data !== null) {
    if (record.sourceLastModified) {
      const dsPath = `college/${category}/${year}.json`
      const entry = await getManifestEntry(dsPath)
      if (entry && new Date(entry.lastModified).getTime() > new Date(record.sourceLastModified).getTime()) {
        // Manifest is newer — fall through to data store
      } else {
        console.log(`[cfbd] cache hit: ${cacheKey} (${record.data.length} entries)`)
        return record.data
      }
    } else {
      // Pre-phase-3 entry — fall through to data store for migration
    }
  }

  // (2) Data store
  const dsPath = `college/${category}/${year}.json`
  const dsResult = await tryDataStore(dsPath, { validate: isValidCFBDRows })
  if (dsResult !== null) {
    const entry = await getManifestEntry(dsPath)
    await setCacheWithMeta(cacheKey, dsResult, 999999, {
      sourceLastModified: entry?.lastModified ?? null,
      sourceSchemaVersion: entry?.schemaVersion ?? null,
    })
    console.log(`[cfbd] loaded from data store: ${cacheKey} (${dsResult.length} rows)`)
    return dsResult
  }

  // (3) Live API
  const url = `${CFBD_BASE}/stats/player/season?year=${year}&category=${category}`
  const res = await fetch(url, { headers: getHeaders() })
  if (!res.ok) throw new Error(`CFBD ${res.status}: ${url}`)
  const data = await res.json()
  await setCacheWithMeta(cacheKey, data, 999999, {})
  console.log(`[cfbd] fetched ${cacheKey}: ${data.length} rows`)
  return data
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

export async function loadCollegeStats() {
  const receiving = {}
  const rushing   = {}
  const passing   = {}

  for (let i = 0; i < COLLEGE_YEARS.length; i++) {
    const year = COLLEGE_YEARS[i]
    receiving[year] = await getBulkPlayerStats(year, 'receiving')
    rushing[year]   = await getBulkPlayerStats(year, 'rushing')
    passing[year]   = await getBulkPlayerStats(year, 'passing')
    console.log(`[cfbd] ${year} rec: ${receiving[year].length}, rush: ${rushing[year].length}, pass: ${passing[year].length}`)
    if (i < COLLEGE_YEARS.length - 1) await delay(400)
  }

  return { receiving, rushing, passing }
}
