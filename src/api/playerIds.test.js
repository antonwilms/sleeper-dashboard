/**
 * src/api/playerIds.test.js — loadPlayerIds (CR-31): one cached index record, lastModified freshness,
 * never throws. Mocks dataStore + cache, like nflDraft.test.js.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadPlayerIds } from './playerIds'
import { PLAYER_ID_INDEX_VERSION } from '../utils/playerIdCrosswalk'

vi.mock('./dataStore', () => ({
  getManifestEntry: vi.fn(),
  tryDataStore:     vi.fn(),
  isValidPlayerIds: vi.fn().mockReturnValue(true),
  wasServedStale:   vi.fn(() => false),
}))
vi.mock('../utils/cache', () => ({
  getCacheRecord:   vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

import { getManifestEntry, tryDataStore, wasServedStale } from './dataStore'
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

const ENTRY = { lastModified: 'lm-2', schemaVersion: 2, inProgress: false }
const cachedIndex = (over = {}) => ({ version: PLAYER_ID_INDEX_VERSION, generatedAt: 'g', bySleeper: { 1: { name: 'Cached' } }, ...over })
const RAW = {
  schemaVersion: 2, generatedAt: '2026-10-21T00:00:00.000Z',
  ids: { g1: { name: 'Fresh Name' } },
  bySleeper: { 1: { gsisId: 'g1', espnId: '5' } },
}

describe('loadPlayerIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    wasServedStale.mockReturnValue(false)
    getManifestEntry.mockResolvedValue(ENTRY)
  })

  it('returns the cached index without a fetch when the lastModified matches', async () => {
    getCacheRecord.mockResolvedValue({ data: { index: cachedIndex(), lastModified: 'lm-2' } })
    const idx = await loadPlayerIds()
    expect(idx.bySleeper[1].name).toBe('Cached')
    expect(tryDataStore).not.toHaveBeenCalled()
  })

  it('refetches and persists when the cached lastModified is stale', async () => {
    getCacheRecord.mockResolvedValue({ data: { index: cachedIndex(), lastModified: 'lm-1' } })
    tryDataStore.mockResolvedValue(RAW)
    const idx = await loadPlayerIds()
    expect(tryDataStore).toHaveBeenCalledOnce()
    expect(idx.bySleeper[1]).toMatchObject({ name: 'Fresh Name', espnId: '5' })
    const [key, value, ttl] = setCacheWithMeta.mock.calls[0]
    expect(key).toBe('nflverse/playerids')
    expect(value).toEqual({ index: idx, lastModified: 'lm-2' })
    expect(ttl).toBe(999999)
  })

  it('does not persist a body the data store served stale', async () => {
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(RAW)
    wasServedStale.mockReturnValue(true)
    const idx = await loadPlayerIds()
    expect(idx.bySleeper[1].name).toBe('Fresh Name')
    expect(setCacheWithMeta).not.toHaveBeenCalled()
  })

  it('store unavailable → the stale cached index if any, else null', async () => {
    tryDataStore.mockResolvedValue(null)
    getCacheRecord.mockResolvedValue({ data: { index: cachedIndex(), lastModified: 'lm-1' } })
    expect((await loadPlayerIds()).bySleeper[1].name).toBe('Cached')
    getCacheRecord.mockResolvedValue(null)
    expect(await loadPlayerIds()).toBeNull()
  })

  it('an invalid payload comes back from tryDataStore as null → null', async () => {
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)   // tryDataStore returns null when isValidPlayerIds fails
    expect(await loadPlayerIds()).toBeNull()
    expect(tryDataStore.mock.calls[0][1].validate).toBeTypeOf('function')
  })

  it('an index version mismatch refetches', async () => {
    getCacheRecord.mockResolvedValue({ data: { index: cachedIndex({ version: PLAYER_ID_INDEX_VERSION - 1 }), lastModified: 'lm-2' } })
    tryDataStore.mockResolvedValue(RAW)
    await loadPlayerIds()
    expect(tryDataStore).toHaveBeenCalledOnce()
  })

  it('no manifest entry → a cached index is served', async () => {
    getManifestEntry.mockResolvedValue(null)
    getCacheRecord.mockResolvedValue({ data: { index: cachedIndex(), lastModified: 'whatever' } })
    expect((await loadPlayerIds()).bySleeper[1].name).toBe('Cached')
    expect(tryDataStore).not.toHaveBeenCalled()
  })

  it('never throws — a cache failure resolves to null', async () => {
    getCacheRecord.mockRejectedValue(new Error('idb down'))
    expect(await loadPlayerIds()).toBeNull()
  })
})
