import { describe, it, expect, vi, beforeEach } from 'vitest'
import { collegeFetchYears, normalizeCollegeStats } from './cfbd'

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
// normalizeCollegeStats — idempotency (round-trip)
//
// The cache stores the *normalized* result, so a cache-hit read runs already-pivoted data back
// through normalizeCollegeStats (§1.4). Applying it twice must equal applying it once for every
// accepted input shape, or a cache-hit silently degrades to an empty/null result.
// ---------------------------------------------------------------------------

describe('normalizeCollegeStats — idempotency', () => {
  const longForm = [
    { playerId: '4685381', player: 'Emmanuel Henderson Jr.', team: 'Alabama', position: 'WR', conference: 'SEC', statType: 'YDS', stat: '650' },
    { playerId: '4685381', player: 'Emmanuel Henderson Jr.', team: 'Alabama', position: 'WR', conference: 'SEC', statType: 'TD', stat: '4' },
  ]
  const pivotedEnvelope = {
    players: {
      '4685381': { playerId: '4685381', player: 'Emmanuel Henderson Jr.', team: 'Alabama', position: 'WR', conference: 'SEC', YDS: 650, TD: 4 },
    },
    rowCount: 1,
  }

  it('a long-form array round-trips: normalize(normalize(v)) === normalize(v)', () => {
    const once  = normalizeCollegeStats(longForm)
    const twice = normalizeCollegeStats(once)
    expect(twice).toEqual(once)
    expect(once).toEqual({
      '4685381': {
        playerId: '4685381', player: 'Emmanuel Henderson Jr.', team: 'Alabama',
        position: 'WR', conference: 'SEC', YDS: 650, TD: 4,
      },
    })
  })

  it('a pivoted envelope round-trips: normalize(normalize(v)) === normalize(v)', () => {
    const once  = normalizeCollegeStats(pivotedEnvelope)
    const twice = normalizeCollegeStats(once)
    expect(twice).toEqual(once)
    expect(once).toEqual(pivotedEnvelope.players)
  })

  it('an already-normalized flat map is returned as-is, not treated as a miss', () => {
    const flatMap = { '4685381': { playerId: '4685381', YDS: 650, TD: 4 } }
    expect(normalizeCollegeStats(flatMap)).toBe(flatMap)
  })

  it('null/undefined stay a miss under repeated application', () => {
    expect(normalizeCollegeStats(normalizeCollegeStats(null))).toBeNull()
    expect(normalizeCollegeStats(normalizeCollegeStats(undefined))).toBeNull()
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

  // The bug this guards: once a cache entry holds the *normalized* shape (the steady state
  // since Phase A), a non-idempotent normalizeCollegeStats fed that flat map back through
  // itself and returned null — every cache-hit read after the first would silently degrade to
  // 0 players. `entry.lastModified` must be <= sourceLastModified so the "manifest is newer"
  // branch is not taken and the cache-hit path actually runs.
  it('an already-normalized (pivoted) cache entry still yields non-empty output', async () => {
    const { getCacheRecord } = await import('../utils/cache')
    const { getManifestEntry } = await import('./dataStore')
    const { getBulkPlayerStats } = await import('./cfbd')

    const alreadyNormalized = {
      '4685381': {
        playerId: '4685381', player: 'Emmanuel Henderson Jr.', team: 'Alabama',
        position: 'WR', conference: 'SEC', YDS: 650, TD: 4,
      },
    }
    getCacheRecord.mockResolvedValue({
      data: alreadyNormalized,
      sourceLastModified: '2026-01-01T00:00:00Z',
    })
    getManifestEntry.mockResolvedValue({ lastModified: '2026-01-01T00:00:00Z' })

    const result = await getBulkPlayerStats(2024, 'receiving')

    expect(Object.keys(result).length).toBeGreaterThan(0)
    expect(result).toEqual(alreadyNormalized)
  })
})
