import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./dataStore', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getManifestEntry: vi.fn(), tryDataStore: vi.fn() }
})
vi.mock('../utils/cache', () => ({
  getCacheRecord: vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

import { loadNflSchedule } from './nflSchedule'
import { getManifestEntry, tryDataStore } from './dataStore'
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

const LAST_MODIFIED = '2026-06-01'
const ENTRY = { lastModified: LAST_MODIFIED, schemaVersion: 1, inProgress: false }

const PLAYED_GAME = {
  gameId: '2024_01_KC_BAL', season: 2024, week: 1, gameType: 'REG',
  homeTeam: 'BAL', awayTeam: 'KC', homeScore: 20, awayScore: 27, result: -7,
  spreadLine: 3, totalLine: 46.5, roof: 'open', surface: 'grass', temp: null, wind: null,
}
const UNPLAYED_GAME = {
  ...PLAYED_GAME,
  homeScore: null, awayScore: null, result: null,
  spreadLine: 3, totalLine: 46.5, temp: null, wind: null,
}
const TIE_GAME = { ...PLAYED_GAME, homeScore: 20, awayScore: 20, result: 0 }

function makeJson(rowCount = 272, games = Array.from({ length: rowCount }, () => PLAYED_GAME)) {
  return { schemaVersion: 1, season: 2026, generatedAt: '2026-06-01T00:00:00Z', rowCount, games }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadNflSchedule', () => {
  it('case 1: fresh cache + matching lastModified + rowCount ≥ floor → served from cache', async () => {
    const games = Array.from({ length: 272 }, () => PLAYED_GAME)
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue({ data: { games, rowCount: 272, lastModified: LAST_MODIFIED } })

    const result = await loadNflSchedule(2026)

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(result).toEqual({ games, year: 2026, complete: true, rowCount: 272 })
  })

  it('case 2: cache miss → fetch + cache', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadNflSchedule(2026)

    expect(tryDataStore).toHaveBeenCalledOnce()
    expect(setCacheWithMeta).toHaveBeenCalledOnce()
    const [cacheKey, cacheData, ttl] = setCacheWithMeta.mock.calls[0]
    expect(cacheKey).toBe('nfl-schedule/2026')
    expect(cacheData.lastModified).toBe(LAST_MODIFIED)
    expect(ttl).toBe(999999)
    expect(result.complete).toBe(true)
    expect(result.year).toBe(2026)
    expect(result.rowCount).toBe(272)
  })

  it('case 3: null-scored current-season fixture passes through', async () => {
    const games = Array.from({ length: 272 }, () => UNPLAYED_GAME)
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson(272, games))

    const result = await loadNflSchedule(2026)

    expect(result.complete).toBe(true)
    expect(result.games[0].homeScore).toBeNull()
    expect(result.games[0].awayScore).toBeNull()
    expect(result.games[0].result).toBeNull()
  })

  it('case 4: result === 0 tie preserved', async () => {
    const games = [TIE_GAME, ...Array.from({ length: 271 }, () => PLAYED_GAME)]
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson(272, games))

    const result = await loadNflSchedule(2026)

    expect(result.games[0].result).toBe(0)
    expect(result.games[0].result).toStrictEqual(0)
  })

  it('case 5: below-floor rowCount rejected (loader re-assert)', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson(150))

    const result = await loadNflSchedule(2026)

    expect(result).toEqual({ games: [], year: null, complete: false, rowCount: 0 })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  it('case 6: manifest entry null (store disabled / file absent) → graceful empty', async () => {
    getManifestEntry.mockResolvedValue(null)

    const result = await loadNflSchedule(2026)

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(setCacheWithMeta).not.toHaveBeenCalled()
    expect(result).toEqual({ games: [], year: null, complete: false, rowCount: 0 })
  })

  it('case 7: store unavailable (tryDataStore → null) → graceful empty', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)

    const result = await loadNflSchedule(2026)

    expect(result).toEqual({ games: [], year: null, complete: false, rowCount: 0 })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  it('case 8: stale cache lastModified → re-fetch with new token', async () => {
    const newEntry = { lastModified: '2026-07-01', schemaVersion: 1, inProgress: false }
    getManifestEntry.mockResolvedValue(newEntry)
    getCacheRecord.mockResolvedValue({ data: { games: [], rowCount: 272, lastModified: '2026-05-01' } })
    tryDataStore.mockResolvedValue(makeJson())

    await loadNflSchedule(2026)

    expect(tryDataStore).toHaveBeenCalledOnce()
    const [, cacheData] = setCacheWithMeta.mock.calls[0]
    expect(cacheData.lastModified).toBe('2026-07-01')
  })

  it('case 9: explicit-year signature (no probe)', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson(272, Array.from({ length: 272 }, () => PLAYED_GAME)))

    const result = await loadNflSchedule(2021)

    expect(getManifestEntry).toHaveBeenCalledOnce()
    expect(getManifestEntry.mock.calls[0][0]).toContain('2021')
    const [cacheKey] = setCacheWithMeta.mock.calls[0]
    expect(cacheKey).toBe('nfl-schedule/2021')
    expect(result.year).toBe(2021)
  })
})
