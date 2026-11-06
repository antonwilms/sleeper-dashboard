import { describe, it, expect } from 'vitest'
import {
  median, playedWeeks, buildWindowWeeks, weeklyMedians, weekValue, WEEKLY_KEYS, windowSeasonRows,
} from './marketWeekly'
import { MARKET_METRICS } from './marketMetrics'
import { buildWindowStats } from './marketWindowStats'

const freeze = o => {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o)
    Object.values(o).forEach(freeze)
  }
  return o
}
const PER_GAME = MARKET_METRICS.filter(m => m.kind === 'perGame')
const win = seasons => ({ id: 'w', kind: 'career', seasons, label: 'w' })
// 18 weekly slots: the given leading statuses, then 'X' (not a game).
const status = (...lead) => [...lead, ...Array(18 - lead.length).fill('X')]
const mk = (o = {}) => ({ gamesPlayed: 3, team: 'KC', scoringBasis: 'league', fantasyPoints: 0, ...o })
const weeksOf = (careerStats, pid = 'p', seasons = [2024], extra = {}) => {
  freeze(careerStats)
  const before = JSON.stringify(careerStats)
  const out = buildWindowWeeks({ window: win(seasons), careerStats, pids: [pid], ...extra }).get(pid)
  expect(JSON.stringify(careerStats)).toBe(before)
  return out
}

describe('median (W1)', () => {
  it('takes the middle of a sorted copy, averages the two middles, and never mutates', () => {
    expect(median([3, 1, 2])).toBe(2)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([7])).toBe(7)
    expect(median([])).toBeNull()
    const xs = [3, 1, 2]
    median(xs)
    expect(xs).toEqual([3, 1, 2])
  })
})

describe('played weeks (W2–W5)', () => {
  const base = () => mk({
    stats: { rec_yd: 150 },
    weeklyStatus: status('P', 'P', 'D', 'P', 'B'),
    weeklyStats: { 1: { rec_yd: 50 }, 3: { rec_yd: 999 }, 4: { rec_yd: 100 } },
    weeklyPoints: { 1: 8, 2: 1, 4: 15 },
  })

  it('W2: reads only P weeks, a missing played week is all-zero, a non-played week is never summed', () => {
    const r = base()
    expect(playedWeeks(r).map(x => x.w)).toEqual([1, 2, 4])
    expect(playedWeeks(r)[1].s).toEqual({})
    const e = weeksOf(freeze({ 2024: { p: r } }))
    expect(e.mismatched.size).toBe(0)
    expect(weeklyMedians(e, PER_GAME).recYdPerG).toBe(50)
  })

  it('W3: no weeklyStats is not covered (not zeros); a P-count / gamesPlayed mismatch nulls both', () => {
    const noStats = { ...base(), weeklyStats: undefined }
    const e = weeksOf({ 2024: { p: noStats } })
    expect(e.statsCovered).toBe(false)
    const med = weeklyMedians(e, PER_GAME)
    expect(med.recYdPerG).toBeNull()
    expect(med.fpPerG).toBe(8)
    const off = weeklyMedians(weeksOf({ 2024: { p: { ...base(), gamesPlayed: 4 } } }), PER_GAME)
    expect(off.recYdPerG).toBeNull()
    expect(off.fpPerG).toBeNull()
  })

  it('W4: FP is the league-basis weeklyPoints, never sourceWeeklyPoints', () => {
    const r = mk({
      stats: {}, weeklyStatus: status('P', 'P', 'P'), weeklyStats: {},
      weeklyPoints: { 1: 10, 2: 20, 3: 30 }, sourceWeeklyPoints: { 1: 5, 2: 8, 3: 12 }, scoringBasis: 'league',
    })
    expect(weeklyMedians(weeksOf({ 2024: { p: r } }), PER_GAME).fpPerG).toBe(20)
  })

  it('W5: a live season is read beside careerStats, never merged into it', () => {
    const rowOf = n => mk({
      gamesPlayed: n, stats: {}, weeklyStatus: status(...Array(n).fill('P')), weeklyStats: {},
      weeklyPoints: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, 1])),
    })
    const careerStats = freeze({ 2025: { p: rowOf(2) } })
    const currentSeasonTotals = freeze({ season: 2026, complete: true, players: { p: rowOf(3) } })
    const before = JSON.stringify(careerStats)
    const both = buildWindowWeeks({ window: win([2026, 2025]), careerStats, currentSeasonTotals, pids: ['p'] }).get('p')
    expect(both.weeks.map(x => x.y)).toEqual([2026, 2026, 2026, 2025, 2025])
    expect(JSON.stringify(careerStats)).toBe(before)
    expect(Object.keys(careerStats)).not.toContain('2026')
    const only = buildWindowWeeks({ window: win([2025]), careerStats, currentSeasonTotals, pids: ['p'] }).get('p')
    expect(only.weeks).toHaveLength(2)
    expect(windowSeasonRows(2026, careerStats, { ...currentSeasonTotals, complete: false })).toEqual({})
  })
})

