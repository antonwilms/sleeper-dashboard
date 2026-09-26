import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))
vi.mock('./dataStore', () => ({
  isDataStoreReady: vi.fn(),
  listManifestPaths: vi.fn(),
  tryDataStore: vi.fn(),
  isValidProjectionSnapshot: vi.fn(() => true),
}))

import { getCache, setCache } from '../utils/cache'
import { isDataStoreReady, listManifestPaths, tryDataStore } from './dataStore'
import { loadFrozenPrior, FROZEN_PRIOR_TIMEOUT_MS } from './frozenPrior'
import { PRIOR_MODEL_FROM } from '../utils/inSeasonConstants'

// A post-epoch capture date so the gates get past the model check.
const CAPTURE = '2027-09-01'
const args = { liveSeason: 2027, kickoffDate: '2027-09-09', leagueId: 'L1', projectionBasis: 'league' }
const raw = (over = {}) => ({
  capturedAt: CAPTURE + 'T10:00:00Z', leagueId: 'L1', targetSeason: 2027, projectionBasis: 'league',
  players: { a: { projection: { projectedPPG: 12.3, factors: { x: 1 } } } },
  teamDepthCharts: { KC: {} }, inputStatus: {}, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  isDataStoreReady.mockResolvedValue(true)
  listManifestPaths.mockResolvedValue([`snapshots/${CAPTURE}.json`])
  getCache.mockResolvedValue(null)
})
afterEach(() => { vi.useRealTimers() })

describe('loadFrozenPrior', () => {
  it('model-epoch path: refused before any fetch', async () => {
    listManifestPaths.mockResolvedValue(['snapshots/2026-09-08.json'])
    expect(PRIOR_MODEL_FROM > '2026-09-08').toBe(true)
    const r = await loadFrozenPrior({ ...args, kickoffDate: '2026-09-09', liveSeason: 2026 })
    expect(r).toEqual({ status: 'refused', reason: 'model-changed', dateKey: '2026-09-08' })
    expect(tryDataStore).not.toHaveBeenCalled()
    expect(getCache).not.toHaveBeenCalled()
  })

  it('no snapshot / no kickoff → none, no fetch', async () => {
    listManifestPaths.mockResolvedValue([])
    expect(await loadFrozenPrior(args)).toEqual({ status: 'none', reason: 'no-snapshot' })
    expect(await loadFrozenPrior({ ...args, kickoffDate: null })).toEqual({ status: 'none', reason: 'no-kickoff' })
    expect(tryDataStore).not.toHaveBeenCalled()
  })

  it('cache hit: no fetch, no re-cache', async () => {
    getCache.mockResolvedValue({ env: { leagueId: 'L1', targetSeason: 2027, projectionBasis: 'league', capturedAt: 'c' }, players: { a: 12.3 } })
    const r = await loadFrozenPrior(args)
    expect(r).toEqual({ status: 'ok', dateKey: CAPTURE, players: { a: 12.3 } })
    expect(getCache).toHaveBeenCalledWith(`frozen-prior/${CAPTURE}`)
    expect(tryDataStore).not.toHaveBeenCalled()
    expect(setCache).not.toHaveBeenCalled()
  })

  it('miss: one fetch, then setCache once with the trimmed payload only', async () => {
    tryDataStore.mockResolvedValue(raw())
    const r = await loadFrozenPrior(args)
    expect(r).toEqual({ status: 'ok', dateKey: CAPTURE, players: { a: 12.3 } })
    expect(tryDataStore).toHaveBeenCalledTimes(1)
    expect(tryDataStore.mock.calls[0][0]).toBe(`snapshots/${CAPTURE}.json`)
    expect(setCache).toHaveBeenCalledTimes(1)
    const [key, value, ttl] = setCache.mock.calls[0]
    expect(key).toBe(`frozen-prior/${CAPTURE}`)
    expect(ttl).toBe(999999)
    expect(value).not.toHaveProperty('teamDepthCharts')
    expect(value).not.toHaveProperty('inputStatus')
    expect(value.players).toEqual({ a: 12.3 })
  })

  it("league mismatch → refused 'league'", async () => {
    tryDataStore.mockResolvedValue(raw({ leagueId: 'OTHER' }))
    expect(await loadFrozenPrior(args)).toEqual({ status: 'refused', reason: 'league', dateKey: CAPTURE })
  })

  it("an absent projectionBasis → refused 'basis'", async () => {
    const noBasis = raw()
    delete noBasis.projectionBasis
    tryDataStore.mockResolvedValue(noBasis)
    expect(await loadFrozenPrior(args)).toEqual({ status: 'refused', reason: 'basis', dateKey: CAPTURE })
  })

  it('tryDataStore null → unavailable', async () => {
    tryDataStore.mockResolvedValue(null)
    expect(await loadFrozenPrior(args)).toEqual({ status: 'unavailable', reason: 'unavailable', dateKey: CAPTURE })
  })

  it('a thrown error resolves to unavailable and does not reject', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    tryDataStore.mockRejectedValue(new Error('boom'))
    await expect(loadFrozenPrior(args)).resolves.toEqual({ status: 'unavailable', reason: 'unavailable' })
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('a store that is not ready → unavailable', async () => {
    isDataStoreReady.mockResolvedValue(false)
    expect(await loadFrozenPrior(args)).toEqual({ status: 'unavailable', reason: 'unavailable' })
    expect(listManifestPaths).not.toHaveBeenCalled()
  })

  it('a stalled body read is bounded: resolves unavailable/timeout after FROZEN_PRIOR_TIMEOUT_MS', async () => {
    vi.useFakeTimers()
    tryDataStore.mockReturnValue(new Promise(() => {}))
    const p = loadFrozenPrior(args)
    await vi.advanceTimersByTimeAsync(FROZEN_PRIOR_TIMEOUT_MS + 1)
    await expect(p).resolves.toEqual({ status: 'unavailable', reason: 'timeout' })
  })
})
