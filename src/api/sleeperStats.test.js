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

// Partial mock: calculateFantasyPoints stays a stub for the live-API weekly path, while the
// season-rescore exports (scoreSeasonStats etc.) are the real implementations.
vi.mock('../utils/fantasyPoints', async (importOriginal) => ({
  ...(await importOriginal()),
  calculateFantasyPoints: vi.fn(() => 10),
}))

import { loadCareerHistory, loadCurrentSeasonTotals, rescoreSeasonTotals, getWeeklyStatRows, getWeeklyProjectionRows } from './sleeperStats.js'
import { getCache, getCacheRecord, setCache, setCacheWithMeta } from '../utils/cache'
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

// in-season-app-read.md §2/§5 — loadCurrentSeasonTotals: the live-season loader, layered TTL +
// lastModified freshness (nflRoster.js's pattern), allowInProgress scoped to this one call, a cache
// key distinct from getSeasonTotals' own `season-totals/<season>`, and a graceful empty shape.
describe('loadCurrentSeasonTotals', () => {
  const ENTRY_2026 = { inProgress: true, lastModified: '2026-09-02T00:00:00Z', schemaVersion: 4 }
  const LIVE_PLAYERS = { pid9: { gamesPlayed: 3, fantasyPoints: 40, dnpWeeks: 0, team: 'KC' } }

  it('absence: no manifest entry → the empty shape, complete:false, no throw', async () => {
    getManifestEntry.mockResolvedValue(null)

    const result = await loadCurrentSeasonTotals(2026)

    expect(result).toEqual({ players: {}, season: 2026, complete: false })
    expect(tryDataStore).not.toHaveBeenCalled()
  })

  it('freshness: an unchanged manifest lastModified serves from cache, no fetch', async () => {
    getManifestEntry.mockResolvedValue(ENTRY_2026)
    getCacheRecord.mockResolvedValue({
      data: { players: LIVE_PLAYERS, lastModified: ENTRY_2026.lastModified },
    })

    const result = await loadCurrentSeasonTotals(2026)

    expect(result).toEqual({ players: LIVE_PLAYERS, season: 2026, complete: true })
    expect(tryDataStore).not.toHaveBeenCalled()
  })

  it('freshness: a changed manifest lastModified invalidates the cache and re-fetches', async () => {
    getManifestEntry.mockResolvedValue(ENTRY_2026)
    getCacheRecord.mockResolvedValue({
      data: { players: { stale: true }, lastModified: '2026-08-01T00:00:00Z' },
    })
    tryDataStore.mockResolvedValue(LIVE_PLAYERS)

    const result = await loadCurrentSeasonTotals(2026)

    expect(tryDataStore).toHaveBeenCalledWith('nfl/season-totals/2026.json', { validate: expect.any(Function), allowInProgress: true })
    expect(result).toEqual({ players: LIVE_PLAYERS, season: 2026, complete: true })
  })

  it('allowInProgress scoping: this loader accepts an inProgress entry (unlike the default path)', async () => {
    getManifestEntry.mockResolvedValue(ENTRY_2026)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(LIVE_PLAYERS)

    await loadCurrentSeasonTotals(2026)

    expect(tryDataStore).toHaveBeenCalledWith('nfl/season-totals/2026.json', expect.objectContaining({ allowInProgress: true }))
  })

  it('caches under a DISTINCT key from getSeasonTotals — a wrapper, not a bare players map, with permanent TTL', async () => {
    getManifestEntry.mockResolvedValue(ENTRY_2026)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(LIVE_PLAYERS)

    await loadCurrentSeasonTotals(2026)

    expect(setCacheWithMeta).toHaveBeenCalledWith(
      'season-totals-live/2026',
      { players: LIVE_PLAYERS, lastModified: ENTRY_2026.lastModified },
      999999
    )
  })

  it('tryDataStore rejecting (fetch fail, shape mismatch, schema ceiling) → the empty shape, not a throw', async () => {
    getManifestEntry.mockResolvedValue(ENTRY_2026)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)

    const result = await loadCurrentSeasonTotals(2026)

    expect(result).toEqual({ players: {}, season: 2026, complete: false })
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })
})

