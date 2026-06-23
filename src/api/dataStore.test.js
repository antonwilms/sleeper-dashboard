import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// cache is mocked globally — dataStore imports it at module-init time
vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

// Pure validators — import statically (no module state, unaffected by vi.resetModules)
import { isValidRoster, isValidDraft, isValidAdvStats, isValidSchedule, MIN_SCHEDULE_GAMES } from './dataStore.js'

let fetchSpy

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ files: { 'nfl/season-totals/2023.json': { lastModified: '2026-01-01', schemaVersion: 2, inProgress: false } } }),
  })
  // Reset modules so module-level state (sessionDisabled, manifestPromise) is fresh
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('placeholder URL guard', () => {
  it('disables data store without fetching when VITE_DATA_STORE_URL is undefined', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', undefined)
    const { isDataStoreReady, tryDataStore } = await import('./dataStore.js')

    expect(await isDataStoreReady()).toBe(false)
    expect(await tryDataStore('nfl/season-totals/2023.json')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('disables data store without fetching when URL contains <user> placeholder', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/<user>/sleeper-dashboard-data@main')
    const { isDataStoreReady, tryDataStore } = await import('./dataStore.js')

    expect(await isDataStoreReady()).toBe(false)
    expect(await tryDataStore('nfl/season-totals/2023.json')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('logs once (not repeatedly) for placeholder URL', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/<user>/sleeper-dashboard-data@main')
    const warnSpy = vi.spyOn(console, 'warn')
    const { isDataStoreReady } = await import('./dataStore.js')

    await isDataStoreReady()
    await isDataStoreReady()
    await isDataStoreReady()

    const placeholderWarns = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('placeholder'))
    )
    expect(placeholderWarns).toHaveLength(1)
  })
})

describe('manifest HTTP error → sessionDisabled', () => {
  it('disables data store after manifest 404 and short-circuits subsequent tryDataStore', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 })
    const { isDataStoreReady, tryDataStore } = await import('./dataStore.js')

    expect(await isDataStoreReady()).toBe(false)
    const result = await tryDataStore('nfl/season-totals/2023.json')
    expect(result).toBeNull()
    // Only the single failed manifest request — no file fetch
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('disables data store after manifest network timeout and subsequent calls return null immediately', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    fetchSpy.mockRejectedValueOnce(new Error('AbortError: timeout'))
    const { isDataStoreReady, tryDataStore, getManifestEntry } = await import('./dataStore.js')

    expect(await isDataStoreReady()).toBe(false)
    expect(await tryDataStore('nfl/season-totals/2023.json')).toBeNull()
    expect(await getManifestEntry('nfl/season-totals/2023.json')).toBeNull()
    // Only one fetch attempt (the failed manifest) — no retries
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

// ---------------------------------------------------------------------------
// isValidRoster
// ---------------------------------------------------------------------------

describe('isValidRoster', () => {
  it('returns true for a valid roster payload', () => {
    expect(isValidRoster({
      schemaVersion: 1,
      season: 2025,
      rowCount: 2141,
      players: { '4984': { team: 'BUF', position: 'QB', status: 'ACT', fullName: 'Josh Allen' } },
    })).toBe(true)
  })

  it('returns false when players is missing', () => {
    expect(isValidRoster({ rowCount: 100 })).toBe(false)
  })

  it('returns false when rowCount is not a number', () => {
    expect(isValidRoster({ players: {}, rowCount: '100' })).toBe(false)
  })

  it('returns falsy for null', () => {
    expect(isValidRoster(null)).toBeFalsy()
  })

  it('returns falsy for an array', () => {
    expect(isValidRoster([{ players: {}, rowCount: 1 }])).toBeFalsy()
  })

  it('returns falsy when players is null', () => {
    expect(isValidRoster({ players: null, rowCount: 100 })).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// isValidDraft
// ---------------------------------------------------------------------------

describe('isValidDraft', () => {
  it('returns true for a valid draft payload', () => {
    expect(isValidDraft({
      schemaVersion: 1,
      count: 3421,
      picksByYear: { 2024: [{ year: 2024, round: 1, pick: 1, team: 'CHI', fullName: 'Caleb Williams', position: 'QB', college: 'USC', age: 22 }] },
    })).toBe(true)
  })

  it('returns falsy when picksByYear is missing', () => {
    expect(isValidDraft({ count: 1 })).toBeFalsy()
  })

  it('returns false when picksByYear is not an object (string)', () => {
    expect(isValidDraft({ picksByYear: 'bad' })).toBe(false)
  })

  it('returns falsy for null', () => {
    expect(isValidDraft(null)).toBeFalsy()
  })

  it('returns falsy for an array', () => {
    expect(isValidDraft([{ picksByYear: {} }])).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// isValidAdvStats
// ---------------------------------------------------------------------------

describe('isValidAdvStats', () => {
  it('returns true for a valid advstats payload', () => {
    expect(isValidAdvStats({
      schemaVersion: 1, season: 2025, rowCount: 312,
      players: { '111': { position: 'WR', targetShare: 0.241, airYardsShare: 0.305, wopr: 0.62, racr: 1.12, components: {} } },
    })).toBe(true)
  })

  it('returns falsy for null', () => {
    expect(isValidAdvStats(null)).toBeFalsy()
  })

  it('returns falsy for an array', () => {
    expect(isValidAdvStats([{ players: {}, rowCount: 1 }])).toBeFalsy()
  })

  it('returns falsy when players is null', () => {
    expect(isValidAdvStats({ players: null, rowCount: 100 })).toBeFalsy()
  })

  it('returns false when rowCount is not a number', () => {
    expect(isValidAdvStats({ players: {}, rowCount: '312' })).toBe(false)
  })

  it('returns falsy when players field is missing', () => {
    expect(isValidAdvStats({ rowCount: 312 })).toBeFalsy()
  })
})

describe('isValidSchedule', () => {
  function makeGames(n, base = { gameId: 'g1', homeTeam: 'KC', awayTeam: 'BAL' }) {
    return Array.from({ length: n }, () => ({ ...base }))
  }

  it('valid payload returns true', () => {
    expect(isValidSchedule({ games: makeGames(MIN_SCHEDULE_GAMES) })).toBe(true)
  })

  it('null-scored current season passes', () => {
    const games = makeGames(MIN_SCHEDULE_GAMES, {
      gameId: 'g1', homeTeam: 'KC', awayTeam: 'BAL',
      homeScore: null, awayScore: null, result: null, temp: null, wind: null,
    })
    expect(isValidSchedule({ games })).toBe(true)
  })

  it('result === 0 tie passes', () => {
    const games = makeGames(MIN_SCHEDULE_GAMES, {
      gameId: 'g1', homeTeam: 'KC', awayTeam: 'BAL', result: 0,
    })
    expect(isValidSchedule({ games })).toBe(true)
  })

  it('below-floor rejected', () => {
    expect(isValidSchedule({ games: makeGames(150) })).toBe(false)
  })

  it('missing games field returns false', () => {
    expect(isValidSchedule({ games: undefined })).toBe(false)
  })

  it('non-array games field returns false', () => {
    expect(isValidSchedule({ games: 'x' })).toBe(false)
  })

  it('null returns falsy', () => {
    expect(isValidSchedule(null)).toBeFalsy()
  })

  it('top-level array returns falsy', () => {
    expect(isValidSchedule([{ games: makeGames(MIN_SCHEDULE_GAMES) }])).toBeFalsy()
  })

  it('sample game missing gameId returns false', () => {
    const games = makeGames(MIN_SCHEDULE_GAMES, { homeTeam: 'KC', awayTeam: 'BAL' })
    expect(isValidSchedule({ games })).toBe(false)
  })
})
