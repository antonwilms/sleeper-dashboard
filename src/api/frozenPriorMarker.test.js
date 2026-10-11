// D-50: the 'model-by-marker' path end to end. loadFrozenPrior takes MODEL_MARKER_FROM from the module, so
// this file pins it early (before the 2026-09-08 capture) to make that candidate fetchable.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/inSeasonConstants', async (orig) => ({ ...(await orig()), MODEL_MARKER_FROM: '2026-09-01' }))
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

import { getCache } from '../utils/cache'
import { isDataStoreReady, listManifestPaths, tryDataStore } from './dataStore'
import { loadFrozenPrior } from './frozenPrior'
import { PRIOR_MODEL_FROM } from '../utils/inSeasonConstants'

const args = { liveSeason: 2026, kickoffDate: '2026-09-09', leagueId: 'L1', projectionBasis: 'league' }
const raw = (marker) => {
  const r = {
    capturedAt: '2026-09-08T16:29:00Z', leagueId: 'L1', targetSeason: 2026, projectionBasis: 'league',
    players: { a: { projection: { projectedPPG: 12.3, factors: {} } } },
  }
  if (marker !== undefined) r.projectionModelFrom = marker
  return r
}

beforeEach(() => {
  vi.clearAllMocks()
  isDataStoreReady.mockResolvedValue(true)
  listManifestPaths.mockResolvedValue(['snapshots/2026-09-08.json'])
  getCache.mockResolvedValue(null)
})

describe('loadFrozenPrior — model-by-marker (candidate dated before PRIOR_MODEL_FROM, on/after MODEL_MARKER_FROM)', () => {
  it('marker equal to PRIOR_MODEL_FROM → ok after one fetch', async () => {
    tryDataStore.mockResolvedValue(raw(PRIOR_MODEL_FROM))
    const r = await loadFrozenPrior(args)
    expect(r.status).toBe('ok')
    expect(r.dateKey).toBe('2026-09-08')
    expect(tryDataStore).toHaveBeenCalledTimes(1)
  })
  it('no marker → refused model-changed after one fetch (date rule)', async () => {
    tryDataStore.mockResolvedValue(raw())
    expect(await loadFrozenPrior(args)).toEqual({ status: 'refused', reason: 'model-changed', dateKey: '2026-09-08' })
    expect(tryDataStore).toHaveBeenCalledTimes(1)
  })
  it('a different marker → refused model-changed after one fetch', async () => {
    tryDataStore.mockResolvedValue(raw('2026-10-05'))
    expect(await loadFrozenPrior(args)).toEqual({ status: 'refused', reason: 'model-changed', dateKey: '2026-09-08' })
    expect(tryDataStore).toHaveBeenCalledTimes(1)
  })
})
