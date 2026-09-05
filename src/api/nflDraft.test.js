/**
 * src/api/nflDraft.test.js
 *
 * Tests for loadNflDraftPicks (data-store-backed version).
 * CSV parsing moved to sleeper-dashboard-data; no parseDraftCsv tests here.
 * Mocks: ../api/dataStore (getManifestEntry, tryDataStore) + ../utils/cache.
 *
 * Draft years are derived dynamically from the store's picksByYear keys
 * (≥ 2017 through the current season) rather than a hardcoded list — see
 * deriveDraftYears/getCachedDraftYears in nflDraft.js.
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

const ROOKIE_PICK_2026 = {
  year: 2026, round: 1, pick: 1, team: 'TEN',
  fullName: 'Rookie McRookie', position: 'QB', college: 'Ohio State', age: 21,
}

// Build a picksByYear spanning 2017..2026, matching real store coverage.
function makeDraftJson(overrides = {}) {
  const picksByYear = {}
  for (let y = 2017; y <= 2025; y++) {
    picksByYear[y] = y === 2024 ? [SAMPLE_PICK] : []
  }
  picksByYear[2026] = [ROOKIE_PICK_2026]
  return {
    schemaVersion: 1,
    generatedAt: '2026-06-01T00:00:00.000Z',
    sourceLastUpdated: '2026-05-05 03:26:29 EDT',
    count: 1,
    picksByYear,
    ...overrides,
  }
}

const ALL_YEARS = Array.from({ length: 10 }, (_, i) => 2017 + i) // 2017..2026

// Simulate a fresh cache for the year-list key plus every year in `years`.
function makeAllYearsCached(years, lastModified = LAST_MODIFIED) {
  return async (key) => {
    if (key === 'nfl-draft/years') {
      return { data: { years, lastModified } }
    }
    const year = Number(key.split('/')[1])
    if (!years.includes(year)) return null
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

  // 1. Year list + all years cached and fresh → served from cache, tryDataStore not called
  it('returns all years from cache when the year list and every year are fresh', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockImplementation(makeAllYearsCached(ALL_YEARS))

    const result = await loadNflDraftPicks()

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(Object.keys(result)).toHaveLength(ALL_YEARS.length)
    for (const picks of Object.values(result)) {
      expect(Array.isArray(picks)).toBe(true)
    }
  })

  // 2. No cached year list → fetches from store, derives years from picksByYear keys
  //    (≥ 2017, including a year with no hardcoded predecessor, e.g. 2026), caches all of them.
  it('derives DRAFT_YEARS from the store when the year list is unknown', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeDraftJson())

    const result = await loadNflDraftPicks()

    expect(tryDataStore).toHaveBeenCalledOnce()
    expect(Object.keys(result).map(Number).sort((a, b) => a - b)).toEqual(ALL_YEARS)
    // A newly-drafted rookie in a year not present in any hardcoded list must show up.
    expect(result[2026]).toEqual([ROOKIE_PICK_2026])

    // Year list itself gets cached alongside each year's picks.
    const yearsCall = setCacheWithMeta.mock.calls.find((c) => c[0] === 'nfl-draft/years')
    expect(yearsCall[1].years).toEqual(ALL_YEARS)
    expect(setCacheWithMeta).toHaveBeenCalledTimes(ALL_YEARS.length + 1)
  })

  // 3. Years below MIN_DRAFT_YEAR (2017) in the store are excluded.
  it('excludes years before 2017 from the derived year list', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeDraftJson({
      picksByYear: { 2010: [{ ...SAMPLE_PICK, year: 2010 }], 2024: [SAMPLE_PICK] },
    }))

    const result = await loadNflDraftPicks()

    expect(Object.keys(result).map(Number)).toEqual([2024])
  })

  // 4. Stale lastModified → re-fetches even if the year list and all years are cached
  it('re-fetches when cached lastModified does not match manifest', async () => {
    const newEntry = { lastModified: '2026-06-01', schemaVersion: 1, inProgress: false }
    getManifestEntry.mockResolvedValue(newEntry)
    getCacheRecord.mockImplementation(makeAllYearsCached(ALL_YEARS, '2026-01-01'))
    tryDataStore.mockResolvedValue(makeDraftJson())

    await loadNflDraftPicks()

    expect(tryDataStore).toHaveBeenCalledOnce()
    for (const call of setCacheWithMeta.mock.calls) {
      expect(call[1].lastModified).toBe(newEntry.lastModified)
    }
  })

  // 5a. Manifest unavailable (entry null) + warm permanent cache → serve cached picks
  it('serves cached picks when manifest entry is null (manifest unavailable)', async () => {
    getManifestEntry.mockResolvedValue(null)
    getCacheRecord.mockImplementation(async (key) => {
      if (key === 'nfl-draft/years') {
        return { data: { years: [2024], lastModified: null } }
      }
      if (key === 'nfl-draft/2024') {
        return { data: { picks: [SAMPLE_PICK], lastModified: LAST_MODIFIED } }
      }
      return null
    })
    tryDataStore.mockResolvedValue(null)

    const result = await loadNflDraftPicks()

    expect(result[2024]).toEqual([SAMPLE_PICK])
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  // 5b. tryDataStore → null, year list unknown → graceful empty result (nothing to serve)
  it('returns empty result when store is unavailable and the year list was never learned', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)

    const result = await loadNflDraftPicks()

    expect(result).toEqual({})
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  // 5c. tryDataStore → null, year list known but some years missing → degrade those to []
  it('degrades missing years to [] when store is unavailable but year list is known', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockImplementation(async (key) => {
      if (key === 'nfl-draft/years') {
        return { data: { years: [2023, 2024], lastModified: LAST_MODIFIED } }
      }
      if (key === 'nfl-draft/2024') {
        return { data: { picks: [SAMPLE_PICK], lastModified: LAST_MODIFIED } }
      }
      return null
    })
    tryDataStore.mockResolvedValue(null)

    const result = await loadNflDraftPicks()

    expect(result[2024]).toEqual([SAMPLE_PICK])
    expect(result[2023]).toEqual([])
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  // 6. Shape round-trip — DraftPick from store passes through to result unchanged
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
