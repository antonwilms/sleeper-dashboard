// @vitest-environment jsdom
// parsePage() uses DOMParser — the repo's default 'node' test environment has none.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../utils/cache', () => ({
  getCache: vi.fn(() => Promise.resolve(null)),
  setCache: vi.fn(() => Promise.resolve()),
}))

vi.mock('./dataStore', () => ({
  isDataStoreReady: vi.fn(() => Promise.resolve(false)),
  tryDataStore:     vi.fn(() => Promise.resolve(null)),
}))

// KTC page markup: one `.onePlayer` row, enough for parsePage to succeed (DEV-proxy path only).
const ONE_PLAYER_HTML = `
  <div class="onePlayer">
    <div class="player-name"><p><a>Ja'Marr Chase</a></p><span class="player-team">CIN</span></div>
    <div class="position-team">WR1</div>
    <div class="value"><p>9,500</p></div>
  </div>
`

const SNAPSHOT_ROWS = [
  { name: 'Ja\'Marr Chase', team: 'CIN', value: 9500, position: 'WR' },
  { name: 'Bijan Robinson', team: 'ATL', value: 8800, position: 'RB' },
]

let fetchSpy

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('getKTCValues — data-store primary source', () => {
  it('store-read returns the latest ktc/snapshot-<date>.json rows', async () => {
    vi.stubEnv('DEV', false)
    const { getCache } = await import('../utils/cache')
    const { isDataStoreReady, tryDataStore } = await import('./dataStore')

    isDataStoreReady.mockResolvedValue(true)
    getCache.mockImplementation((key) => {
      if (key === 'data-store/manifest') {
        return Promise.resolve({
          files: {
            'ktc/snapshot-2026-08-25.json': { inProgress: true },
            'ktc/snapshot-2026-09-01.json': { inProgress: true }, // newest — must be picked
            'ktc/snapshot-2026-08-18.json': { inProgress: true },
            'nfl/season-totals/2025.json':  { inProgress: false }, // non-KTC entry, must be ignored
          },
        })
      }
      return Promise.resolve(null) // 'ktc-values' cache miss
    })
    tryDataStore.mockImplementation((path, opts) => {
      expect(path).toBe('ktc/snapshot-2026-09-01.json')
      expect(opts.allowInProgress).toBe(true)
      return Promise.resolve(SNAPSHOT_ROWS)
    })

    const { getKTCValues } = await import('./ktc.js')
    const result = await getKTCValues()

    expect(result).toEqual(SNAPSHOT_ROWS)
    expect(tryDataStore).toHaveBeenCalledTimes(1)
  })

  it('missing store (not ready) — resolves null with exactly one "no player data" warning', async () => {
    vi.stubEnv('DEV', false)
    const { isDataStoreReady } = await import('./dataStore')
    isDataStoreReady.mockResolvedValue(false)
    const warnSpy = vi.spyOn(console, 'warn')

    const { getKTCValues } = await import('./ktc.js')
    const result = await getKTCValues()

    expect(result).toBeNull()
    const noDataWarnings = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('No player data obtained'))
    )
    expect(noDataWarnings.length).toBe(1)
  })

  it('missing store (manifest unavailable after isDataStoreReady) — resolves null, does not throw', async () => {
    vi.stubEnv('DEV', false)
    const { getCache } = await import('../utils/cache')
    const { isDataStoreReady } = await import('./dataStore')
    isDataStoreReady.mockResolvedValue(true)
    getCache.mockResolvedValue(null) // both 'data-store/manifest' and 'ktc-values' miss

    const { getKTCValues } = await import('./ktc.js')
    await expect(getKTCValues()).resolves.toBeNull()
  })

  it('DEV mode: a working dev-proxy scrape is used as the fresher override, store is never read', async () => {
    vi.stubEnv('DEV', true)
    fetchSpy.mockResolvedValue({ ok: true, text: () => Promise.resolve(ONE_PLAYER_HTML) })
    const { isDataStoreReady } = await import('./dataStore')

    const { getKTCValues } = await import('./ktc.js')
    const result = await getKTCValues()

    expect(result).not.toBeNull()
    expect(result[0].name).toBe("Ja'Marr Chase")
    expect(isDataStoreReady).not.toHaveBeenCalled()
  })

  it('DEV mode: a failed dev-proxy scrape falls through to the data store', async () => {
    vi.stubEnv('DEV', true)
    fetchSpy.mockRejectedValue(new Error('dev proxy not running'))
    const { getCache } = await import('../utils/cache')
    const { isDataStoreReady, tryDataStore } = await import('./dataStore')
    isDataStoreReady.mockResolvedValue(true)
    getCache.mockImplementation((key) => {
      if (key === 'data-store/manifest') {
        return Promise.resolve({ files: { 'ktc/snapshot-2026-09-01.json': { inProgress: true } } })
      }
      return Promise.resolve(null)
    })
    tryDataStore.mockResolvedValue(SNAPSHOT_ROWS)

    const { getKTCValues } = await import('./ktc.js')
    const result = await getKTCValues()

    expect(result).toEqual(SNAPSHOT_ROWS)
  })
})
