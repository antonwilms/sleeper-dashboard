import { describe, it, expect } from 'vitest'
import { classifyKey } from './exportData'
import { CFBD_CACHE_NAMESPACE } from '../api/cfbd'

// ---------------------------------------------------------------------------
// classifyKey — cache key → ZIP path routing.
//
// This branch had no coverage until the cfbd namespace bump (cfbd-players →
// cfbd-players-v2) silently desynced the college route: the regex still matched the
// old literal, so every college entry fell through to the raw/ catch-all and the
// export stopped producing college/<category>/<year>.json at all. Nothing failed —
// the catch-all always returns a path, so there is no error and no empty ZIP to
// notice. These tests pin every route, and the college one is derived from the same
// constant the loader writes under so the two cannot drift again.
// ---------------------------------------------------------------------------

describe('classifyKey', () => {
  it('routes a college entry under the live namespace to college/<category>/<year>.json', () => {
    const key = `${CFBD_CACHE_NAMESPACE}/2024/receiving`
    expect(classifyKey(key)).toEqual({ zipPath: 'college/receiving/2024.json' })
  })

  it('routes the college entry the CFBD loader actually writes', () => {
    // Guards the desync directly: builds the key the way getBulkPlayerStats does,
    // so a future namespace bump that misses exportData.js fails here rather than
    // silently rerouting the whole family.
    for (const category of ['receiving', 'rushing', 'passing']) {
      const key = `${CFBD_CACHE_NAMESPACE}/2025/${category}`
      expect(classifyKey(key)).toEqual({ zipPath: `college/${category}/2025.json` })
    }
  })

  it('does NOT route a superseded college namespace to college/ — those entries are lapsed', () => {
    // cfbd-players/* entries are the pre-idempotency ones that could hold a
    // double-normalized null. The bump exists to retire them, so they must not be
    // exported as if they were good college data.
    const result = classifyKey('cfbd-players/2024/receiving')
    expect(result.zipPath).not.toMatch(/^college\//)
    expect(result.zipPath).toBe('raw/cfbd-players-2024-receiving.json')
  })

  it('routes season totals, KTC values and projection snapshots', () => {
    expect(classifyKey('season-totals/2025')).toEqual({ zipPath: 'nfl/season-totals/2025.json' })
    expect(classifyKey('projection-snapshots/2026-09-05')).toEqual({ zipPath: 'snapshots/2026-09-05.json' })
    expect(classifyKey('ktc-values').zipPath).toMatch(/^ktc\/snapshot-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('falls through to raw/ with slashes flattened for anything unrecognised', () => {
    expect(classifyKey('nfl-draft/2026')).toEqual({ zipPath: 'raw/nfl-draft-2026.json' })
    expect(classifyKey('ktc-history/2026-09-05')).toEqual({ zipPath: 'raw/ktc-history-2026-09-05.json' })
  })

  it('does not match a malformed college key', () => {
    // Non-numeric year and a trailing segment must not reach the college route.
    expect(classifyKey(`${CFBD_CACHE_NAMESPACE}/notayear/receiving`).zipPath).toMatch(/^raw\//)
    expect(classifyKey(`${CFBD_CACHE_NAMESPACE}/2024/receiving/extra`).zipPath).toMatch(/^raw\//)
  })
})
