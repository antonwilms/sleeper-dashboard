import { describe, it, expect, vi, afterEach } from 'vitest'

const { getWeeklyStatRows } = vi.hoisted(() => ({ getWeeklyStatRows: vi.fn() }))
vi.mock('./sleeperStats', () => ({ getWeeklyStatRows }))

import { filterDefenceInputRows, loadDefenceWeeklyRows } from './defenceWeekly'

afterEach(() => { vi.clearAllMocks() })

const playerMap = {
  qb1: { position: 'QB' }, rb1: { position: 'RB' }, wr1: { position: 'WR' }, te1: { position: 'TE' },
  k1: { position: 'K' },
}

describe('filterDefenceInputRows', () => {
  it('keeps TEAM_* rows and QB/RB/WR/TE player rows; drops K, DEF-style ids and ids absent from playerMap', () => {
    const rows = {
      TEAM_KC: { stats: {} }, qb1: {}, rb1: {}, wr1: {}, te1: {},
      k1: {}, DEN: {}, ghost: {},
    }
    expect(Object.keys(filterDefenceInputRows(rows, playerMap)).sort())
      .toEqual(['TEAM_KC', 'qb1', 'rb1', 'te1', 'wr1'])
  })

  it('keeps the row shape untouched', () => {
    const row = { stats: { pass_yd: 1 }, team: 'KC', opponent: 'DEN', gameId: 'g' }
    expect(filterDefenceInputRows({ qb1: row }, playerMap).qb1).toBe(row)
  })
})

describe('loadDefenceWeeklyRows', () => {
  it('requests exactly weeks 1..throughWeek, forwarding (season, week, currentNflWeek) verbatim', async () => {
    getWeeklyStatRows.mockResolvedValue({})
    await loadDefenceWeeklyRows({ season: 2026, throughWeek: 3, currentNflWeek: 4, playerMap })
    expect(getWeeklyStatRows.mock.calls).toEqual([[2026, 1, 4], [2026, 2, 4], [2026, 3, 4]])
  })

  it('a finished season forwards currentNflWeek 0', async () => {
    getWeeklyStatRows.mockResolvedValue({})
    await loadDefenceWeeklyRows({ season: 2025, throughWeek: 2, currentNflWeek: 0, playerMap })
    expect(getWeeklyStatRows.mock.calls.map(c => c[2])).toEqual([0, 0])
  })

  it('one rejected week -> failedWeeks [w], the rest present in ascending order, still complete', async () => {
    getWeeklyStatRows.mockImplementation((s, w) => (w === 2 ? Promise.reject(new Error('boom')) : Promise.resolve({ qb1: { w } })))
    const r = await loadDefenceWeeklyRows({ season: 2025, throughWeek: 3, currentNflWeek: 0, playerMap })
    expect(r.failedWeeks).toEqual([2])
    expect(r.weeks.map(x => x.week)).toEqual([1, 3])
    expect(r.complete).toBe(true)
    expect(r.year).toBe(2025)
  })

  it('every week rejecting -> complete false, no throw', async () => {
    getWeeklyStatRows.mockRejectedValue(new Error('down'))
    const r = await loadDefenceWeeklyRows({ season: 2025, throughWeek: 2, currentNflWeek: 0, playerMap })
    expect(r.complete).toBe(false)
    expect(r.weeks).toEqual([])
    expect(r.failedWeeks).toEqual([1, 2])
  })

  it('filters each week\'s rows through the playerMap', async () => {
    getWeeklyStatRows.mockResolvedValue({ TEAM_KC: {}, qb1: {}, k1: {} })
    const r = await loadDefenceWeeklyRows({ season: 2025, throughWeek: 1, currentNflWeek: 0, playerMap })
    expect(Object.keys(r.weeks[0].rows).sort()).toEqual(['TEAM_KC', 'qb1'])
  })
})
