import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./dataStore', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getManifestEntry: vi.fn(), tryDataStore: vi.fn() }
})
vi.mock('../utils/cache', () => ({
  getCacheRecord: vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

import { loadNflGameLogs } from './nflGameLogs'
import { getManifestEntry, tryDataStore } from './dataStore'
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

const LAST_MODIFIED = '2026-06-01'
const ENTRY = { lastModified: LAST_MODIFIED, schemaVersion: 1, inProgress: false }
const GAME_FULL = { week: 1, seasonType: 'REG', team: 'KC', opponent: 'BAL', receptions: 0, recYards: 0, racr: 1.2, targetShare: 0.18 }
const GAME_SPARSE = { week: 2, seasonType: 'REG', team: 'KC', opponent: 'CIN' } // absent stat keys
const PLAYERS = { '111': { gsisId: '00-1', name: 'A', position: 'WR', games: [GAME_FULL, GAME_SPARSE] } }
// declared rowCount drives the floor; the players object need not actually contain 3000 games
function makeJson(rowCount = 3200, players = PLAYERS) {
  return { schemaVersion: 1, season: 2023, generatedAt: '2023-01-01T00:00:00Z', rowCount, playerCount: Object.keys(players).length, unmapped: 0, players }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('loadNflGameLogs', () => {
  it('T1: fresh cache + matching lastModified + rowCount ≥ floor → served from cache', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue({ data: { players: PLAYERS, rowCount: 3200, lastModified: LAST_MODIFIED } })

    const result = await loadNflGameLogs(2023)

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(result).toEqual({ players: PLAYERS, year: 2023, complete: true, rowCount: 3200 })
  })

  it('T2: cache miss → fetch + cache', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadNflGameLogs(2023)

    expect(tryDataStore).toHaveBeenCalledOnce()
    expect(setCacheWithMeta).toHaveBeenCalledOnce()
    const [cacheKey, cacheData, ttl] = setCacheWithMeta.mock.calls[0]
    expect(cacheKey).toBe('nfl-gamelogs/2023')
    expect(cacheData.lastModified).toBe(LAST_MODIFIED)
    expect(ttl).toBe(999999)
    expect(result.complete).toBe(true)
    expect(result.year).toBe(2023)
    expect(result.rowCount).toBe(3200)
  })

  it('T3: sparse-null pass-through — present 0 preserved, absent key not coerced', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadNflGameLogs(2023)

    expect(result.players['111'].games[0].receptions).toBe(0)
    expect('recYards' in result.players['111'].games[1]).toBe(false)
    expect(result.players['111'].games[1].recYards).toBeUndefined()
  })

  it('T4: per-game rate field passed through unchanged (not summed/altered)', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadNflGameLogs(2023)

    expect(result.players['111'].games[0].racr).toBe(1.2)
    expect(result.players['111'].games[0].targetShare).toBe(0.18)
  })

  it('T5: below-floor rowCount rejected (loader re-assert)', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson(2000))

    const result = await loadNflGameLogs(2023)

    expect(result).toEqual({ players: {}, year: null, complete: false, rowCount: 0 })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  it('T6: manifest entry null (store disabled / file absent — the 2019 gap)', async () => {
    getManifestEntry.mockResolvedValue(null)

    const result = await loadNflGameLogs(2023)

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(setCacheWithMeta).not.toHaveBeenCalled()
    expect(result).toEqual({ players: {}, year: null, complete: false, rowCount: 0 })
  })

  it('T7: absent 2019 specifically → empty', async () => {
    getManifestEntry.mockResolvedValue(null)

    const result = await loadNflGameLogs(2019)

    expect(getManifestEntry).toHaveBeenCalledOnce()
    expect(getManifestEntry.mock.calls[0][0]).toContain('2019')
    expect(result).toEqual({ players: {}, year: null, complete: false, rowCount: 0 })
  })

  it('T8: store unavailable (tryDataStore → null) → empty', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)

    const result = await loadNflGameLogs(2023)

    expect(result).toEqual({ players: {}, year: null, complete: false, rowCount: 0 })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  it('T9: stale cache lastModified → re-fetch with new token', async () => {
    const newEntry = { lastModified: '2026-07-01', schemaVersion: 1, inProgress: false }
    getManifestEntry.mockResolvedValue(newEntry)
    getCacheRecord.mockResolvedValue({ data: { players: {}, rowCount: 3200, lastModified: '2026-05-01' } })
    tryDataStore.mockResolvedValue(makeJson())

    await loadNflGameLogs(2023)

    expect(tryDataStore).toHaveBeenCalledOnce()
    const [, cacheData] = setCacheWithMeta.mock.calls[0]
    expect(cacheData.lastModified).toBe('2026-07-01')
  })

  it('T10: explicit-year signature (no probe)', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadNflGameLogs(2014)

    expect(getManifestEntry).toHaveBeenCalledOnce()
    expect(getManifestEntry.mock.calls[0][0]).toContain('2014')
    const [cacheKey] = setCacheWithMeta.mock.calls[0]
    expect(cacheKey).toBe('nfl-gamelogs/2014')
    expect(result.year).toBe(2014)
  })
})
