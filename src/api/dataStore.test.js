import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// cache is mocked globally — dataStore imports it at module-init time
vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

// Pure validators — import statically (no module state, unaffected by vi.resetModules)
import { rawBaseUrl, rawManifestUrl, expectedRecordCount, bodyMatchesEntry, isValidRoster, isValidDraft, isValidAdvStats, isValidSchedule, isValidSeasonTotals, isValidGameLogs, isValidTeamContext, isValidCFBDRows, isValidProjectionSnapshot, MIN_SCHEDULE_GAMES, MIN_PLAYERGAME_ROWS, MIN_TEAMCONTEXT_ROWS } from './dataStore.js'
import { isValidKtcSnapshot } from '../utils/ktcHistory'

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
    // Two failures: the raw attempt, then the jsDelivr fallback (CR-29)
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({ ok: false, status: 404 })
    const { isDataStoreReady, tryDataStore } = await import('./dataStore.js')

    expect(await isDataStoreReady()).toBe(false)
    const result = await tryDataStore('nfl/season-totals/2023.json')
    expect(result).toBeNull()
    // Only the two failed manifest requests (raw, jsDelivr) — no file fetch
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('disables data store after manifest network timeout and subsequent calls return null immediately', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    // Two failures: the raw attempt, then the jsDelivr fallback (CR-29)
    fetchSpy.mockRejectedValueOnce(new Error('AbortError: timeout')).mockRejectedValueOnce(new Error('AbortError: timeout'))
    const { isDataStoreReady, tryDataStore, getManifestEntry } = await import('./dataStore.js')

    expect(await isDataStoreReady()).toBe(false)
    expect(await tryDataStore('nfl/season-totals/2023.json')).toBeNull()
    expect(await getManifestEntry('nfl/season-totals/2023.json')).toBeNull()
    // Only the two manifest attempts (raw, jsDelivr) — no retries, no file fetch
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })
})

