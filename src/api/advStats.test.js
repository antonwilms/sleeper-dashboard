/**
 * src/api/advStats.test.js
 *
 * Tests for loadAdvStats (data-store-backed loader).
 * isValidAdvStats validator tests live in dataStore.test.js (where all validators are tested).
 * Mocks: ./dataStore (getManifestEntry, tryDataStore) + ../utils/cache.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadAdvStats } from './advStats'

// ---------------------------------------------------------------------------
// Mock the data store — keep real isValidAdvStats so loadAdvStats validate: call works
// ---------------------------------------------------------------------------
vi.mock('./dataStore', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getManifestEntry: vi.fn(),
    tryDataStore:     vi.fn(),
  }
})

vi.mock('../utils/cache', () => ({
  getCacheRecord:   vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

import { getManifestEntry, tryDataStore } from './dataStore'
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const LAST_MODIFIED = '2026-06-01'
const ENTRY = { lastModified: LAST_MODIFIED, schemaVersion: 1, inProgress: false }
const WR_ROW = { position: 'WR', targetShare: 0.241, airYardsShare: 0.305, wopr: 0.62, racr: 1.12, components: {} }
const RB_ROW = { position: 'RB', targetShare: 0.08,  airYardsShare: null,  wopr: null, racr: null, components: {} }
const makeJson = (rowCount = 312, players = { '111': WR_ROW, '222': RB_ROW }) =>
  ({ schemaVersion: 1, season: 2025, rowCount, generatedAt: '2026-06-01T00:00:00Z', inProgress: false, players })

// ---------------------------------------------------------------------------
// loadAdvStats tests
// ---------------------------------------------------------------------------

describe('loadAdvStats', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. Fresh cache + matching lastModified + rowCount >= gate → served from cache; tryDataStore not called
  it('serves from cache when record is fresh and rowCount meets gate', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue({
      data: { byId: { '111': WR_ROW }, rowCount: 312, lastModified: LAST_MODIFIED },
    })

    const result = await loadAdvStats(2025)

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(result).toEqual({ byId: { '111': WR_ROW }, year: 2025, complete: true, rowCount: 312 })
  })

  // 2. Cache miss → tryDataStore called once; setCacheWithMeta called with correct key, token, TTL
  it('fetches from store on cache miss, caches with key nfl-advstats/2025 and TTL 999999', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadAdvStats(2025)

    expect(tryDataStore).toHaveBeenCalledOnce()
    expect(setCacheWithMeta).toHaveBeenCalledOnce()
    const [cacheKey, cacheData, ttl] = setCacheWithMeta.mock.calls[0]
    expect(cacheKey).toBe('nfl-advstats/2025')
    expect(cacheData.lastModified).toBe(LAST_MODIFIED)
    expect(ttl).toBe(999999)
    expect(result).toMatchObject({ year: 2025, complete: true, rowCount: 312 })
    expect(result.byId).toMatchObject({ '111': WR_ROW, '222': RB_ROW })
  })

  // 3. MIN_ADVSTATS_ROWS re-assertion — rowCount: 200 for both probe years → both skipped; nothing cached
  it('skips both years when rowCount < 250 and returns graceful empty', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson(200))  // rowCount: 200 < 250

    const result = await loadAdvStats(2025)

    expect(result).toEqual({ byId: null, year: null, complete: false, rowCount: 0 })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  // 4. Stale cache lastModified → re-fetch; re-cached with the new token
  it('re-fetches when cached lastModified does not match manifest', async () => {
    const newEntry = { lastModified: '2026-07-01', schemaVersion: 1, inProgress: false }
    getManifestEntry.mockResolvedValue(newEntry)
    getCacheRecord.mockResolvedValue({
      data: { byId: { '111': WR_ROW }, rowCount: 312, lastModified: '2026-05-01' },
    })
    tryDataStore.mockResolvedValue(makeJson())

    await loadAdvStats(2025)

    expect(tryDataStore).toHaveBeenCalledOnce()
    const [, cacheData] = setCacheWithMeta.mock.calls[0]
    expect(cacheData.lastModified).toBe('2026-07-01')
  })

  // 5. Store unavailable (tryDataStore → null for both years) → graceful empty; setCacheWithMeta not called
  it('returns graceful empty when store is unavailable for both probe years', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)

    const result = await loadAdvStats(2025)

    expect(result).toEqual({ byId: null, year: null, complete: false, rowCount: 0 })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  // 6. First probe year absent from manifest → falls through to second year (currentSeason-1)
  it('resolves second probe year when first is absent from manifest', async () => {
    getManifestEntry.mockImplementation(async (path) => {
      if (path.includes('2025')) return null
      return ENTRY
    })
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadAdvStats(2025)

    expect(result.year).toBe(2024)
    expect(result.complete).toBe(true)
  })

  // 7. Null handling round-trip — RB_ROW null fields survive into byId unchanged; loader does not throw
  it('preserves null fields in RB row without throwing', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeJson())

    const result = await loadAdvStats(2025)

    expect(result.byId['222']).toMatchObject({
      position: 'RB', targetShare: 0.08, airYardsShare: null, wopr: null, racr: null,
    })
  })
})
