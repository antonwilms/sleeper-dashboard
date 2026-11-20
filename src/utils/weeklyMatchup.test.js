import { describe, it, expect } from 'vitest'
import { pairMatchup, sumStarterProjection, sumRows, buildMatchupHeader } from './weeklyMatchup'
import { projectedPoints, buildWeeklyLineup } from './weeklyLineup'
import { calculateFantasyPoints } from './fantasyPoints'
import { alignStarterSlots } from './rosterSlots'

const S = { rec: 0.5, rec_yd: 0.1, rush_yd: 0.1 }
const stat = n => ({ stats: { rush_yd: n } }) // n yards → n/10 points

describe('pairMatchup', () => {
  const rows = [
    { roster_id: 3, matchup_id: 2 }, { roster_id: 1, matchup_id: 1 },
    { roster_id: 4, matchup_id: 2 }, { roster_id: 2, matchup_id: 1 },
  ]
  it('T1 picks the other roster in my matchup_id, in any order', () => {
    expect(rows[1].roster_id).not.toBe(4)
    expect(rows[1].roster_id).not.toBe(3)
    expect(pairMatchup(rows, 3).opponent.roster_id).toBe(4)
    expect(pairMatchup([...rows].reverse(), 3).opponent.roster_id).toBe(4)
    expect(pairMatchup(rows, 3).reason).toBeNull()
  })
  it('T2 no pair → no opponent, reason stated; a null never pairs a null', () => {
    const a = [{ roster_id: 3, matchup_id: null }, { roster_id: 5, matchup_id: null }, { roster_id: 1, matchup_id: 1 }, { roster_id: 2, matchup_id: 1 }]
    expect(a.filter(r => r.matchup_id === null).length).toBe(2)
    expect(pairMatchup(a, 3)).toMatchObject({ opponent: null, reason: 'no-matchup' })
    expect(pairMatchup(rows, 99)).toMatchObject({ opponent: null, reason: 'no-matchup' })
    const c = [{ roster_id: 3, matchup_id: 1 }, { roster_id: 4, matchup_id: 1 }, { roster_id: 5, matchup_id: 1 }]
    expect(pairMatchup(c, 3)).toMatchObject({ opponent: null, reason: 'unpaired' })
  })
})

describe('sumStarterProjection', () => {
  it('T3 sums the opponent starters only — not players, not the "0" sentinel', () => {
    const projections = { a: stat(100), b: stat(50), c: stat(300), 0: stat(700) }
    expect(projectedPoints(projections.c.stats, S)).toBeGreaterThan(0)
    expect(projectedPoints(projections['0'].stats, S)).toBeGreaterThan(0)
    const row = { starters: ['a', '0', 'b', null], players: ['a', 'b', 'c'] }
    const r = sumStarterProjection(row.starters, projections, S)
    expect(r.valued).toBe(2)
    expect(r.slots).toBe(4)
    expect(r.total).toBeCloseTo(15)
  })
  it('T3b uses the lineup scoring path: an ADP-only row is not valued', () => {
    const adp = { stats: { adp_dd_ppr: 40 } }
    expect(calculateFantasyPoints(adp.stats, S)).toBe(0)
    const projections = { a: stat(100), b: stat(50), adp }
    const mine = ['a', 'b', 'adp']
    const sum = sumStarterProjection(mine, projections, S)
    expect(sum.valued).toBe(2)
    const enrichedP = id => ({ id, full_name: id, position: 'RB', team: null })
    const lineup = buildWeeklyLineup({
      myTeam: { starterSlots: alignStarterSlots(mine), starters: mine.map(enrichedP), bench: [], taxi: [] },
      rosterPositions: ['RB', 'RB', 'RB'], currentWeek: 2, scheduleIndex: null,
      projections, scoringSettings: S, usageByPlayer: {}, fpaTable: {}, fpaRanks: {}, playerMap: {},
    })
    const finiteSum = lineup.starters.map(r => r.points).filter(Number.isFinite).reduce((x, y) => x + y, 0)
    expect(sum.total).toBeCloseTo(finiteSum)
  })
})

describe('sumRows', () => {
  it('empty rows count in slots only; null when nothing valued', () => {
    expect(sumRows([{ v: 1 }, { v: null }, {}], r => r.v)).toEqual({ total: 1, valued: 1, slots: 3 })
    expect(sumRows([{ v: null }], r => r.v)).toEqual({ total: null, valued: 0, slots: 1 })
  })
})

describe('buildMatchupHeader', () => {
  const mk = (n, pts = 1) => Array.from({ length: n }, (_, i) => ({ player_id: `m${i}`, points: pts }))
  const rosterTeams = [{ rosterId: 3, teamName: 'Me' }, { rosterId: 4, teamName: 'Them' }]
  const standings = [{ rosterId: 3, wins: 7, losses: 4, ties: 0 }, { rosterId: 4, wins: 5, losses: 6, ties: 0 }]
  const oppIds = Array.from({ length: 10 }, (_, i) => `o${i}`)
  const projections = Object.fromEntries(oppIds.map(id => [id, stat(100)]))
  const base = { myRosterId: 3, rosterTeams, standings, ownByPlayer: {}, projections, scoringSettings: S, week: 9 }
  const loaded = pts => ({ status: 'loaded', rows: [
    { roster_id: 3, matchup_id: 1, points: pts[0], starters: [] },
    { roster_id: 4, matchup_id: 1, points: pts[1], starters: oppIds },
  ] })

  it('T4 states, never fabricates', () => {
    const starters = mk(10)
    expect(buildMatchupHeader({ ...base, starters, matchups: { status: 'idle', rows: [] } })).toMatchObject({ reason: 'no-league', opponent: null })
    expect(buildMatchupHeader({ ...base, starters, matchups: { status: 'failed', rows: [] } })).toMatchObject({ reason: 'fetch-failed', opponent: null })
    expect(buildMatchupHeader({ ...base, starters, matchups: { status: 'loading', rows: [] } }).status).toBe('loading')

    const h = buildMatchupHeader({ ...base, starters, matchups: loaded([0, 0]) })
    expect(h.mine.teamName).toBe('Me')
    expect(h.opponent.teamName).toBe('Them')
    expect(h.opponent.record).toEqual({ wins: 5, losses: 6, ties: 0 })
    expect(h.mine.record).toEqual({ wins: 7, losses: 4, ties: 0 })
    expect(h.live).toBe(false)
    expect(buildMatchupHeader({ ...base, starters, matchups: loaded([0, 54.3]) }).live).toBe(true)
    // complete: margin is the difference of the two totals
    expect(h.projMargin).toBeCloseTo(h.mine.proj.total - h.opponent.proj.total)

    // incomplete: 9 of 10 projected (one empty slot)
    const inc = [...mk(9), { player_id: null, points: null }]
    const hi = buildMatchupHeader({ ...base, starters: inc, matchups: loaded([0, 0]) })
    expect(Number.isFinite(hi.mine.proj.total)).toBe(true)
    expect(Number.isFinite(hi.opponent.proj.total)).toBe(true)
    expect(hi.mine.proj.valued).toBeLessThan(hi.mine.proj.slots)
    expect(hi.opponent.proj.valued).toBe(hi.opponent.proj.slots)
    expect(hi.projMargin).toBeNull()
  })
})
