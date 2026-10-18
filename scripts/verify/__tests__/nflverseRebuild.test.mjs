import { describe, it, expect } from 'vitest'
import { rebuildPlayerSeasons, rebuildTeamTotals, teamWeeksPlayed, teamRedZoneTotals } from '../lib/nflverseRebuild.mjs'

const g = (week, team, extra = {}, seasonType = 'REG') => ({ week, seasonType, team, carries: 0, targets: 0, receptions: 0, targetShare: 99, racr: 99, wopr: 99, ...extra })
const logs = {
  players: {
    a: { games: [g(1, 'LV', { carries: 10 }), g(2, 'LV', { carries: 5 }), g(19, 'LV', { carries: 100 }, 'POST')] },
    t: { games: [g(1, 'NYJ', { targets: 3, receptions: 2 }), g(2, 'MIA', { targets: 4, receptions: 4 })] },
  },
}

describe('rebuildPlayerSeasons', () => {
  it('excludes POST games', () => {
    const r = rebuildPlayerSeasons(logs, 2024)
    expect(r.a.games).toBe(2)
    expect(r.a.totals.carries).toBe(15)
  })
  it('keeps a traded player’s teams separate in byTeam and summed in the total', () => {
    const r = rebuildPlayerSeasons(logs, 2024).t
    expect(r.teams.sort()).toEqual(['MIA', 'NYJ'])
    expect(r.byTeam.NYJ.totals.targets).toBe(3)
    expect(r.byTeam.MIA.totals.targets).toBe(4)
    expect(r.totals.targets).toBe(7)
  })
  it('never reads stored rate fields (targetShare 99 is ignored)', () => {
    const r = rebuildPlayerSeasons(logs, 2024).t
    expect(Object.keys(r.totals)).not.toContain('targetShare')
    expect(JSON.stringify(r)).not.toContain('99')
  })
})

describe('rebuildTeamTotals', () => {
  it('era-maps LV to OAK in 2019 and keeps LV in 2024', () => {
    expect(rebuildTeamTotals(logs, 2019).OAK.carries).toBe(15)
    expect(rebuildTeamTotals(logs, 2024).LV.carries).toBe(15)
  })
  it('era-maps LA to STL in 2015', () => {
    const l = { players: { x: { games: [g(1, 'LA', { carries: 7 })] } } }
    expect(rebuildTeamTotals(l, 2015).STL.carries).toBe(7)
  })
  it('honours excludePids', () => {
    expect(rebuildTeamTotals(logs, 2024, { excludePids: new Set(['a']) }).LV).toBeUndefined()
  })
})

describe('teamcontext helpers', () => {
  const tc = { teams: { KC: { games: [
    { week: 1, seasonType: 'REG', off: { rzRushPlays: 3, rzPassPlays: 5 } },
    { week: 2, seasonType: 'REG', off: { rzRushPlays: 1, rzPassPlays: 2 } },
    { week: 20, seasonType: 'POST', off: { rzRushPlays: 9, rzPassPlays: 9 } },
  ] } } }
  it('teamWeeksPlayed lists REG weeks only', () => {
    expect([...teamWeeksPlayed(tc).KC]).toEqual([1, 2])
  })
  it('teamRedZoneTotals sums REG games only', () => {
    expect(teamRedZoneTotals(tc).KC).toEqual({ rzRushPlays: 4, rzPassPlays: 7 })
  })
})