describe('HTTP cache revalidation (P9)', () => {
  const URL = 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main'

  it('manifest fetch revalidates with no-cache and keeps the timeout signal', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', URL)
    const { isDataStoreReady } = await import('./dataStore.js')

    expect(await isDataStoreReady()).toBe(true)
    expect(fetchSpy.mock.calls[0][0]).toBe('https://raw.githubusercontent.com/validuser/sleeper-dashboard-data/main/manifest.json')
    expect(fetchSpy.mock.calls[0][1].cache).toBe('no-cache')
    expect(fetchSpy.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })

  it('family-file fetch revalidates with no-cache and adds no query string', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', URL)
    const { tryDataStore } = await import('./dataStore.js')

    expect(await tryDataStore('nfl/season-totals/2023.json')).not.toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(fetchSpy.mock.calls[1][0]).toBe(`${URL}/nfl/season-totals/2023.json`)
    expect(fetchSpy.mock.calls[1][1].cache).toBe('no-cache')
    expect(fetchSpy.mock.calls[1][1].signal).toBeInstanceOf(AbortSignal)
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

describe('isValidGameLogs', () => {
  function makePlayer(overrides = {}) {
    return { gsisId: '00-1', name: 'A', position: 'WR', games: [{ week: 1, seasonType: 'REG' }], ...overrides }
  }
  function makePayload(overrides = {}) {
    return { schemaVersion: 1, rowCount: MIN_PLAYERGAME_ROWS, players: { '111': makePlayer() }, ...overrides }
  }

  it('V1: valid payload returns true', () => {
    expect(isValidGameLogs(makePayload())).toBe(true)
  })

  it('V2: sparse game (absent stat keys, present 0 elsewhere) still valid', () => {
    const players = { '111': makePlayer({ games: [{ week: 1, seasonType: 'REG', receptions: 0 }, { week: 2, seasonType: 'REG' }] }) }
    expect(isValidGameLogs(makePayload({ players }))).toBe(true)
  })

  it('V3: below-floor rowCount rejected', () => {
    expect(isValidGameLogs(makePayload({ rowCount: 2000 }))).toBe(false)
  })

  it('V4: rowCount not a number returns false', () => {
    expect(isValidGameLogs(makePayload({ rowCount: '3200' }))).toBe(false)
  })

  it('V5: players missing / null returns falsy', () => {
    expect(isValidGameLogs(makePayload({ players: null }))).toBeFalsy()
    expect(isValidGameLogs(makePayload({ players: undefined }))).toBeFalsy()
  })

  it('V6: null input and top-level array input return falsy', () => {
    expect(isValidGameLogs(null)).toBeFalsy()
    expect(isValidGameLogs([makePayload()])).toBeFalsy()
  })

  it('V7: sample player missing games array returns false', () => {
    const players = { '111': { gsisId: '00-1', name: 'A', position: 'WR' } }
    expect(isValidGameLogs(makePayload({ players }))).toBe(false)
    const players2 = { '111': { gsisId: '00-1', name: 'A', position: 'WR', games: 'not-an-array' } }
    expect(isValidGameLogs(makePayload({ players: players2 }))).toBe(false)
  })
})

describe('isValidTeamContext', () => {
  function makeGame(overrides = {}) {
    return { week: 1, seasonType: 'REG', gameId: '2013_01_ARI_STL', opponent: 'ARI', off: {}, def: {}, ...overrides }
  }
  function makeTeams(overrides = {}) {
    return { STL: { games: [makeGame()] }, ...overrides }
  }
  function makePayload(overrides = {}) {
    return { schemaVersion: 1, rowCount: MIN_TEAMCONTEXT_ROWS, teams: makeTeams(), ...overrides }
  }

  it('pins the cross-repo floor at 60', () => {
    expect(MIN_TEAMCONTEXT_ROWS).toBe(60)
  })

  it('valid payload returns true', () => {
    expect(isValidTeamContext(makePayload())).toBe(true)
  })

  it('rejects below-floor rowCount', () => {
    expect(isValidTeamContext(makePayload({ rowCount: 40 }))).toBe(false)
  })

  it('rejects non-number rowCount', () => {
    expect(isValidTeamContext(makePayload({ rowCount: '534' }))).toBe(false)
  })

  it('rejects missing/null teams', () => {
    expect(isValidTeamContext(makePayload({ teams: null }))).toBeFalsy()
    expect(isValidTeamContext({ schemaVersion: 1, rowCount: MIN_TEAMCONTEXT_ROWS })).toBeFalsy()
  })

  it('rejects sampled team without a games array', () => {
    expect(isValidTeamContext(makePayload({ teams: { STL: {} } }))).toBe(false)
  })

  it('rejects sampled team with empty games array', () => {
    expect(isValidTeamContext(makePayload({ teams: { STL: { games: [] } } }))).toBe(false)
  })

  it('rejects games[0] missing off or def', () => {
    const noOff = { STL: { games: [{ week: 1, seasonType: 'REG', gameId: 'x', opponent: 'ARI', def: {} }] } }
    expect(isValidTeamContext(makePayload({ teams: noOff }))).toBe(false)
    const noDef = { STL: { games: [{ week: 1, seasonType: 'REG', gameId: 'x', opponent: 'ARI', off: {} }] } }
    expect(isValidTeamContext(makePayload({ teams: noDef }))).toBe(false)
  })

  it('rejects top-level array payload', () => {
    expect(isValidTeamContext([makePayload()])).toBeFalsy()
  })

  it('rejects null payload', () => {
    expect(isValidTeamContext(null)).toBeFalsy()
  })
})

describe('season-totals schema gate', () => {
  it('T5a — accepts schemaVersion 4 and fetches the file', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    const manifestPayload = {
      files: { 'nfl/season-totals/2023.json': { schemaVersion: 4, inProgress: false, lastModified: '2026-01-01' } },
    }
    const filePayload = { p1: { gamesPlayed: 10, fantasyPoints: 100, dnpWeeks: 2 } }
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifestPayload) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(filePayload) })

    const { tryDataStore } = await import('./dataStore.js')
    const result = await tryDataStore('nfl/season-totals/2023.json', { validate: isValidSeasonTotals })

    expect(result).toEqual(filePayload)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('accepts schemaVersion 3 and fetches the file (below the ceiling still works)', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    const manifestPayload = {
      files: { 'nfl/season-totals/2023.json': { schemaVersion: 3, inProgress: false, lastModified: '2026-01-01' } },
    }
    const filePayload = { p1: { gamesPlayed: 10, fantasyPoints: 100, dnpWeeks: 2 } }
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifestPayload) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(filePayload) })

    const { tryDataStore } = await import('./dataStore.js')
    const result = await tryDataStore('nfl/season-totals/2023.json', { validate: isValidSeasonTotals })

    expect(result).toEqual(filePayload)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('T5b — rejects schemaVersion 5 and short-circuits without fetching the file', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    const manifestPayload = {
      files: { 'nfl/season-totals/2023.json': { schemaVersion: 5, inProgress: false, lastModified: '2026-01-01' } },
    }
    fetchSpy.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifestPayload) })

    const { tryDataStore } = await import('./dataStore.js')
    const result = await tryDataStore('nfl/season-totals/2023.json', { validate: isValidSeasonTotals })

    expect(result).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('inProgress allowlist', () => {
  it('T1a — default rejects inProgress (unchanged behavior pinned)', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    const manifestPayload = {
      files: { 'ktc/snapshot-2026-07-20.json': { schemaVersion: 1, inProgress: true, lastModified: '2026-07-20' } },
    }
    fetchSpy.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifestPayload) })

    const { tryDataStore } = await import('./dataStore.js')
    const result = await tryDataStore('ktc/snapshot-2026-07-20.json', { validate: isValidKtcSnapshot })

    expect(result).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('T1b — allowInProgress:true fetches and returns the file', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    const manifestPayload = {
      files: { 'ktc/snapshot-2026-07-20.json': { schemaVersion: 1, inProgress: true, lastModified: '2026-07-20' } },
    }
    const filePayload = [{ name: 'A', value: 5000 }]
    fetchSpy
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifestPayload) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(filePayload) })

    const { tryDataStore } = await import('./dataStore.js')
    const result = await tryDataStore('ktc/snapshot-2026-07-20.json', { validate: isValidKtcSnapshot, allowInProgress: true })

    expect(result).toEqual(filePayload)
    expect(fetchSpy).toHaveBeenCalledTimes(2)
  })

  it('T1c — allowlist does NOT bypass the schema ceiling', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    const manifestPayload = {
      files: { 'ktc/snapshot-2026-07-20.json': { schemaVersion: 5, inProgress: true, lastModified: '2026-07-20' } },
    }
    fetchSpy.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifestPayload) })

    const { tryDataStore } = await import('./dataStore.js')
    const result = await tryDataStore('ktc/snapshot-2026-07-20.json', { allowInProgress: true })

    expect(result).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('T1d — non-KTC family with inProgress:true and no flag still rejects', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    const manifestPayload = {
      files: { 'nfl/season-totals/2025.json': { schemaVersion: 3, inProgress: true, lastModified: '2026-07-20' } },
    }
    fetchSpy.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifestPayload) })

    const { tryDataStore } = await import('./dataStore.js')
    const result = await tryDataStore('nfl/season-totals/2025.json', { validate: isValidSeasonTotals })

    expect(result).toBeNull()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })
})

