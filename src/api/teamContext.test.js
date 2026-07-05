import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./dataStore', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getManifestEntry: vi.fn(), tryDataStore: vi.fn() }
})
vi.mock('../utils/cache', () => ({
  getCacheRecord: vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

import { loadTeamContext, getTeamSeasonRows, getTeamWeekRow } from './teamContext'
import { getManifestEntry, tryDataStore } from './dataStore'
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

const LAST_MODIFIED = '2026-06-01'
const ENTRY = { lastModified: LAST_MODIFIED, schemaVersion: 1, inProgress: false }

const STL_GAMES = [
  { week: 1, seasonType: 'REG', gameId: '2013_01_ARI_STL', opponent: 'ARI', off: { proe: 0.022, epaPerPlay: 0.053, rzPassRate: 0.8, plays: 70 }, def: { epaPerPlay: -0.055, pointsAllowed: 27 } },
  { week: 19, seasonType: 'POST', gameId: '2013_19_STL_XXX', opponent: 'ARI', off: { proe: 0.01, epaPerPlay: 0.02, rzPassRate: 0.5, plays: 60 }, def: { epaPerPlay: -0.02, pointsAllowed: 20 } },
]
const ARI_GAMES = [
  { week: 1, seasonType: 'REG', gameId: '2013_01_ARI_STL', opponent: 'STL', off: { proe: -0.01, epaPerPlay: -0.01, rzPassRate: 0.4, plays: 65 }, def: { epaPerPlay: 0.03, pointsAllowed: 24 } },
]
const TEAMS = { STL: { games: STL_GAMES }, ARI: { games: ARI_GAMES } }

function makeJson(rowCount = 534, teams = TEAMS) {
  return { schemaVersion: 1, season: 2013, generatedAt: '2013-01-01T00:00:00Z', rowCount, teamCount: Object.keys(teams).length, teams }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadTeamContext', () => {
  it('T1: fresh cache hit — served from cache, tryDataStore not called', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue({ data: { teams: TEAMS, rowCount: 534, lastModified: LAST_MODIFIED } })

    const result = await loadTeamContext(2013)

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(result).toEqual({ teams: TEAMS, year: 2013, complete: true, rowCount: 534 })
  })

  it('T2: cache miss → fetch + cache', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadTeamContext(2013)

    expect(tryDataStore).toHaveBeenCalledOnce()
    expect(setCacheWithMeta).toHaveBeenCalledOnce()
    const [cacheKey, cacheData, ttl] = setCacheWithMeta.mock.calls[0]
    expect(cacheKey).toBe('nfl-teamcontext/2013')
    expect(cacheData.lastModified).toBe(LAST_MODIFIED)
    expect(ttl).toBe(999999)
    expect(result.complete).toBe(true)
  })

  it('T3: below-floor rowCount → EMPTY, no cache write', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson(40))

    const result = await loadTeamContext(2013)

    expect(result).toEqual({ teams: {}, year: null, complete: false, rowCount: 0 })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  it('T4: manifest entry null (absent season / store disabled) → EMPTY, tryDataStore not called', async () => {
    getManifestEntry.mockResolvedValue(null)

    const result = await loadTeamContext(2013)

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(result).toEqual({ teams: {}, year: null, complete: false, rowCount: 0 })
  })

  it('T5: store unavailable / shape mismatch (tryDataStore → null) → EMPTY, no cache write', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)

    const result = await loadTeamContext(2013)

    expect(result).toEqual({ teams: {}, year: null, complete: false, rowCount: 0 })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  it('T6: stale cache lastModified → re-fetch with new token', async () => {
    const newEntry = { lastModified: '2026-07-01', schemaVersion: 1, inProgress: false }
    getManifestEntry.mockResolvedValue(newEntry)
    getCacheRecord.mockResolvedValue({ data: { teams: {}, rowCount: 534, lastModified: '2026-05-01' } })
    tryDataStore.mockResolvedValue(makeJson())

    await loadTeamContext(2013)

    expect(tryDataStore).toHaveBeenCalledOnce()
    const [, cacheData] = setCacheWithMeta.mock.calls[0]
    expect(cacheData.lastModified).toBe('2026-07-01')
  })

  it('T7: explicit-year signature — manifest path and cache key both contain the year', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadTeamContext(2014)

    expect(getManifestEntry.mock.calls[0][0]).toContain('2014')
    const [cacheKey] = setCacheWithMeta.mock.calls[0]
    expect(cacheKey).toBe('nfl-teamcontext/2014')
    expect(result.year).toBe(2014)
  })

  it('T8: pass-through — rate fields unchanged on the returned rows', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadTeamContext(2013)

    const row = result.teams.STL.games[0]
    expect(row.off.proe).toBe(0.022)
    expect(row.off.epaPerPlay).toBe(0.053)
    expect(row.off.rzPassRate).toBe(0.8)
  })

  it('T9: cache-hit floor guard — below-floor cached rowCount falls through to fetch', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue({ data: { teams: {}, rowCount: 40, lastModified: LAST_MODIFIED } })
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadTeamContext(2013)

    expect(tryDataStore).toHaveBeenCalledOnce()
    expect(result.complete).toBe(true)
  })
})

describe('getTeamSeasonRows', () => {
  it('T10: hit returns the games array for an era-accurate code', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())
    const loaded = await loadTeamContext(2013)

    expect(getTeamSeasonRows(loaded, 'STL')).toBe(loaded.teams.STL.games)
  })

  it('T10: miss on era-wrong code returns null (correct by design)', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())
    const loaded = await loadTeamContext(2013)

    expect(getTeamSeasonRows(loaded, 'LA')).toBeNull()
  })

  it('T10: EMPTY-loaded input never throws, returns null', () => {
    expect(getTeamSeasonRows({ teams: {}, year: null, complete: false, rowCount: 0 }, 'STL')).toBeNull()
  })
})

describe('getTeamWeekRow', () => {
  let loaded
  beforeEach(async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())
    loaded = await loadTeamContext(2013)
  })

  it('T11: week 1 returns the REG row', () => {
    expect(getTeamWeekRow(loaded, 'STL', 1)).toBe(STL_GAMES[0])
  })

  it('T11: week 19 (continuous POST week) returns the POST row', () => {
    expect(getTeamWeekRow(loaded, 'STL', 19)).toBe(STL_GAMES[1])
  })

  it('T11: absent week 2 returns null', () => {
    expect(getTeamWeekRow(loaded, 'STL', 2)).toBeNull()
  })

  it('T11: era-wrong team code returns null', () => {
    expect(getTeamWeekRow(loaded, 'LA', 1)).toBeNull()
  })
})
