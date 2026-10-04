import { describe, it, expect, vi, afterEach } from 'vitest'

const { getWeeklyStatRows } = vi.hoisted(() => ({ getWeeklyStatRows: vi.fn() }))
vi.mock('./sleeperStats', () => ({ getWeeklyStatRows }))

import { qbWeeklyLoadPlan, filterQbInputRows, loadQbWeeklyRows } from './qbWeekly'

afterEach(() => { vi.clearAllMocks() })

describe('qbWeeklyLoadPlan — the live season only', () => {
  const plan = (nflState, dataSeason = 2025) => qbWeeklyLoadPlan({ dataSeason, nflState })
  it('preseason / offseason / the data season itself → null', () => {
    expect(plan({ season: '2026', season_type: 'pre', week: 1 })).toBeNull()
    expect(plan({ season: '2026', season_type: 'off', week: 0 })).toBeNull()
    expect(plan({ season: '2025', season_type: 'regular', week: 5 })).toBeNull()
    expect(plan({ season: '2026', season_type: 'regular', week: 5 }, null)).toBeNull()
    expect(plan(null)).toBeNull()
  })
  it('regular, week 1 → null (no completed week yet)', () => {
    expect(plan({ season: '2026', season_type: 'regular', week: 1 })).toBeNull()
  })
  it('regular, week 5 → weeks 1..4 (the completed ones), currentNflWeek 5', () => {
    expect(plan({ season: '2026', season_type: 'regular', week: 5 })).toEqual({ season: 2026, throughWeek: 4, currentNflWeek: 5 })
  })
  it('regular, week past the regular season → capped at 18 (2021+)', () => {
    expect(plan({ season: '2026', season_type: 'regular', week: 25 })).toEqual({ season: 2026, throughWeek: 18, currentNflWeek: 25 })
  })
  it('post → the whole regular season, currentNflWeek 0', () => {
    expect(plan({ season: '2026', season_type: 'post', week: 2 })).toEqual({ season: 2026, throughWeek: 18, currentNflWeek: 0 })
  })
})

describe('filterQbInputRows', () => {
  it('keeps TEAM_* rows and playerMap QB rows only; RB/WR/TE, unknown ids dropped; the row shape untouched', () => {
    const playerMap = { q: { position: 'QB' }, r: { position: 'RB' }, w: { position: 'WR' } }
    const row = { stats: { pass_att: 3 }, team: 'KC', opponent: 'DEN' }
    const out = filterQbInputRows({ TEAM_KC: {}, q: row, r: {}, w: {}, ghost: {} }, playerMap)
    expect(Object.keys(out).sort()).toEqual(['TEAM_KC', 'q'])
    expect(out.q).toBe(row)
  })
})

describe('loadQbWeeklyRows', () => {
  const playerMap = { q: { position: 'QB' }, r: { position: 'RB' } }
  it('requests exactly weeks 1..throughWeek, forwarding (season, week, currentNflWeek)', async () => {
    getWeeklyStatRows.mockResolvedValue({})
    await loadQbWeeklyRows({ season: 2026, throughWeek: 3, currentNflWeek: 4, playerMap })
    expect(getWeeklyStatRows.mock.calls).toEqual([[2026, 1, 4], [2026, 2, 4], [2026, 3, 4]])
  })
  it('a rejected week is reported in failedWeeks; the rest are kept, filtered, in ascending order', async () => {
    getWeeklyStatRows.mockImplementation((s, w) => (w === 2 ? Promise.reject(new Error('boom')) : Promise.resolve({ TEAM_KC: {}, q: {}, r: {} })))
    const r = await loadQbWeeklyRows({ season: 2026, throughWeek: 3, currentNflWeek: 4, playerMap })
    expect(r.failedWeeks).toEqual([2])
    expect(r.weeks.map(x => x.week)).toEqual([1, 3])
    expect(Object.keys(r.weeks[0].rows).sort()).toEqual(['TEAM_KC', 'q'])
    expect(r.year).toBe(2026)
    expect(r.complete).toBe(true)
  })
  it('every week rejecting → complete false, never throws', async () => {
    getWeeklyStatRows.mockRejectedValue(new Error('down'))
    const r = await loadQbWeeklyRows({ season: 2026, throughWeek: 2, currentNflWeek: 3, playerMap })
    expect(r).toMatchObject({ complete: false, weeks: [], failedWeeks: [1, 2] })
  })
})
