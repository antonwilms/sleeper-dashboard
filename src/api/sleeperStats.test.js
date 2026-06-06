import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

vi.mock('./dataStore', () => ({
  tryDataStore:        vi.fn(() => Promise.resolve(null)),
  getManifestEntry:    vi.fn(() => Promise.resolve(null)),
  isValidSeasonTotals: vi.fn(() => true),
}))

vi.mock('../utils/fantasyPoints', () => ({
  calculateFantasyPoints: vi.fn(() => 10),
}))

import { loadCareerHistory } from './sleeperStats.js'
import { getCache, getCacheRecord, setCache } from '../utils/cache'
import { tryDataStore, getManifestEntry } from './dataStore'

// A minimal v2-shaped season-totals payload (phase-5: has weeklyStatus)
const MOCK_SEASON_DATA = {
  pid1: {
    gamesPlayed: 14, gamesStarted: 14, dnpWeeks: 2, byeWeeks: 1,
    fantasyPoints: 200,
    weeklyStatus: Array(18).fill('X'),
  },
}

const FAR_FUTURE = Date.now() + 1e10

function makeCacheRecord(overrides = {}) {
  return {
    data: MOCK_SEASON_DATA,
    expiresAt: FAR_FUTURE,
    sourceLastModified: null,
    sourceSchemaVersion: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: no fetch
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// Helper: run loadCareerHistory for a single season (2012) by passing currentSeason=2013
async function runForSeason2012(extraPlayerMap = {}) {
  return loadCareerHistory(2013, {}, new Set(['pid1']), { pid1: { team: 'KC' }, ...extraPlayerMap }, () => {})
}

describe('Fix B — cache-serve branch (sourceLastModified: null)', () => {
  it('(a) serves cached data when data store is unavailable (getManifestEntry → null)', async () => {
    getCacheRecord.mockResolvedValue(makeCacheRecord())
    getManifestEntry.mockResolvedValue(null)

    const result = await runForSeason2012()

    expect(result[2012]).toEqual(MOCK_SEASON_DATA)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(tryDataStore).not.toHaveBeenCalled()
  })

  it('(b) serves cached data when manifest entry is present but inProgress (not usable)', async () => {
    getCacheRecord.mockResolvedValue(makeCacheRecord())
    getManifestEntry.mockResolvedValue({ inProgress: true, lastModified: '2026-01-01T00:00:00Z' })

    const result = await runForSeason2012()

    expect(result[2012]).toEqual(MOCK_SEASON_DATA)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(tryDataStore).not.toHaveBeenCalled()
  })

  it('(b) serves cached data when manifest entry has no lastModified', async () => {
    getCacheRecord.mockResolvedValue(makeCacheRecord())
    getManifestEntry.mockResolvedValue({ inProgress: false })

    const result = await runForSeason2012()

    expect(result[2012]).toEqual(MOCK_SEASON_DATA)
    expect(globalThis.fetch).not.toHaveBeenCalled()
    expect(tryDataStore).not.toHaveBeenCalled()
  })
})

describe('Fix B — edge cases (migration / stale detection preserved)', () => {
  it('falls through to data store when manifest has a usable entry (migration case)', async () => {
    getCacheRecord.mockResolvedValue(makeCacheRecord())
    getManifestEntry.mockResolvedValue({
      inProgress: false,
      lastModified: '2026-06-01T00:00:00Z',
      schemaVersion: 2,
    })
    // tryDataStore returns the canonical data (simulates successful data-store fetch)
    tryDataStore.mockResolvedValue(MOCK_SEASON_DATA)

    const result = await runForSeason2012()

    expect(result[2012]).toEqual(MOCK_SEASON_DATA)
    expect(tryDataStore).toHaveBeenCalledWith('nfl/season-totals/2012.json', expect.anything())
  })

  it('still falls through to refresh when manifest has strictly-newer lastModified than sourceLastModified', async () => {
    getCacheRecord.mockResolvedValue(makeCacheRecord({
      sourceLastModified: '2026-01-01T00:00:00Z',
    }))
    // Manifest entry is newer than the cached sourceLastModified
    getManifestEntry.mockResolvedValue({
      inProgress: false,
      lastModified: '2026-06-01T00:00:00Z',
      schemaVersion: 2,
    })
    tryDataStore.mockResolvedValue(MOCK_SEASON_DATA)

    const result = await runForSeason2012()

    expect(tryDataStore).toHaveBeenCalled()
    expect(result[2012]).toEqual(MOCK_SEASON_DATA)
  })

  it('re-fetches when cached record lacks weeklyStatus (pre-phase-5 stale detection preserved)', async () => {
    const staleData = { pid1: { gamesPlayed: 14, fantasyPoints: 200, dnpWeeks: 2 } }
    getCacheRecord.mockResolvedValue({
      data: staleData,
      expiresAt: FAR_FUTURE,
      sourceLastModified: null,
      sourceSchemaVersion: null,
    })
    // Data store also unavailable — falls through to live API
    tryDataStore.mockResolvedValue(null)
    getManifestEntry.mockResolvedValue(null)

    // Mock getCache to return week stats so the 18-week loop completes quickly
    getCache.mockImplementation((key) => {
      if (key.startsWith('stats/')) return Promise.resolve({ pid1: { gp: 1, gs: 1 } })
      return Promise.resolve(null)
    })

    const result = await runForSeason2012()

    // Should have gone through the live-API path (re-aggregated)
    expect(setCache).toHaveBeenCalled()
    expect(result[2012]).toBeDefined()
    // Result should NOT be the old stale data (was re-computed)
    expect(result[2012]).not.toEqual(staleData)
  })
})

describe('Fix B — delay guard', () => {
  it('does not await delay(200) between weeks when all weeks are already cached', async () => {
    // No season-level cache, no data store — triggers live-API path
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)
    getManifestEntry.mockResolvedValue(null)

    // All weekly stats are cached — getCache returns mock data for every week key
    getCache.mockImplementation((key) => {
      if (key.startsWith('stats/')) return Promise.resolve({ pid1: { gp: 0 } })
      return Promise.resolve(null)
    })

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout')

    await runForSeason2012()

    const delayTimeouts = setTimeoutSpy.mock.calls.filter(([, ms]) => ms === 200)
    expect(delayTimeouts).toHaveLength(0)
  })
})