describe('isValidProjectionSnapshot', () => {
  it('returns true for a valid snapshot envelope', () => {
    expect(isValidProjectionSnapshot({ players: {}, leagueId: 'x', targetSeason: 2026 })).toBe(true)
  })

  it('returns false for null', () => {
    expect(isValidProjectionSnapshot(null)).toBe(false)
  })

  it('returns false when players is null', () => {
    expect(isValidProjectionSnapshot({ players: null, leagueId: 'x', targetSeason: 2026 })).toBe(false)
  })

  it('returns false when leagueId is not a string', () => {
    expect(isValidProjectionSnapshot({ players: {}, leagueId: 5, targetSeason: 2026 })).toBe(false)
  })

  it('returns false when targetSeason is NaN', () => {
    expect(isValidProjectionSnapshot({ players: {}, leagueId: 'x', targetSeason: NaN })).toBe(false)
  })

  it('returns false when targetSeason is a string', () => {
    expect(isValidProjectionSnapshot({ players: {}, leagueId: 'x', targetSeason: '2026' })).toBe(false)
  })
})

describe('listManifestPaths', () => {
  it('returns only the keys matching the given prefix', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    const manifestPayload = {
      files: {
        'snapshots/2026-09-08.json': { schemaVersion: 3, inProgress: false, lastModified: '2026-09-08' },
        'snapshots/2026-09-09.json': { schemaVersion: 3, inProgress: false, lastModified: '2026-09-09' },
        'ktc/snapshot-2026-09-01.json': { schemaVersion: 1, inProgress: true, lastModified: '2026-09-01' },
      },
    }
    fetchSpy.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(manifestPayload) })

    const { listManifestPaths } = await import('./dataStore.js')
    const result = await listManifestPaths('snapshots/')

    expect(result.sort()).toEqual(['snapshots/2026-09-08.json', 'snapshots/2026-09-09.json'])
  })

  it('returns [] when the data store is disabled (placeholder URL, no fetch)', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/<user>/sleeper-dashboard-data@main')
    const { listManifestPaths } = await import('./dataStore.js')

    expect(await listManifestPaths('snapshots/')).toEqual([])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns [] when the manifest fetch fails', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main')
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 404 }).mockResolvedValueOnce({ ok: false, status: 404 })
    const { listManifestPaths } = await import('./dataStore.js')

    expect(await listManifestPaths('snapshots/')).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(2)   // raw attempt + jsDelivr fallback, both failed
  })
})

