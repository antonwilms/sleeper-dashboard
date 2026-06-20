/**
 * src/utils/cache.test.js
 *
 * Unit tests for the IndexedDB cache layer (cache.js).
 * idb is mocked with a functional in-memory Map so the logic in cache.js
 * (TTL arithmetic, cursor-walk prefix filtering, auto-delete on read) runs
 * in a Node environment without a browser or fake-indexeddb package.
 *
 * vitest hoists vi.mock above imports; variables used inside the factory MUST
 * be prefixed with 'mock' to escape the temporal dead zone.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// In-memory backing store — cleared between tests.
// 'mock' prefix is required for vitest's mock-hoisting closure rules.
// ---------------------------------------------------------------------------
const mockStore = new Map()

vi.mock('idb', () => ({
  openDB: () => Promise.resolve({
    get:    (_, key)    => Promise.resolve(mockStore.get(key) ?? undefined),
    put:    (_, record) => { mockStore.set(record.key, record); return Promise.resolve() },
    delete: (_, key)    => { mockStore.delete(key);             return Promise.resolve() },
    clear:  ()          => { mockStore.clear();                 return Promise.resolve() },
    transaction: () => ({
      store: {
        openCursor: async () => {
          // Snapshot at cursor-open time; deletes during walk don't affect iteration
          const snap = [...mockStore.values()].sort((a, b) =>
            String(a.key) < String(b.key) ? -1 : 1
          )
          let i = 0
          const next = async () => {
            if (i >= snap.length) return null
            const rec = snap[i++]
            return {
              key:      rec.key,
              value:    rec,
              delete:   async () => mockStore.delete(rec.key),
              continue: next,
            }
          }
          return next()
        },
      },
      done: Promise.resolve(),
    }),
  }),
}))

import {
  getCache, getCacheRecord, setCache,
  clearCache, listCacheRecords,
} from './cache.js'

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

const T0 = new Date('2026-01-01T00:00:00.000Z')

beforeEach(() => {
  mockStore.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

// ---------------------------------------------------------------------------
// TTL expiry with auto-delete on read
// ---------------------------------------------------------------------------

describe('getCache / getCacheRecord TTL expiry and auto-delete', () => {
  it('getCache returns data before TTL expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)

    await setCache('foo', { x: 1 }, 60)
    vi.advanceTimersByTime(59 * 60 * 1000) // 59 min — still live

    expect(await getCache('foo')).toEqual({ x: 1 })
  })

  it('getCache returns null after TTL expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)

    await setCache('foo', { x: 1 }, 60)
    vi.advanceTimersByTime(61 * 60 * 1000) // 61 min — past 60-min TTL

    expect(await getCache('foo')).toBeNull()
  })

  it('getCacheRecord returns null after TTL expires', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)

    await setCache('bar', { y: 2 }, 10)
    vi.advanceTimersByTime(11 * 60 * 1000) // 11 min — past 10-min TTL

    expect(await getCacheRecord('bar')).toBeNull()
  })

  it('expired record is deleted from the backing store on read', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)

    await setCache('del-me',   { v: 99 }, 5)
    await setCache('survivor', { v: 1  }, 999)

    vi.advanceTimersByTime(6 * 60 * 1000) // past 5-min TTL

    await getCache('del-me') // triggers auto-delete

    expect(mockStore.has('del-me')).toBe(false)
    expect(mockStore.has('survivor')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// clearCache prefix isolation
// ---------------------------------------------------------------------------

describe('clearCache prefix isolation', () => {
  it('removes only keys that start with the given prefix', async () => {
    await setCache('a/1', 'aone', 60)
    await setCache('a/2', 'atwo', 60)
    await setCache('b/1', 'bone', 60)

    await clearCache('a/')

    expect(await getCache('a/1')).toBeNull()
    expect(await getCache('a/2')).toBeNull()
    expect(await getCache('b/1')).toBe('bone')
  })

  it('keys under an unrelated prefix survive a targeted clear', async () => {
    await setCache('projection-snapshots/2026-01-01', { s: 1 }, 60)
    await setCache('players-all',                     { p: 1 }, 60)

    await clearCache('projection-snapshots/')

    expect(await getCache('projection-snapshots/2026-01-01')).toBeNull()
    expect(await getCache('players-all')).toEqual({ p: 1 })
  })
})

// ---------------------------------------------------------------------------
// listCacheRecords live-only filter
// ---------------------------------------------------------------------------

describe('listCacheRecords live-only filter', () => {
  it('excludes expired records from results', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)

    await setCache('snap/live', { v: 1 }, 60)
    await setCache('snap/dead', { v: 2 }, 1)

    vi.advanceTimersByTime(2 * 60 * 1000) // snap/dead now expired

    const results = await listCacheRecords('snap/')
    const keys = results.map(r => r.key)

    expect(keys).toContain('snap/live')
    expect(keys).not.toContain('snap/dead')
  })

  it('returns only records whose key matches the prefix', async () => {
    await setCache('alpha/1', 'a', 60)
    await setCache('beta/1',  'b', 60)

    const results = await listCacheRecords('alpha/')

    expect(results).toHaveLength(1)
    expect(results[0].key).toBe('alpha/1')
    expect(results[0].data).toBe('a')
  })
})

// ---------------------------------------------------------------------------
// setCache default-TTL branch
// ---------------------------------------------------------------------------

describe('setCache default TTL branch', () => {
  it('applies PLAYERS_TTL (1440 min) when key contains "players"', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)

    await setCache('players-all', { p: 1 }) // no explicit ttlMinutes

    vi.advanceTimersByTime(1439 * 60 * 1000) // 1 min before PLAYERS_TTL
    expect(await getCache('players-all')).toEqual({ p: 1 })

    // expiresAt check is strict (>), so advance 1 ms past the 1440-min boundary
    vi.advanceTimersByTime(1 * 60 * 1000 + 1)
    expect(await getCache('players-all')).toBeNull()
  })

  it('applies DEFAULT_TTL (60 min) when key does not contain "players"', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)

    await setCache('career-stats', { c: 1 }) // no explicit ttlMinutes

    vi.advanceTimersByTime(59 * 60 * 1000) // 1 min before DEFAULT_TTL
    expect(await getCache('career-stats')).toEqual({ c: 1 })

    // expiresAt check is strict (>), so advance 1 ms past the 60-min boundary
    vi.advanceTimersByTime(1 * 60 * 1000 + 1)
    expect(await getCache('career-stats')).toBeNull()
  })
})