describe('D1a — onSeasonPath (career-provenance callback)', () => {
  it('fires once per season with the loader\'s classification, and result is unchanged', async () => {
    getCacheRecord.mockResolvedValue(makeCacheRecord())
    getManifestEntry.mockResolvedValue(null)

    const calls = []
    const result = await loadCareerHistory(
      2013, {}, new Set(['pid1']), { pid1: { team: 'KC' } },
      () => {},
      (season, path) => calls.push([season, path]),
    )

    expect(result).toEqual({ 2012: MOCK_SEASON_DATA })
    expect(calls).toEqual([[2012, 'cache-hit']])
  })

  it('loadCareerHistory\'s return value is byte-identical whether or not onSeasonPath is passed', async () => {
    getCacheRecord.mockResolvedValue(makeCacheRecord())
    getManifestEntry.mockResolvedValue(null)

    const withCallback = await loadCareerHistory(
      2013, {}, new Set(['pid1']), { pid1: { team: 'KC' } }, () => {}, () => {},
    )
    const withoutCallback = await loadCareerHistory(
      2013, {}, new Set(['pid1']), { pid1: { team: 'KC' } }, () => {},
    )

    expect(withoutCallback).toEqual(withCallback)
    expect(withoutCallback).toEqual({ 2012: MOCK_SEASON_DATA })
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

// weekly-decision-1-lineup.md §1/§8 — getWeeklyStatRows/getWeeklyProjectionRows are a
// meta-preserving sibling to getWeeklyStats/getWeeklyProjections. The trap they exist to avoid
// only bites on the SECOND load: fetchStats (used by the bare pair) calls normalizeStatsResponse
// on the cache-hit path too, so a network-only test would pass even with the bug. Both paths are
// asserted here.
describe('getWeeklyStatRows / getWeeklyProjectionRows — meta-preserving fetch', () => {
  const RAW_LIST = [
    { player_id: 'p1', team: 'LAR', opponent: 'SEA', game_id: 'g1', stats: { pass_yd: 10 } },
    { player_id: 'TEAM_LAR', team: null, opponent: null, stats: { pass_att: 29 } },
  ]

  it('preserves team/opponent/gameId on the NETWORK path', async () => {
    getCache.mockResolvedValue(null)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(RAW_LIST),
    })

    const rows = await getWeeklyStatRows(2026, 2, 2)
    expect(rows.p1).toEqual({ stats: { pass_yd: 10 }, team: 'LAR', opponent: 'SEA', gameId: 'g1' })
    expect(setCache).toHaveBeenCalledWith(
      'stat-rows/2026/2',
      expect.objectContaining({ p1: expect.objectContaining({ team: 'LAR', opponent: 'SEA' }) }),
      expect.any(Number)
    )
  })

  it('preserves team/opponent/gameId on the CACHE-HIT path (the bug only bites here)', async () => {
    // Cache already holds the NORMALIZED meta-preserving shape, as setCache would have stored it.
    getCache.mockResolvedValue({
      p1: { stats: { pass_yd: 10 }, team: 'LAR', opponent: 'SEA', gameId: 'g1' },
    })
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const rows = await getWeeklyStatRows(2026, 2, 2)
    expect(rows.p1).toEqual({ stats: { pass_yd: 10 }, team: 'LAR', opponent: 'SEA', gameId: 'g1' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('uses a cache key distinct from getWeeklyStats (stat-rows/, not stats/)', async () => {
    getCache.mockResolvedValue(null)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve(RAW_LIST) })
    await getWeeklyStatRows(2026, 2, 2)
    expect(getCache).toHaveBeenCalledWith('stat-rows/2026/2')
  })

  it('getWeeklyProjectionRows uses projection-rows/ and preserves opponent (the upcoming matchup)', async () => {
    getCache.mockResolvedValue(null)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([{ player_id: 'p1', team: 'LAR', opponent: 'DEN', stats: { pass_yd: 200 } }]),
    })
    const rows = await getWeeklyProjectionRows(2026, 3, 3)
    expect(rows.p1.opponent).toBe('DEN')
    expect(getCache).toHaveBeenCalledWith('projection-rows/2026/3')
  })

  it('a bye team has no row at all in the projections payload (opponent == null signal)', async () => {
    getCache.mockResolvedValue(null)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: () => Promise.resolve([]) })
    const rows = await getWeeklyProjectionRows(2026, 3, 3)
    expect(rows).toEqual({})
  })
})