describe('copied-definition equality (W6, W6b)', () => {
  // Originals: each perGame metric's `value`; usage.looksPerG (marketWindowStats.js); ws.fpPerG.
  const POS = { qb: 'QB', rb: 'RB', wr: 'WR' }
  const totalOf = (k) => 11 + 2 * WEEKLY_KEYS.indexOf(k) // pairwise distinct
  const splitOf = (T) => [T - 4, 3, 1]
  const mkRow = () => {
    const stats = {}, weeklyStats = { 1: {}, 2: {}, 3: {} }
    for (const k of WEEKLY_KEYS) {
      stats[k] = totalOf(k)
      splitOf(totalOf(k)).forEach((v, i) => { weeklyStats[i + 1][k] = v })
    }
    return mk({
      stats, fantasyPoints: 60, weeklyStatus: status('P', 'P', 'P'), weeklyStats,
      weeklyPoints: { 1: 30, 2: 20, 3: 10 },
    })
  }

  it('W6: the mean of weekValue equals each perGame metric.value for QB, RB and WR', () => {
    const careerStats = freeze({ 2024: { qb: mkRow(), rb: mkRow(), wr: mkRow() } })
    const playerMap = freeze({ qb: { position: 'QB' }, rb: { position: 'RB' }, wr: { position: 'WR' } })
    const window = win([2024])
    const stats = buildWindowStats({ window, careerStats, currentSeasonTotals: null, playerMap })
    const before = JSON.stringify(careerStats)
    const weeks = buildWindowWeeks({ window, careerStats, pids: Object.keys(POS) })
    let checked = 0
    for (const [pid, pos] of Object.entries(POS)) {
      const ws = stats.get(pid)
      const entry = weeks.get(pid)
      expect(entry.mismatched.size).toBe(0)
      for (const m of PER_GAME.filter(x => x.positions.includes(pos))) {
        const mean = entry.weeks.reduce((a, wk) => a + weekValue(m, wk), 0) / entry.weeks.length
        expect(mean, `${pid} ${m.id}`).toBeCloseTo(m.value(ws))
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(30)
    expect(JSON.stringify(careerStats)).toBe(before)
  })

  it('W6b: weeklyMedians sums every key of a list, via weekValue', () => {
    const r = mk({
      stats: { rush_yd: 70, rec_yd: 55 }, weeklyStatus: status('P', 'P', 'P'),
      weeklyStats: { 1: { rush_yd: 10, rec_yd: 50 }, 2: { rush_yd: 40, rec_yd: 0 }, 3: { rush_yd: 20, rec_yd: 5 } },
      weeklyPoints: { 1: 1, 2: 1, 3: 1 },
    })
    expect(weeklyMedians(weeksOf({ 2024: { p: r } }), PER_GAME).scrimYdPerG).toBe(40)
  })
})

describe('sum-check guard (W12)', () => {
  it('a key whose weeks do not sum to the season value nulls only the medians that read it', () => {
    const r = mk({
      stats: { rec_yd: 150, rec: 6 }, weeklyStatus: status('P', 'P', 'P'),
      weeklyStats: { 1: { rec_yd: 40, rec: 2 }, 2: { rec_yd: 30, rec: 2 }, 3: { rec_yd: 30, rec: 2 } },
      weeklyPoints: { 1: 1, 2: 1, 3: 1 },
    })
    const e = weeksOf({ 2024: { p: r } })
    expect([...e.mismatched]).toEqual(['rec_yd'])
    const med = weeklyMedians(e, PER_GAME)
    expect(med.recYdPerG).toBeNull()
    expect(med.recPerG).toBe(2)
  })
})
