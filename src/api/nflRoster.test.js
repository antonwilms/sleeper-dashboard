/**
 * src/api/nflRoster.test.js
 *
 * Tests for loadCurrentRoster (data-store-backed version).
 * CSV parsing moved to sleeper-dashboard-data; no CSV tests here.
 * Mocks: ../api/dataStore (getManifestEntry, tryDataStore) + ../utils/cache.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadCurrentRoster } from './nflRoster'

// ---------------------------------------------------------------------------
// Mock the data store — must be hoisted
// ---------------------------------------------------------------------------
vi.mock('./dataStore', () => ({
  getManifestEntry: vi.fn(),
  tryDataStore:     vi.fn(),
  isValidRoster:    vi.fn().mockReturnValue(true),
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

const ENTRY_2025 = { lastModified: '2026-01-15', schemaVersion: 1, inProgress: false }
const ENTRY_2026 = { lastModified: '2026-06-01', schemaVersion: 1, inProgress: false }

function makeRosterJson(rowCount = 1600) {
  return {
    schemaVersion: 1,
    season: 2025,
    rowCount,
    players: {
      'sid_act': { team: 'BUF', position: 'WR', status: 'ACT', fullName: 'Josh Active' },
      'sid_ret': { team: 'PIT', position: 'QB', status: 'RET', fullName: 'Ben Retired' },
      'sid_res': { team: 'KC',  position: 'TE', status: 'RES', fullName: 'Travis Reserve' },
    },
  }
}

// ---------------------------------------------------------------------------
// loadCurrentRoster tests
// ---------------------------------------------------------------------------

describe('loadCurrentRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // 1. File not in store for current year → falls back to prior year
  it('falls back to prior year when current-season file is not in the store', async () => {
    // 2026 not in store; 2025 is in store (no cache)
    getManifestEntry.mockImplementation(async (path) => {
      if (path === 'nflverse/roster/2026.json') return null
      if (path === 'nflverse/roster/2025.json') return ENTRY_2025
      return null
    })
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockImplementation(async (path) => {
      if (path === 'nflverse/roster/2025.json') return makeRosterJson(1600)
      return null
    })

    const result = await loadCurrentRoster(2026)
    expect(result.year).toBe(2025)
    expect(result.complete).toBe(true)
    expect(result.activeIds).not.toBeNull()
  })

  // 2. All years missing from store → graceful null
  it('returns { activeIds: null, year: null, complete: false } when no year is in the store', async () => {
    getManifestEntry.mockResolvedValue(null)

    const result = await loadCurrentRoster(2026)
    expect(result).toEqual({ activeIds: null, year: null, complete: false, byId: null })
    expect(tryDataStore).not.toHaveBeenCalled()
  })

  // 3. Sparse file → not cached, falls through to next year
  it('skips sparse file (rowCount < MIN_ROSTER_IDS) without caching and falls through', async () => {
    getManifestEntry.mockImplementation(async (path) => {
      if (path === 'nflverse/roster/2026.json') return ENTRY_2026
      if (path === 'nflverse/roster/2025.json') return ENTRY_2025
      return null
    })
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockImplementation(async (path) => {
      if (path === 'nflverse/roster/2026.json') return { schemaVersion: 1, season: 2026, rowCount: 5, players: {} }
      if (path === 'nflverse/roster/2025.json') return makeRosterJson(1600)
      return null
    })

    const result = await loadCurrentRoster(2026)
    expect(result.year).toBe(2025)
    expect(result.complete).toBe(true)
    // Sparse 2026 must NOT have been cached
    expect(setCacheWithMeta).toHaveBeenCalledOnce()
    expect(setCacheWithMeta.mock.calls[0][0]).toBe('nfl-roster/2025')
  })

  // 4. Cache hit with matching lastModified → served from cache, tryDataStore not called
  it('serves from cache when lastModified matches and rowCount >= MIN_ROSTER_IDS', async () => {
    getManifestEntry.mockResolvedValue(ENTRY_2025)
    getCacheRecord.mockImplementation(async (key) => {
      if (key === 'nfl-roster/2025') {
        return {
          data: {
            byId: {
              'id_act': { team: 'KC', position: 'WR', status: 'ACT', fullName: 'Active' },
              'id_ret': { team: 'PIT', position: 'QB', status: 'RET', fullName: 'Retired' },
            },
            season: 2025,
            rowCount: 1500,
            lastModified: ENTRY_2025.lastModified,
          },
        }
      }
      return null
    })

    const result = await loadCurrentRoster(2025)
    expect(tryDataStore).not.toHaveBeenCalled()
    expect(result.year).toBe(2025)
    expect(result.complete).toBe(true)
    expect(result.activeIds).toBeInstanceOf(Set)
    // activeIds rebuilt from byId — ACT present, RET excluded
    expect(result.activeIds.has('id_act')).toBe(true)
    expect(result.activeIds.has('id_ret')).toBe(false)
  })

  // 5. Stale lastModified → re-fetches and re-caches
  it('re-fetches when cached lastModified does not match manifest', async () => {
    const freshEntry = { lastModified: '2026-06-01', schemaVersion: 1, inProgress: false }
    getManifestEntry.mockResolvedValue(freshEntry)
    // Cache has old lastModified
    getCacheRecord.mockResolvedValue({
      data: {
        byId: { 'id_100': { status: 'ACT', team: 'KC', position: 'WR', fullName: 'Old' } },
        rowCount: 1500,
        lastModified: '2026-01-01',  // stale — doesn't match freshEntry.lastModified
      },
    })
    tryDataStore.mockResolvedValue(makeRosterJson(1700))

    const result = await loadCurrentRoster(2025)
    expect(tryDataStore).toHaveBeenCalledOnce()
    expect(setCacheWithMeta).toHaveBeenCalledOnce()
    // Re-cached with new lastModified
    expect(setCacheWithMeta.mock.calls[0][1].lastModified).toBe(freshEntry.lastModified)
    expect(result.complete).toBe(true)
  })

  // 6. OUT_STATUSES: RET excluded from activeIds but present in byId
  it('excludes RET players from activeIds but includes them in byId', async () => {
    getManifestEntry.mockResolvedValue(ENTRY_2025)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(makeRosterJson(1600))

    const result = await loadCurrentRoster(2025)
    // RET excluded from activeIds
    expect(result.activeIds.has('sid_ret')).toBe(false)
    // RET still in byId
    expect(result.byId['sid_ret']).toMatchObject({ status: 'RET' })
    // ACT and RES in activeIds
    expect(result.activeIds.has('sid_act')).toBe(true)
    expect(result.activeIds.has('sid_res')).toBe(true)
  })
})