describe('isValidCFBDRows (college-pivot.md §1.3/§3.1)', () => {
  it('accepts today\'s long-form array shape (playerId/statType/stat on the first row)', () => {
    const rows = [
      { season: 2024, playerId: '4685381', player: 'A', team: 'Alabama', conference: 'SEC', category: 'receiving', statType: 'LONG', stat: '34' },
    ]
    expect(isValidCFBDRows(rows)).toBe(true)
  })

  it('accepts the pivoted envelope shape (players object + numeric rowCount)', () => {
    const envelope = {
      schemaVersion: 2, season: 2024, category: 'receiving', rowCount: 1,
      players: { '4685381': { playerId: '4685381', player: 'A', team: 'Alabama', position: 'WR', conference: 'SEC', LONG: 34 } },
    }
    expect(isValidCFBDRows(envelope)).toBe(true)
  })

  it('rejects a bare array of pivoted records — Array.isArray passes but the row shape does not', () => {
    const rows = [
      { playerId: '4685381', player: 'A', team: 'Alabama', position: 'WR', conference: 'SEC', LONG: 34 },
    ]
    expect(isValidCFBDRows(rows)).toBe(false)
  })

  it('rejects an envelope with an empty players object', () => {
    const envelope = { schemaVersion: 2, rowCount: 0, players: {} }
    expect(isValidCFBDRows(envelope)).toBe(false)
  })

  it('rejects an envelope missing rowCount', () => {
    const envelope = { schemaVersion: 2, players: { '1': { playerId: '1' } } }
    expect(isValidCFBDRows(envelope)).toBe(false)
  })

  it('rejects null', () => {
    expect(isValidCFBDRows(null)).toBe(false)
  })

  it('rejects an empty array (today\'s existing rule, unchanged)', () => {
    expect(isValidCFBDRows([])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// CR-29 — manifest transport (raw GitHub primary, jsDelivr fallback)
// ---------------------------------------------------------------------------

describe('rawManifestUrl', () => {
  const RAW = 'https://raw.githubusercontent.com/o/r'
  it.each([
    ['https://cdn.jsdelivr.net/gh/o/r@main', `${RAW}/main/manifest.json`],
    ['https://cdn.jsdelivr.net/gh/o/r@v1.2', `${RAW}/v1.2/manifest.json`],
    ['https://cdn.jsdelivr.net/gh/o/r@' + 'a'.repeat(40), `${RAW}/${'a'.repeat(40)}/manifest.json`],
    ['https://cdn.jsdelivr.net/gh/o/r@main/', `${RAW}/main/manifest.json`],
    ['https://cdn.jsdelivr.net/gh/<user>/r@main', 'https://raw.githubusercontent.com/<user>/r/main/manifest.json'],
    ['http://localhost:5173/data', null],
    ['https://raw.githubusercontent.com/o/r/main', null],
    ['https://cdn.jsdelivr.net/gh/o/r', null],
    [undefined, null],
  ])('%s → %s', (base, expected) => {
    expect(rawManifestUrl(base)).toBe(expected)
  })
})

describe('rawBaseUrl', () => {
  const RAW = 'https://raw.githubusercontent.com/o/r'
  it.each([
    ['https://cdn.jsdelivr.net/gh/o/r@main', `${RAW}/main`],
    ['https://cdn.jsdelivr.net/gh/o/r@v1.2', `${RAW}/v1.2`],
    ['https://cdn.jsdelivr.net/gh/o/r@' + 'a'.repeat(40), `${RAW}/${'a'.repeat(40)}`],
    ['https://cdn.jsdelivr.net/gh/o/r@main/', `${RAW}/main`],
    ['https://cdn.jsdelivr.net/gh/<user>/r@main', 'https://raw.githubusercontent.com/<user>/r/main'],
    ['http://localhost:5173/data', null],
    ['https://raw.githubusercontent.com/o/r/main', null],
    ['https://cdn.jsdelivr.net/gh/o/r', null],
    [undefined, null],
  ])('%s → %s', (base, expected) => {
    expect(rawBaseUrl(base)).toBe(expected)
  })
})

describe('loadManifest source order (CR-29)', () => {
  const BASE = 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main'
  const RAW_URL = 'https://raw.githubusercontent.com/validuser/sleeper-dashboard-data/main/manifest.json'
  const okManifest = { ok: true, json: () => Promise.resolve({ files: { a: {} } }) }
  const urls = () => fetchSpy.mock.calls.map(c => c[0])

  it('primary success fetches only the raw URL', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const { isDataStoreReady } = await import('./dataStore.js')
    expect(await isDataStoreReady()).toBe(true)
    expect(urls()).toEqual([RAW_URL])
  })

  it('raw 503 → falls back to the jsDelivr manifest', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce(okManifest)
    const { isDataStoreReady } = await import('./dataStore.js')
    expect(await isDataStoreReady()).toBe(true)
    expect(urls()).toEqual([RAW_URL, `${BASE}/manifest.json`])
  })

  it('raw network throw → fallback', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const warnSpy = vi.spyOn(console, 'warn')
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(okManifest)
    const { isDataStoreReady } = await import('./dataStore.js')
    expect(await isDataStoreReady()).toBe(true)
    expect(urls()).toEqual([RAW_URL, `${BASE}/manifest.json`])
    expect(warnSpy.mock.calls.filter(a => a.some(x => typeof x === 'string' && x.includes('trying next source')))).toHaveLength(1)
  })

  it('raw 200 without a files object → fallback', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    fetchSpy.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ nope: 1 }) }).mockResolvedValueOnce(okManifest)
    const { isDataStoreReady } = await import('./dataStore.js')
    expect(await isDataStoreReady()).toBe(true)
    expect(urls()).toEqual([RAW_URL, `${BASE}/manifest.json`])
  })

  it('raw timeout (AbortError) → fallback', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    fetchSpy.mockRejectedValueOnce(abort).mockResolvedValueOnce(okManifest)
    const { isDataStoreReady } = await import('./dataStore.js')
    expect(await isDataStoreReady()).toBe(true)
    expect(urls()).toEqual([RAW_URL, `${BASE}/manifest.json`])
  })

  it('both fail → data store disabled after exactly two fetches', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: false, status: 503 })
    const { isDataStoreReady } = await import('./dataStore.js')
    expect(await isDataStoreReady()).toBe(false)
    expect(urls()).toEqual([RAW_URL, `${BASE}/manifest.json`])
  })

  it('a non-matching base fetches exactly once and never contacts raw.githubusercontent.com', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'http://localhost:5173/data')
    const { isDataStoreReady } = await import('./dataStore.js')
    expect(await isDataStoreReady()).toBe(true)
    expect(urls()).toEqual(['http://localhost:5173/data/manifest.json'])
  })

  it('a <user> placeholder base never fetches (guard runs before the raw mapping)', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', 'https://cdn.jsdelivr.net/gh/<user>/r@main')
    const { isDataStoreReady } = await import('./dataStore.js')
    expect(await isDataStoreReady()).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// R4 — body vs manifest entry (manifest-raw-source A1b)
// ---------------------------------------------------------------------------

describe('expectedRecordCount', () => {
  it.each([
    ['college/receiving/2024.json', { playerCount: 7 }, 7],
    ['nfl/season-totals/2025.json', { p1: {}, p2: {} }, 2],
    ['nflverse/advstats/2025.json', { rowCount: 11 }, 11],
    ['nflverse/depth/2025.json', { rowCount: 12 }, 12],
    ['nflverse/gamelogs/2025.json', { rowCount: 13 }, 13],
    ['nflverse/oline/2025.json', { rowCount: 14 }, 14],
    ['nflverse/roster/2025.json', { rowCount: 15 }, 15],
    ['nflverse/rosterweekly/2025.json', { rowCount: 16 }, 16],
    ['nflverse/schedule/2025.json', { rowCount: 17 }, 17],
    ['nflverse/snaps/2025.json', { rowCount: 18 }, 18],
    ['nflverse/teamcontext/2025.json', { rowCount: 19 }, 19],
    ['enrichment/x.json', { entries: [1, 2, 3] }, 3],
    ['ktc/snapshot-2026-10-01.json', [1, 2], 2],
    ['snapshots/2026-10-01.json', { players: { a: 1, b: 2, c: 3, d: 4 } }, 4],
    ['nflverse/draft/draft_picks.json', { rowCount: 5, picksByYear: {} }, null],
    ['unknown/thing.json', { rowCount: 5 }, null],
    ['nflverse/oline/2025.json', { rowCount: 'x' }, null],
  ])('%s → %s', (path, json, expected) => {
    expect(expectedRecordCount(path, json)).toBe(expected)
  })
})

describe('bodyMatchesEntry', () => {
  const LM = '2026-10-15T12:00:00.000Z'
  const entry = { recordCount: 10, lastModified: LM }
  const P = 'nflverse/oline/2025.json'

  it('count equal + generatedAt 50 ms before → true', () => {
    expect(bodyMatchesEntry(P, { rowCount: 10, generatedAt: '2026-10-15T11:59:59.950Z' }, entry)).toBe(true)
  })
  it('count off by one → false', () => {
    expect(bodyMatchesEntry(P, { rowCount: 9, generatedAt: LM }, entry)).toBe(false)
  })
  it('count equal + generatedAt 2 days before → false', () => {
    expect(bodyMatchesEntry(P, { rowCount: 10, generatedAt: '2026-10-13T12:00:00.000Z' }, entry)).toBe(false)
  })
  it('no generatedAt and null count → true', () => {
    expect(bodyMatchesEntry('nflverse/draft/draft_picks.json', { picksByYear: {} }, entry)).toBe(true)
  })
  it('unparseable dates skip the generatedAt half', () => {
    expect(bodyMatchesEntry(P, { rowCount: 10, generatedAt: 'garbage' }, entry)).toBe(true)
  })
})

describe('tryDataStore stale-body tracking (R4)', () => {
  const BASE = 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main'
  const P = 'nflverse/oline/2025.json'
  const manifest = { files: { [P]: { schemaVersion: 1, inProgress: false, lastModified: '2026-10-15T12:00:00.000Z', recordCount: 10 } } }
  const respond = body => ({ ok: true, json: () => Promise.resolve(body) })

  it('returns a mismatched body, flags it stale, and a later matching fetch clears the flag', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const warnSpy = vi.spyOn(console, 'warn')
    fetchSpy
      .mockResolvedValueOnce(respond(manifest))
      .mockResolvedValueOnce(respond({ rowCount: 9, generatedAt: '2026-10-08T12:00:00.000Z' }))
      .mockResolvedValueOnce(respond({ rowCount: 10, generatedAt: '2026-10-15T11:59:59.950Z' }))
    const { tryDataStore, wasServedStale } = await import('./dataStore.js')

    const stale = await tryDataStore(P)
    expect(stale).toEqual({ rowCount: 9, generatedAt: '2026-10-08T12:00:00.000Z' })
    expect(wasServedStale(P)).toBe(true)
    expect(warnSpy.mock.calls.filter(a => a.some(x => typeof x === 'string' && x.includes(`stale-body:${P}`)))).toHaveLength(1)

    const fresh = await tryDataStore(P)
    expect(fresh.rowCount).toBe(10)
    expect(wasServedStale(P)).toBe(false)
  })
})

