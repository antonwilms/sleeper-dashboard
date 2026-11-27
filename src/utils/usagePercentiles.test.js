import { describe, it, expect } from 'vitest'
import { buildTeamAggregates } from './weeklyUsage'
import { buildStarterPool, LEGEND_POSITIONS } from './starterPercentiles'
import {
  leagueStarterIds, buildUsagePool, usagePercentiles,
  USAGE_POOL_MIN_PLAYERS, USAGE_SHARE_KINDS,
} from './usagePercentiles'

const wk = (week, rows) => ({ week, rows, teamAggregates: buildTeamAggregates(rows) })
const player = (stats, gp = 1) => ({ team: 'KC', stats: { gp, ...stats } })
const team = rushAtt => ({ team: null, stats: { rush_att: rushAtt, pass_att: 30 } })

describe('leagueStarterIds', () => {
  const maps = [wk(1, {
    started: player({}), dnpStart: player({}, 0), benched: player({}), kicker: player({}),
    TEAM_KC: team(20),
  })]
  const playerMap = {
    started: { position: 'RB' }, dnpStart: { position: 'RB' }, benched: { position: 'RB' },
    kicker: { position: 'K' }, current: { position: 'RB' },
  }

  it('P1 members are started in a played week they played, at a legend position', () => {
    const starterWeeks = [
      { week: 1, ids: ['started', 'dnpStart', 'kicker'] },
      { week: 2, ids: ['current'] }, // week 2 is not among the played maps (the in-progress week)
    ]
    const out = leagueStarterIds({ starterWeeks, playedWeeklyMaps: maps, playerMap })
    expect(out).toEqual({ RB: ['started'] })
  })
})

describe('buildUsagePool', () => {
  const playerMap = { m: { position: 'RB' } }
  const carries = [[2, 40], [18, 20], [10, 40]]
  const maps = carries.map(([mine, theirs], i) => wk(i + 1, { m: player({ rush_att: mine }), TEAM_KC: team(theirs) }))
  const starterWeeks = [{ week: 1, ids: ['m'] }]

  it('P2 a pool value is the season share over all played weeks, summed then divided', () => {
    const pool = buildUsagePool({ starterWeeks, playedWeeklyMaps: maps, playerMap })
    expect(pool.RB.rush).toHaveLength(1)
    expect(pool.RB.rush[0]).toBeCloseTo(0.30)
    expect(pool.RB.rush.some(v => Math.abs(v - 0.40) < 0.01)).toBe(false)
    expect(pool.RB.rush.some(v => Math.abs(v - 0.05) < 0.01)).toBe(false)
  })

  it('P3 a member needs USAGE_POOL_MIN_WEEKS played weeks', () => {
    const two = buildUsagePool({ starterWeeks, playedWeeklyMaps: maps.slice(0, 2), playerMap })
    for (const kind of USAGE_SHARE_KINDS) expect(two.RB[kind], kind).toEqual([])
    const three = buildUsagePool({ starterWeeks, playedWeeklyMaps: maps, playerMap })
    expect(three.RB.rush).toHaveLength(1)
    expect(three.RB.touch).toHaveLength(1)
  })
})

describe('usagePercentiles', () => {
  const values = n => Array.from({ length: n }, (_, i) => (i + 1) / 100)

  it('P4 a pool below USAGE_POOL_MIN_PLAYERS stays neutral; at the minimum it colours', () => {
    expect(USAGE_POOL_MIN_PLAYERS).toBe(15)
    const short = usagePercentiles({ RB: { rush: values(14) } }, 'RB', { rush: 0.08 }, 5)
    expect(short.rush).toBeNull()
    const full = usagePercentiles({ RB: { rush: values(15) } }, 'RB', { rush: 0.08 }, 5)
    expect(typeof full.rush).toBe('number')
  })

  it('P5 a row under the week floor, or an inapplicable share, stays neutral', () => {
    const pool = { WR: { target: values(15), rush: values(15) } }
    expect(usagePercentiles(pool, 'WR', { target: 0.08 }, 2).target).toBeNull()
    expect(usagePercentiles(pool, 'WR', { target: 0.08, rush: null }, 3).rush).toBeNull()
    expect(typeof usagePercentiles(pool, 'WR', { target: 0.08 }, 3).target).toBe('number')
  })

  it('P6 ranks against the row\'s own position and kind', () => {
    const pool = {
      WR: { target: values(15) },
      RB: { target: values(15).map(v => v + 0.49) },
    }
    expect(usagePercentiles(pool, 'WR', { target: 0.08 }, 3).target).toBeCloseTo(0.5)
  })

  it('P7 degraded inputs give empty pools and neutral cells without throwing', () => {
    expect(buildUsagePool({})).toEqual({})
    expect(buildUsagePool({ starterWeeks: null, playedWeeklyMaps: [] })).toEqual({})
    const out = usagePercentiles({}, 'RB', null, 0)
    expect(Object.keys(out)).toEqual(USAGE_SHARE_KINDS)
    expect(Object.values(out).every(v => v === null)).toBe(true)
  })
})

// Copied definition: leagueStarterIds restates buildStarterPool's membership rule
// (original: src/utils/starterPercentiles.js, buildStarterPool).
describe('leagueStarterIds vs buildStarterPool membership', () => {
  it('P8 both select the same ids per legend position', () => {
    const candidates = {
      qbIn: { position: 'QB', gp: 1, started: true, rec: 1 },
      rbIn: { position: 'RB', gp: 1, started: true, rec: 2 },
      wrIn: { position: 'WR', gp: 1, started: true, rec: 3 },
      teIn: { position: 'TE', gp: 1, started: true, rec: 4 },
      rbDnp: { position: 'RB', gp: 0, started: true, rec: 5 },
      wrBench: { position: 'WR', gp: 1, started: false, rec: 6 },
      kIn: { position: 'K', gp: 1, started: true, rec: 7 },
      noPos: { position: undefined, gp: 1, started: true, rec: 8 },
    }
    const rows = {}
    const playerMap = {}
    for (const [id, c] of Object.entries(candidates)) {
      rows[id] = player({ rec: c.rec }, c.gp)
      playerMap[id] = { position: c.position }
    }
    const starterWeeks = [{ week: 1, ids: Object.keys(candidates).filter(id => candidates[id].started) }]
    const playedWeeklyMaps = [wk(1, rows)]
    const pointsPool = buildStarterPool({
      starterWeeks, weeklyResult: { complete: true, weeks: [{ week: 1, rows }] },
      playerMap, scoringSettings: { rec: 1 }, throughWeek: 1,
    })
    const idByPoints = Object.fromEntries(Object.entries(candidates).map(([id, c]) => [c.rec, id]))
    const ids = leagueStarterIds({ starterWeeks, playedWeeklyMaps, playerMap })
    for (const pos of LEGEND_POSITIONS) {
      const fromPool = new Set((pointsPool[pos] ?? []).map(p => idByPoints[p]))
      expect(fromPool.size, pos).toBeGreaterThan(0)
      expect(new Set(ids[pos]), pos).toEqual(fromPool)
    }
  })
})