// season-rescore.md §3.2/§4.2 — the one rescoring seam.
describe('rescoreSeasonTotals', () => {
  // Real scoring math here (scoreSeasonStats is unmocked): hand-computed against LEAGUE.
  const LEAGUE = { rec: 0.5, rec_yd: 0.1, rec_td: 6, bonus_rec_te: 0.5, bonus_fd_wr: 0.25, bonus_fd_te: 0.25, bonus_fd_rb: 0.25 }
  const PLAYERS = { w1: { position: 'WR' }, w2: { position: 'WR' }, t1: { position: 'TE' }, k1: { position: 'K' } }

  // Half-PPR served value for the WR below: rec 5 × 0.5 + rec_yd 60 × 0.1 = 8.5 (no first-down bonus).
  // League value pre-2022 (derived bonus): 8.5 + (4 + 1 + 1) × 0.25 = 10.
  function wrRow(extra = {}) {
    return {
      stats: { rec: 5, rec_yd: 60, rec_fd: 4, rush_fd: 1, pass_fd: 1 },
      fantasyPoints: 8.5, scoringBasis: 'half_ppr', gamesPlayed: 2,
      weeklyPoints: { 1: 4.25, 2: 4.25 },
      ...extra,
    }
  }

  it('fantasyPoints = the hand-computed league score; label league; source total and label kept', () => {
    const out = rescoreSeasonTotals({ w1: wrRow() }, LEAGUE, PLAYERS)
    expect(out.w1.fantasyPoints).toBe(10)
    expect(out.w1.scoringBasis).toBe('league')
    expect(out.w1.sourceFantasyPoints).toBe(8.5)
    expect(out.w1.sourceScoringBasis).toBe('half_ppr')
  })

  it('weeklyPoints are each round(v × ratio), sum ≈ fantasyPoints, keys preserved; arrays stay arrays', () => {
    const out = rescoreSeasonTotals({ w1: wrRow() }, LEAGUE, PLAYERS)
    const ratio = 10 / 8.5
    expect(Object.keys(out.w1.weeklyPoints)).toEqual(['1', '2'])
    expect(out.w1.weeklyPoints[1]).toBe(Math.round(4.25 * ratio * 100) / 100)
    const sum = Object.values(out.w1.weeklyPoints).reduce((a, b) => a + b, 0)
    expect(Math.abs(sum - out.w1.fantasyPoints)).toBeLessThanOrEqual(0.01 * 2)

    const arr = rescoreSeasonTotals({ w1: wrRow({ weeklyPoints: [4.25, null, 4.25] }) }, LEAGUE, PLAYERS)
    expect(Array.isArray(arr.w1.weeklyPoints)).toBe(true)
    expect(arr.w1.weeklyPoints).toEqual([5, null, 5])
    expect(arr.w1.sourceWeeklyPoints).toEqual([4.25, null, 4.25])
  })

  it('sourceWeeklyPoints preserves the served weeks by reference while weeklyPoints is scaled', () => {
    const input = { w1: wrRow() }
    const out = rescoreSeasonTotals(input, LEAGUE, PLAYERS)
    expect(out.w1.sourceWeeklyPoints).toEqual({ 1: 4.25, 2: 4.25 })
    expect(out.w1.sourceWeeklyPoints).toBe(input.w1.weeklyPoints)
    expect(out.w1.weeklyPoints[1]).not.toBe(4.25)
  })

  it('a live-API row (no scoringBasis) → sourceScoringBasis null, sourceWeeklyPoints equal to its weeks', () => {
    const out = rescoreSeasonTotals({ w1: wrRow({ scoringBasis: undefined }) }, LEAGUE, PLAYERS)
    expect(out.w1.sourceScoringBasis).toBeNull()
    expect(out.w1.sourceWeeklyPoints).toEqual({ 1: 4.25, 2: 4.25 })
  })

  it('weeklyPoints absent stays absent', () => {
    const row = wrRow(); delete row.weeklyPoints
    const out = rescoreSeasonTotals({ w1: row }, LEAGUE, PLAYERS)
    expect(out.w1.weeklyPoints).toBeUndefined()
    expect(out.w1.sourceWeeklyPoints).toBeNull()
  })

  it('ratio undefined (served total −2) → every week null; served 0 & scored 0 → weeks unchanged', () => {
    const neg = rescoreSeasonTotals({ w1: wrRow({ fantasyPoints: -2 }) }, LEAGUE, PLAYERS)
    expect(neg.w1.weeklyPoints).toEqual({ 1: null, 2: null })
    const zero = rescoreSeasonTotals({
      w1: { stats: {}, fantasyPoints: 0, scoringBasis: 'half_ppr', weeklyPoints: { 1: 0, 2: 0 } },
    }, LEAGUE, PLAYERS)
    expect(zero.w1.fantasyPoints).toBe(0)
    expect(zero.w1.weeklyPoints).toEqual({ 1: 0, 2: 0 })
  })

  it('idempotent: a second pass returns the same row objects; the input is deep-frozen and stats is carried by reference (no derived key leaked)', () => {
    const deepFreeze = (o) => { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o) }
    const rows = deepFreeze({ w1: wrRow() })
    const once = rescoreSeasonTotals(rows, LEAGUE, PLAYERS)
    expect(once.w1.stats).toBe(rows.w1.stats)
    expect(Object.keys(once.w1.stats)).not.toContain('bonus_fd_wr')
    const twice = rescoreSeasonTotals(once, LEAGUE, PLAYERS)
    expect(twice.w1).toBe(once.w1)
    // a row carrying only sourceWeeklyPoints (no sourceFantasyPoints) also passes through by reference
    const partial = { stats: {}, fantasyPoints: 1, sourceWeeklyPoints: { 1: 1 } }
    expect(rescoreSeasonTotals({ p: partial }, LEAGUE, PLAYERS).p).toBe(partial)
  })

  it('per-season detection: one bonus_fd_* row → other rows get no derived bonus; none → the WR row gets it', () => {
    const emitting = rescoreSeasonTotals({
      w1: wrRow(),
      t1: { stats: { rec: 1, bonus_fd_te: 1 }, fantasyPoints: 0.5, scoringBasis: 'half_ppr', gamesPlayed: 1 },
    }, LEAGUE, PLAYERS)
    expect(emitting.w1.fantasyPoints).toBe(8.5) // no derived bonus in an emitting season
    const silent = rescoreSeasonTotals({ w1: wrRow() }, LEAGUE, PLAYERS)
    expect(silent.w1.fantasyPoints).toBe(10)
  })

  it('K rows and unknown positions get no derived bonus', () => {
    const out = rescoreSeasonTotals({
      k1: { stats: { rec_fd: 4, rec: 2 }, fantasyPoints: 1, scoringBasis: 'half_ppr' },
      nobody: { stats: { rec_fd: 4, rec: 2 }, fantasyPoints: 1, scoringBasis: 'half_ppr' },
    }, LEAGUE, PLAYERS)
    expect(out.k1.fantasyPoints).toBe(1)
    expect(out.nobody.fantasyPoints).toBe(1)
  })

  it('null / {} scoringSettings → the same reference back', () => {
    const rows = { w1: wrRow() }
    expect(rescoreSeasonTotals(rows, null, PLAYERS)).toBe(rows)
    expect(rescoreSeasonTotals(rows, {}, PLAYERS)).toBe(rows)
  })

  it('row with a null/absent served label records sourceScoringBasis null', () => {
    const out = rescoreSeasonTotals({ w1: wrRow({ scoringBasis: undefined }) }, LEAGUE, PLAYERS)
    expect(out.w1.sourceScoringBasis).toBeNull()
    expect(out.w1.scoringBasis).toBe('league')
  })
})