describe('tryDataStore family-file fallback (CR-29)', () => {
  const BASE = 'https://cdn.jsdelivr.net/gh/validuser/sleeper-dashboard-data@main'
  const RAW = 'https://raw.githubusercontent.com/validuser/sleeper-dashboard-data/main'
  const P1 = 'nfl/season-totals/2023.json'
  const P2 = 'nfl/season-totals/2022.json'
  const row = { gamesPlayed: 1, fantasyPoints: 1, dnpWeeks: 0 }
  const body1 = { p1: row }
  // recordCount 1 matches body1 and the default mock's { files } body (one key)
  const entry = (extra = {}) => ({ schemaVersion: 4, inProgress: false, lastModified: '2026-10-15T12:00:00.000Z', recordCount: 1, ...extra })
  const manifest = { files: { [P1]: entry(), [P2]: entry() } }
  const respond = body => ({ ok: true, json: () => Promise.resolve(body) })
  const abort = () => Object.assign(new Error('aborted'), { name: 'AbortError' })
  const warns = (spy, s) => spy.mock.calls.filter(a => a.some(x => typeof x === 'string' && x.includes(s)))
  const urls = () => fetchSpy.mock.calls.map(c => c[0])

  it.each([
    ['HTTP 403', () => fetchSpy.mockResolvedValueOnce({ ok: false, status: 403 })],
    ['timeout', () => fetchSpy.mockRejectedValueOnce(abort())],
    ['parse-error', () => fetchSpy.mockResolvedValueOnce({ ok: true, json: () => Promise.reject(new SyntaxError('Unexpected token')) })],
    ['network', () => fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'))],
  ])('primary %s → served from raw', async (status, queuePrimary) => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const warnSpy = vi.spyOn(console, 'warn')
    fetchSpy.mockResolvedValueOnce(respond(manifest))
    queuePrimary()
    fetchSpy.mockResolvedValueOnce(respond(body1))
    const { tryDataStore } = await import('./dataStore.js')

    expect(await tryDataStore(P1)).toEqual(body1)
    expect(urls()).toEqual([`${RAW}/manifest.json`, `${BASE}/${P1}`, `${RAW}/${P1}`])
    expect(urls()[2]).toBe('https://raw.githubusercontent.com/validuser/sleeper-dashboard-data/main/nfl/season-totals/2023.json')
    const w = warns(warnSpy, 'fetch failed')
    expect(w).toHaveLength(1)
    const text = w[0].join(' ')
    expect(text).toContain('host=cdn.jsdelivr.net')
    expect(text).toContain(`path=${P1}`)
    expect(text).toContain(`status=${status}`)
  })

  it('validate false on primary → null, no raw fetch, primary not skipped', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const warnSpy = vi.spyOn(console, 'warn')
    fetchSpy.mockResolvedValueOnce(respond(manifest)).mockResolvedValueOnce(respond({ p1: { gamesPlayed: 1 } }))
    const { tryDataStore, isValidSeasonTotals } = await import('./dataStore.js')

    expect(await tryDataStore(P1, { validate: isValidSeasonTotals })).toBeNull()
    expect(urls()).not.toContain(`${RAW}/${P1}`)
    expect(warns(warnSpy, 'shape mismatch')).toHaveLength(1)
    await tryDataStore(P2)
    expect(urls()).toContain(`${BASE}/${P2}`)
  })

  it('validate throws on primary → null (not a rejection), no raw fetch, primary not skipped', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const warnSpy = vi.spyOn(console, 'warn')
    fetchSpy.mockResolvedValueOnce(respond(manifest)).mockResolvedValueOnce(respond(body1))
    const { tryDataStore } = await import('./dataStore.js')

    const validate = () => { throw new TypeError('x') }
    expect(await tryDataStore(P1, { validate })).toBeNull()
    expect(urls()).not.toContain(`${RAW}/${P1}`)
    expect(warns(warnSpy, 'shape mismatch')).toHaveLength(1)
    expect(warns(warnSpy, 'fetch failed')).toHaveLength(0)
    await tryDataStore(P2)
    expect(urls()).toContain(`${BASE}/${P2}`)
  })

  it('logs "trying raw" for the primary and "no more hosts" for raw when both fail', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const warnSpy = vi.spyOn(console, 'warn')
    fetchSpy.mockResolvedValueOnce(respond(manifest))
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: false, status: 403 })
    const { tryDataStore } = await import('./dataStore.js')

    expect(await tryDataStore(P1)).toBeNull()
    const w = warns(warnSpy, 'fetch failed').map(a => a.join(' '))
    expect(w).toHaveLength(2)
    expect(w.find(t => t.includes('host=cdn.jsdelivr.net'))).toContain('— trying raw')
    expect(w.find(t => t.includes('host=raw.githubusercontent.com'))).toContain('status=HTTP 403 — no more hosts')
  })

  it('skips the failed primary on later paths and logs the skip once', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    const warnSpy = vi.spyOn(console, 'warn')
    fetchSpy.mockResolvedValueOnce(respond(manifest))
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce(respond(body1))
      .mockResolvedValueOnce(respond(body1))
    const { tryDataStore } = await import('./dataStore.js')

    expect(await tryDataStore(P1)).toEqual(body1)
    expect(await tryDataStore(P2)).toEqual(body1)
    expect(urls().slice(-1)).toEqual([`${RAW}/${P2}`])
    expect(urls()).not.toContain(`${BASE}/${P2}`)
    expect(warns(warnSpy, 'skipped for the rest of this session')).toHaveLength(1)
  })

  it('Guard 2: once both hosts have failed, later paths use the primary only', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    fetchSpy.mockResolvedValueOnce(respond(manifest))
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce({ ok: false, status: 403 })
    const { tryDataStore } = await import('./dataStore.js')

    expect(await tryDataStore(P1)).toBeNull()
    expect(await tryDataStore(P2)).not.toBeNull()
    expect(urls().slice(-1)).toEqual([`${BASE}/${P2}`])
    expect(urls()).not.toContain(`${RAW}/${P2}`)
  })

  it('Guard 1: a single-host (raw) base never skips and ends with "no more hosts"', async () => {
    vi.stubEnv('VITE_DATA_STORE_URL', RAW)
    const warnSpy = vi.spyOn(console, 'warn')
    fetchSpy.mockResolvedValueOnce(respond(manifest)).mockResolvedValueOnce({ ok: false, status: 403 })
    const { tryDataStore } = await import('./dataStore.js')

    expect(await tryDataStore(P1)).toBeNull()
    expect(await tryDataStore(P2)).not.toBeNull()
    expect(urls()).toEqual([`${RAW}/manifest.json`, `${RAW}/${P1}`, `${RAW}/${P2}`])
    expect(warns(warnSpy, 'fetch failed')[0].join(' ')).toMatch(/— no more hosts$/)
  })

  it('a body served by raw that disagrees with its entry is flagged stale', async () => {
    const P = 'nflverse/oline/2025.json'
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    fetchSpy.mockResolvedValueOnce(respond({ files: { [P]: entry({ schemaVersion: 1, recordCount: 10 }) } }))
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce(respond({ rowCount: 9 }))
    const { tryDataStore, wasServedStale } = await import('./dataStore.js')

    expect(await tryDataStore(P)).toEqual({ rowCount: 9 })
    expect(wasServedStale(P)).toBe(true)
  })

  it('in-progress season-totals (allowInProgress) is served from raw after a primary failure', async () => {
    const P = 'nfl/season-totals/2026.json'
    vi.stubEnv('VITE_DATA_STORE_URL', BASE)
    fetchSpy.mockResolvedValueOnce(respond({ files: { [P]: entry({ inProgress: true }) } }))
      .mockResolvedValueOnce({ ok: false, status: 403 })
      .mockResolvedValueOnce(respond(body1))
    const { tryDataStore, isValidSeasonTotals } = await import('./dataStore.js')

    expect(await tryDataStore(P, { validate: isValidSeasonTotals, allowInProgress: true })).toEqual(body1)
    expect(urls()).toContain(`${RAW}/${P}`)
  })
})
