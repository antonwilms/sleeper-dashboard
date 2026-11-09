import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('./dataStore', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, getManifestEntry: vi.fn(), tryDataStore: vi.fn(), wasServedStale: vi.fn(() => false) }
})
vi.mock('../utils/cache', () => ({
  getCacheRecord: vi.fn(),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

import { loadNflOline, OLINE_EMPTY } from './nflOline'
import { getManifestEntry, tryDataStore } from './dataStore'
import { getCacheRecord, setCacheWithMeta } from '../utils/cache'

const ENTRY = { lastModified: '2026-11-07', schemaVersion: 1, inProgress: false }
const st = (dt) => ({ week: 'w', date: dt.slice(0, 10), dt, ol: [{ slot: 'LT', rank: 1, name: 'A B', gsisId: null, espnId: null }] })
const BODY = {
  schemaVersion: 1, season: 2026, generatedAt: 'g',
  teams: { KC: { states: [st('2026-10-31T07:00:00Z'), st('2026-11-07T07:00:00Z'), st('2026-11-03T07:00:00Z')] } },
}

beforeEach(() => { vi.clearAllMocks() })

describe('loadNflOline', () => {
  it('12: absent manifest entry → OLINE_EMPTY (complete false)', async () => {
    getManifestEntry.mockResolvedValue(null)
    const r = await loadNflOline(2026)
    expect(r).toEqual({ ...OLINE_EMPTY })
    expect(r.complete).toBe(false)
  })
  it('12: tryDataStore null → complete false; cache miss (null record) does not throw', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(null)
    expect((await loadNflOline(2026)).complete).toBe(false)
  })
  it('12: valid body → complete, latest-by-dt state, caches latestByTeam only', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue(null)
    tryDataStore.mockResolvedValue(BODY)
    const r = await loadNflOline(2026)
    expect(r.complete).toBe(true)
    expect(r.year).toBe(2026)
    expect(r.latestByTeam.KC.date).toBe('2026-11-07')
    const [key, data] = setCacheWithMeta.mock.calls[0]
    expect(key).toBe('nfl-oline/2026')
    expect(data.latestByTeam.KC.date).toBe('2026-11-07')
    expect(JSON.stringify(data)).not.toContain('states')
  })
  it('serves from cache when lastModified matches', async () => {
    getManifestEntry.mockResolvedValue(ENTRY)
    getCacheRecord.mockResolvedValue({ data: { latestByTeam: { KC: { date: 'c' } }, generatedAt: 'g', lastModified: ENTRY.lastModified } })
    const r = await loadNflOline(2026)
    expect(tryDataStore).not.toHaveBeenCalled()
    expect(r.latestByTeam.KC.date).toBe('c')
  })
})
