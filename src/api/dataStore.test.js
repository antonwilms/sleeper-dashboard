import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// cache is mocked globally — dataStore imports it at module-init time
vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

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
