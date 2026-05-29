/**
 * src/api/nflDraft.test.js
 *
 * Tests for parseDraftCsv and loadNflDraftPicks.
 *
 * Cache and fetch are mocked via vi.mock / vi.spyOn so no network or
 * IndexedDB calls are made during the test run.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseDraftCsv, loadNflDraftPicks } from './nflDraft'

// ---------------------------------------------------------------------------
// Mock the cache module — must be hoisted (vi.mock is hoisted by Vitest)
// ---------------------------------------------------------------------------
vi.mock('../utils/cache', () => ({
  getCacheRecord:   vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

// ---------------------------------------------------------------------------
// Minimal CSV helpers
// ---------------------------------------------------------------------------

const HEADER = 'season,round,pick,team,pfr_player_name,cfb_player_name,position,college,age'

function makeCsvLine(season, round, pick, team, pfr, cfb, pos, college, age) {
  return [season, round, pick, team, pfr, cfb, pos, college, age].join(',')
}

function makeCsv(...rows) {
  return [HEADER, ...rows].join('\n')
}

// ---------------------------------------------------------------------------
// parseDraftCsv — 6 cases
// ---------------------------------------------------------------------------

describe('parseDraftCsv', () => {
  it('parses a minimal valid CSV', () => {
    const csv = makeCsv(
      makeCsvLine(2024, 1, 4, 'ARI', 'Marvin Harrison Jr.', 'Marvin Harrison', 'WR', 'Ohio State', 21),
      makeCsvLine(2024, 2, 33, 'CAR', 'Joe Smith', 'Joe Smith', 'WR', 'Other Tech', 22),
    )
    const result = parseDraftCsv(csv)
    expect(result[2024]).toHaveLength(2)
    expect(result[2024][0]).toMatchObject({
      year: 2024, round: 1, pick: 4, team: 'ARI',
      position: 'WR', college: 'Ohio State', age: 21,
    })
    // cfb_player_name is preferred (used as fullName when present)
    expect(result[2024][0].fullName).toBe('Marvin Harrison')
  })

  it('falls back to pfr_player_name when cfb_player_name is empty', () => {
    const csv = makeCsv(
      makeCsvLine(2024, 1, 8, 'ATL', 'Michael Penix', '', 'QB', 'Washington', 23),
    )
    const result = parseDraftCsv(csv)
    expect(result[2024][0].fullName).toBe('Michael Penix')
  })

  it('skips rows for years outside DRAFT_YEARS (e.g. 2010)', () => {
    const csv = makeCsv(
      makeCsvLine(2010, 1, 1, 'STL', 'Sam Bradford', 'Sam Bradford', 'QB', 'Oklahoma', 22),
      makeCsvLine(2024, 1, 4, 'ARI', 'Marvin Harrison Jr.', 'Marvin Harrison', 'WR', 'Ohio State', 21),
    )
    const result = parseDraftCsv(csv)
    expect(result[2010]).toBeUndefined()
    expect(result[2024]).toHaveLength(1)
  })

  it('skips supplemental and NA rounds', () => {
    const csv = makeCsv(
      makeCsvLine(2024, 'supplemental', 1, 'NYG', 'Some Player', '', 'WR', 'State', 22),
      makeCsvLine(2024, 'NA', 1, 'NYG', 'Other Player', '', 'QB', 'State', 23),
      makeCsvLine(2024, 1, 4, 'ARI', 'Marvin Harrison Jr.', 'Marvin Harrison', 'WR', 'Ohio State', 21),
    )
    const result = parseDraftCsv(csv)
    expect(result[2024]).toHaveLength(1)
  })

  it('handles quoted names with internal commas (Smith, Jr.)', () => {
    const csv = [
      HEADER,
      '2024,1,10,BUF,"Smith, Jr.","Smith Jr.","WR","Alabama",22',
    ].join('\n')
    const result = parseDraftCsv(csv)
    expect(result[2024]).toHaveLength(1)
    // cfb_player_name used as fullName
    expect(result[2024][0].fullName).toBe('Smith Jr.')
  })

  it('returns {} when required columns are missing', () => {
    const badCsv = 'season,round,pick\n2024,1,4'
    const result = parseDraftCsv(badCsv)
    expect(result).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// loadNflDraftPicks — 5 cases
// ---------------------------------------------------------------------------

describe('loadNflDraftPicks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: global.fetch is a spy (reset each test)
    global.fetch = vi.fn()
  })

  it('returns all years from cache when every year is cached', async () => {
    getCacheRecord.mockImplementation(async (key) => {
      const year = Number(key.split('/')[1])
      return { data: [{ year, round: 1, pick: 1, team: 'ARI', fullName: 'Test', position: 'WR', college: 'X', age: 22 }] }
    })

    const result = await loadNflDraftPicks()
    expect(global.fetch).not.toHaveBeenCalled()
    // All 8 DRAFT_YEARS should be present
    expect(Object.keys(result)).toHaveLength(8)
  })

  it('fetches CSV when a year is missing from cache', async () => {
    getCacheRecord.mockResolvedValue(null)  // all years missing

    const csvRow = makeCsvLine(2024, 1, 4, 'ARI', 'Marvin Harrison Jr.', 'Marvin Harrison', 'WR', 'Ohio State', 21)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => makeCsv(csvRow),
    })

    const result = await loadNflDraftPicks()
    expect(global.fetch).toHaveBeenCalledOnce()
    expect(result[2024]).toHaveLength(1)
    expect(result[2024][0].fullName).toBe('Marvin Harrison')
  })

  it('caches each fetched year with permanent TTL', async () => {
    getCacheRecord.mockResolvedValue(null)
    const csvRow = makeCsvLine(2024, 1, 4, 'ARI', 'Marvin Harrison Jr.', 'Marvin Harrison', 'WR', 'Ohio State', 21)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: async () => makeCsv(csvRow),
    })

    await loadNflDraftPicks()

    // setCacheWithMeta should be called for each of the 8 DRAFT_YEARS
    expect(setCacheWithMeta).toHaveBeenCalledTimes(8)
    // Each call should use TTL=999999
    for (const call of setCacheWithMeta.mock.calls) {
      expect(call[2]).toBe(999999)
    }
  })

  it('returns partial cached result on fetch failure', async () => {
    // Only 2024 is cached; rest are missing
    getCacheRecord.mockImplementation(async (key) => {
      if (key === 'nfl-draft/2024') {
        return { data: [{ year: 2024, round: 1, pick: 4, team: 'ARI', fullName: 'Test', position: 'WR', college: 'X', age: 22 }] }
      }
      return null
    })
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await loadNflDraftPicks()
    expect(result[2024]).toHaveLength(1)
    // Other years should be empty arrays (from failed fetch → cached nothing)
    const otherYears = Object.keys(result).filter(y => Number(y) !== 2024)
    for (const y of otherYears) {
      expect(result[y]).toEqual([])
    }
  })

  it('returns {} years with empty arrays when fetch returns HTTP error', async () => {
    getCacheRecord.mockResolvedValue(null)
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 503 })

    const result = await loadNflDraftPicks()
    expect(global.fetch).toHaveBeenCalledOnce()
    // All years should have empty arrays
    for (const arr of Object.values(result)) {
      expect(arr).toEqual([])
    }
  })
})
