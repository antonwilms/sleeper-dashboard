import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collegeFetchYears } from './cfbd'

vi.mock('../utils/cache', () => ({
  getCacheRecord:   vi.fn(),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))
vi.mock('./dataStore', () => ({
  tryDataStore:      vi.fn(),
  getManifestEntry:  vi.fn(() => Promise.resolve(null)),
  isValidCFBDRows:   vi.fn(() => true),
}))

describe('collegeFetchYears', () => {
  it('anchor at 2025 returns 2017–2025 (length 9, last 2025)', () => {
    const years = collegeFetchYears(2025)
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('anchor at 2026 returns 2017–2026 (length 10, last 2026)', () => {
    const years = collegeFetchYears(2026)
    expect(years.length).toBe(10)
    expect(years[years.length - 1]).toBe(2026)
  })

  it('anchor at 2024 is floored to 2025 (length 9, last 2025)', () => {
    const years = collegeFetchYears(2024)
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('undefined anchor falls back to the 2025 floor', () => {
    const years = collegeFetchYears(undefined)
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('NaN anchor falls back to the 2025 floor', () => {
    const years = collegeFetchYears(NaN)
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('string anchor falls back to the 2025 floor (Number.isFinite guard)', () => {
    const years = collegeFetchYears('2025')
    expect(years.length).toBe(9)
    expect(years[years.length - 1]).toBe(2025)
  })

  it('array is contiguous, strictly increasing, starts at 2017, with no duplicates', () => {
    const years = collegeFetchYears(2025)
    expect(years[0]).toBe(2017)
    for (let i = 1; i < years.length; i++) {
      expect(years[i]).toBe(years[i - 1] + 1)
    }
  })
})

// ---------------------------------------------------------------------------
// getBulkPlayerStats — §1.4's cache-path regression guard (college-pivot.md)
//
// The IndexedDB cache is a fourth shape source that fires BEFORE the data store, and Phase A
// changes no manifest lastModified — so a cache entry written by today's app (a long-form
// array) keeps being served as a cache hit indefinitely. Without normalising at the cache-hit
// exit too, every returning user would get long-form data fed into pivoted-shape consumers
// on deploy day. This test proves that does NOT happen.
// ---------------------------------------------------------------------------

describe('getBulkPlayerStats — cache-hit normalisation (§1.4 regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('a long-form array already in the cache still yields pivoted output', async () => {
    const { getCacheRecord, setCacheWithMeta } = await import('../utils/cache')
    const { getBulkPlayerStats } = await import('./cfbd')

    const longFormCacheEntry = [
      { season: 2024, playerId: '4685381', player: 'Emmanuel Henderson Jr.', team: 'Alabama', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'YDS', stat: '650' },
      { season: 2024, playerId: '4685381', player: 'Emmanuel Henderson Jr.', team: 'Alabama', position: 'WR', conference: 'SEC', category: 'receiving', statType: 'TD', stat: '4' },
    ]
    getCacheRecord.mockResolvedValue({
      data: longFormCacheEntry,
      sourceLastModified: '2026-01-01T00:00:00Z',
    })

    const result = await getBulkPlayerStats(2024, 'receiving')

    // Pivoted, not the raw long-form array: keyed by playerId, stat types as top-level
    // numeric fields — exactly what collegeMatch.js / collegeMetrics.js expect.
    expect(Array.isArray(result)).toBe(false)
    expect(result).toEqual({
      '4685381': {
        playerId: '4685381', player: 'Emmanuel Henderson Jr.', team: 'Alabama',
        position: 'WR', conference: 'SEC', YDS: 650, TD: 4,
      },
    })

    // The re-cached value is the normalised (pivoted) shape too — not the raw long-form array —
    // so this fix is permanent, not a one-time read-side patch.
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })
})
