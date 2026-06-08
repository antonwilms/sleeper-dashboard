/**
 * src/api/nflRoster.test.js
 *
 * Tests for parseRosterCsv and loadCurrentRoster.
 * Cache and fetch are mocked via vi.mock / global.fetch so no network or
 * IndexedDB calls are made during the test run.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseRosterCsv, loadCurrentRoster } from './nflRoster'

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

const HEADER = 'season,team,position,full_name,status,gsis_id,sleeper_id'

function makeRow({ season = 2025, team = 'NE', position = 'WR', fullName = 'Test Player', status = 'ACT', sleeperId = '123' } = {}) {
  return [season, team, position, fullName, status, 'G123', sleeperId].join(',')
}

function makeCsv(...rows) {
  return [HEADER, ...rows].join('\n')
}

// Build a CSV with `n` rows, each with a unique sleeper_id (for rowCount tests)
function makeLargeCompleteCsv(n = 1500) {
  const rows = []
  for (let i = 0; i < n; i++) {
    rows.push(makeRow({ sleeperId: `id_${i}` }))
  }
  return makeCsv(...rows)
}

// ---------------------------------------------------------------------------
// parseRosterCsv — 4 cases
// ---------------------------------------------------------------------------

describe('parseRosterCsv', () => {
  it('happy path: ACT and RES are active, RET is excluded', () => {
    const csv = makeCsv(
      makeRow({ sleeperId: 'sid_act',  status: 'ACT', fullName: 'Active Player' }),
      makeRow({ sleeperId: 'sid_res',  status: 'RES', fullName: 'Reserve Player' }),
      makeRow({ sleeperId: 'sid_ret',  status: 'RET', fullName: 'Retired Player' }),
    )
    const result = parseRosterCsv(csv)
    expect(result.rowCount).toBe(3)
    expect(result.activeIds.has('sid_act')).toBe(true)
    expect(result.activeIds.has('sid_res')).toBe(true)
    expect(result.activeIds.has('sid_ret')).toBe(false)
    expect(result.byId['sid_act']).toMatchObject({ status: 'ACT', fullName: 'Active Player' })
    expect(result.byId['sid_ret']).toMatchObject({ status: 'RET', fullName: 'Retired Player' })
    expect(result.season).toBe(2025)
  })

  it('empty sleeper_id row is skipped and not counted in rowCount', () => {
    const csv = makeCsv(
      makeRow({ sleeperId: 'sid_1', status: 'ACT' }),
      makeRow({ sleeperId: '',     status: 'ACT' }),  // blank sleeper_id
    )
    const result = parseRosterCsv(csv)
    expect(result.rowCount).toBe(1)  // blank row not counted
    expect(result.activeIds.size).toBe(1)
    expect(result.activeIds.has('sid_1')).toBe(true)
  })

  it('missing required column (sleeper_id absent) → empty result, logs once', () => {
    const badCsv = 'season,team,position,status\n2025,NE,WR,ACT'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = parseRosterCsv(badCsv)
    expect(result.activeIds.size).toBe(0)
    expect(result.rowCount).toBe(0)
    expect(warnSpy).toHaveBeenCalledOnce()
    expect(warnSpy.mock.calls[0][0]).toContain('missing required columns')
    warnSpy.mockRestore()
  })

  it('quoted name with comma parses without splitting ("Smith, Jr.")', () => {
    const csv = [
      HEADER,
      '2025,BUF,WR,"Smith, Jr.",ACT,G999,sid_jr',
    ].join('\n')
    const result = parseRosterCsv(csv)
    expect(result.rowCount).toBe(1)
    expect(result.byId['sid_jr']).toMatchObject({ fullName: 'Smith, Jr.' })
    expect(result.activeIds.has('sid_jr')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// loadCurrentRoster — 4 cases
// ---------------------------------------------------------------------------

describe('loadCurrentRoster', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn()
  })

  it('upcoming-season unpublished (504) → falls back to prior year', async () => {
    getCacheRecord.mockResolvedValue(null)  // no cache

    global.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 504 })     // 2026 → fail
      .mockResolvedValueOnce({                                // 2025 → success
        ok: true,
        text: async () => makeLargeCompleteCsv(1600),
      })

    const result = await loadCurrentRoster(2026)
    expect(result.year).toBe(2025)
    expect(result.complete).toBe(true)
    expect(result.activeIds).not.toBeNull()
    expect(result.activeIds.size).toBeGreaterThan(0)
  })

  it('all years fail → { activeIds: null, year: null, complete: false }', async () => {
    getCacheRecord.mockResolvedValue(null)
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

    const result = await loadCurrentRoster(2026)
    expect(result).toEqual({ activeIds: null, year: null, complete: false, byId: null })
  })

  it('sparse/preliminary file (rowCount < MIN_ROSTER_IDS) is not cached and falls through to next year', async () => {
    getCacheRecord.mockResolvedValue(null)

    global.fetch = vi.fn()
      .mockResolvedValueOnce({                           // 2026 → sparse (only 5 rows)
        ok: true,
        text: async () => makeCsv(
          makeRow({ sleeperId: 'sid_a', season: 2026 }),
          makeRow({ sleeperId: 'sid_b', season: 2026 }),
          makeRow({ sleeperId: 'sid_c', season: 2026 }),
          makeRow({ sleeperId: 'sid_d', season: 2026 }),
          makeRow({ sleeperId: 'sid_e', season: 2026 }),
        ),
      })
      .mockResolvedValueOnce({                           // 2025 → complete
        ok: true,
        text: async () => makeLargeCompleteCsv(1600),
      })

    const result = await loadCurrentRoster(2026)
    expect(result.year).toBe(2025)
    expect(result.complete).toBe(true)
    // The sparse 2026 file must NOT have been cached
    expect(setCacheWithMeta).toHaveBeenCalledOnce()
    expect(setCacheWithMeta.mock.calls[0][0]).toBe('nfl-roster/2025')
  })

  it('cache hit → rehydrates Set from stored array without fetching', async () => {
    getCacheRecord.mockImplementation(async (key) => {
      if (key === 'nfl-roster/2025') {
        return {
          data: {
            activeIds: ['id_100', 'id_200'],
            byId: { id_100: { team: 'KC', position: 'WR', status: 'ACT', fullName: 'Test' } },
            season: 2025,
            rowCount: 1500,
          },
        }
      }
      // 2026 → no cache hit (probe starts at 2026 but may hit 2025 first if impl tries 2026 first)
      return null
    })

    const result = await loadCurrentRoster(2025)
    expect(global.fetch).not.toHaveBeenCalled()
    expect(result.year).toBe(2025)
    expect(result.complete).toBe(true)
    expect(result.activeIds).toBeInstanceOf(Set)
    expect(result.activeIds.has('id_100')).toBe(true)
    expect(result.activeIds.has('id_200')).toBe(true)
  })
})
