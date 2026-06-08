/**
 * src/api/nflDraft.test.js
 *
 * Tests for loadNflDraftPicks (data-store-backed version).
 * CSV parsing moved to sleeper-dashboard-data; no parseDraftCsv tests here.
 * Mocks: ../api/dataStore (getManifestEntry, tryDataStore) + ../utils/cache.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadNflDraftPicks } from './nflDraft'

// ---------------------------------------------------------------------------
// Mock the data store — must be hoisted
// ---------------------------------------------------------------------------
vi.mock('./dataStore', () => ({
  getManifestEntry: vi.fn(),
  tryDataStore:     vi.fn(),
  isValidDraft:     vi.fn().mockReturnValue(true),
}))

vi.mock('../utils/cache', () => ({
  getCacheRecord:   vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

import { getManifestEntry, tryDataStore } from './dataStore'
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

const LAST_MODIFIED = '2026-05-05'
const ENTRY = { lastModified: LAST_MODIFIED, schemaVersion: 1, inProgress: false }

const SAMPLE_PICK = {
  year: 2024, round: 1, pick: 4, team: 'ARI',
  fullName: 'Marvin Harrison Jr.', position: 'WR', college: 'Ohio State', age: 21,
}

// Build a picksByYear with one pick for year 2024
function makeDraftJson(overrides = {}) {
  return {
    schemaVersion: 1,
    generatedAt: '2026-06-01T00:00:00.000Z',
    sourceLastUpdated: '2026-05-05 03:26:29 EDT',
    count: 1,
    picksByYear: { 2024: [SAMPLE_PICK] },
    ...overrides,
  }
}

// Simulate a fresh cache entry for every DRAFT_YEARS year
function makeAllYearsCached(lastModified = LAST_MODIFIED) {
  return async (key) => {
    const year = Number(key.split('/')[1])
    return {
      data: {
        picks: [{ year, round: 1, pick: 1, team: 'TST', fullName: 'Cached', position: 'WR', college: 'X', age: 22 }],
        lastModified,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// loadNflDraftPicks tests
// ---------------------------------------------------------------------------

describe('loadNflDraftPicks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. All years cached + fresh lastModified → served from cache, tryDataStore not called
  it('returns all years from cache when every year is fresh', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockImplementation(makeAllYearsCached(LAST_MODIFIED))

    const result = await loadNflDraftPicks()

    expect(tryDataStore).not.toHaveBeenCalled()
    // All 8 DRAFT_YEARS present
    expect(Object.keys(result)).toHaveLength(8)
    for (const picks of Object.values(result)) {
      expect(Array.isArray(picks)).toBe(true)
    }
  })

  // 2. A year missing → tryDataStore fetched once, all DRAFT_YEARS cached
  it('fetches from store when any year is missing, caches all years with lastModified', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    // All years return null (none cached)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeDraftJson())

    await loadNflDraftPicks()

    expect(tryDataStore).toHaveBeenCalledOnce()
    // All 8 DRAFT_YEARS should be cached
    expect(setCacheWithMeta).toHaveBeenCalledTimes(8)
    for (const call of setCacheWithMeta.mock.calls) {
      expect(call[0]).toMatch(/^nfl-draft\/\d{4}$/)
      expect(call[1].lastModified).toBe(LAST_MODIFIED)
      expect(call[2]).toBe(999999)
    }
  })

  // 3. Stale lastModified → re-fetches even if all years are cached
  it('re-fetches when cached lastModified does not match manifest', async () => {
    const newEntry = { lastModified: '2026-06-01', schemaVersion: 1, inProgress: false }
    getManifestEntry.mockResolvedValue(newEntry)
    // Cache has old lastModified
    getCacheRecord.mockImplementation(makeAllYearsCached('2026-01-01'))
    tryDataStore.mockResolvedValue(makeDraftJson())

    await loadNflDraftPicks()

    expect(tryDataStore).toHaveBeenCalledOnce()
    // Re-cached with new lastModified
    for (const call of setCacheWithMeta.mock.calls) {
      expect(call[1].lastModified).toBe(newEntry.lastModified)
    }
  })

  // 4. tryDataStore → null → graceful degradation (multiplier stays 1.0)
  it('returns partial/empty cache when store is unavailable', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    // 2024 is fresh-cached; all others missing
    getCacheRecord.mockImplementation(async (key) => {
      if (key === 'nfl-draft/2024') {
        return { data: { picks: [SAMPLE_PICK], lastModified: LAST_MODIFIED } }
      }
      return null
    })
    tryDataStore.mockResolvedValue(null)

    const result = await loadNflDraftPicks()

    // 2024 served from cache
    expect(result[2024]).toEqual([SAMPLE_PICK])
    // Missing years defaulted to []
    const otherYears = Object.keys(result).filter(y => Number(y) !== 2024)
    for (const y of otherYears) {
      expect(result[y]).toEqual([])
    }
    // Nothing re-cached (store was down)
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  // 5. Shape round-trip — DraftPick from store passes through to result unchanged
  it('DraftPick shape survives the round-trip from store to result', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeDraftJson())

    const result = await loadNflDraftPicks()

    const pick = result[2024]?.[0]
    expect(pick).toBeDefined()
    expect(pick).toMatchObject({
      year: 2024, round: 1, pick: 4, team: 'ARI',
      fullName: 'Marvin Harrison Jr.', position: 'WR', college: 'Ohio State', age: 21,
    })
  })
})