describe('season-rescore wiring — loadCareerHistory / loadCurrentSeasonTotals', () => {
  const LEAGUE = { rec: 0.5, rec_yd: 0.1, bonus_fd_wr: 0.25 }
  const PLAYERS = { pid1: { position: 'WR', team: 'KC' } }
  const RAW = () => ({
    pid1: {
      stats: { rec: 5, rec_yd: 60, rec_fd: 4 }, fantasyPoints: 8.5, scoringBasis: 'half_ppr',
      gamesPlayed: 1, weeklyStatus: Array(18).fill('X'), weeklyPoints: { 1: 8.5 },
    },
  })
  const ENTRY = { inProgress: true, lastModified: '2026-09-02T00:00:00Z', schemaVersion: 4 }

  it('loadCareerHistory (data-store path): setCacheWithMeta receives the RAW rows; the returned season is rescored', async () => {
    const raw = RAW()
    getCacheRecord.mockResolvedValue(null)
    getManifestEntry.mockResolvedValue({ lastModified: 'x', schemaVersion: 4 })
    tryDataStore.mockResolvedValue(raw)

    const result = await loadCareerHistory(2013, LEAGUE, new Set(['pid1']), PLAYERS, () => {})

    expect(setCacheWithMeta).toHaveBeenCalledTimes(1)
    expect(setCacheWithMeta.mock.calls[0][1]).toBe(raw)
    expect(raw.pid1.scoringBasis).toBe('half_ppr')
    expect(result[2012].pid1.scoringBasis).toBe('league')
    expect(result[2012].pid1.fantasyPoints).toBe(9.5) // 2.5 + 6 + (4 × 0.25 derived)
    expect(result[2012].pid1.sourceFantasyPoints).toBe(8.5)
  })

  it('loadCurrentSeasonTotals: a fresh fetch caches the RAW rows and returns rescored ones', async () => {
    const raw = RAW()
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(raw)

    const result = await loadCurrentSeasonTotals(2026, LEAGUE, PLAYERS)

    expect(setCacheWithMeta.mock.calls[0][1].players).toBe(raw)
    expect(result.players.pid1.scoringBasis).toBe('league')
    expect(result.players.pid1.fantasyPoints).toBe(9.5)
  })

  it('loadCurrentSeasonTotals: the cache-hit path returns rescored rows too', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue({ data: { players: RAW(), lastModified: ENTRY.lastModified } })

    const result = await loadCurrentSeasonTotals(2026, LEAGUE, PLAYERS)

    expect(tryDataStore).not.toHaveBeenCalled()
    expect(result.players.pid1.scoringBasis).toBe('league')
    expect(result.players.pid1.fantasyPoints).toBe(9.5)
  })

  it('loadCurrentSeasonTotals: no scoringSettings → raw passthrough (rows keep the served label)', async () => {
    const raw = RAW()
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(raw)

    const result = await loadCurrentSeasonTotals(2026)

    expect(result.players).toBe(raw)
    expect(result.players.pid1.scoringBasis).toBe('half_ppr')
  })
})
