import { describe, it, expect } from 'vitest'
import { buildMatchupColumns } from './weeklyMatchupColumns'
import { buildImpliedTotals, vegasFactor } from './weeklyOwnProjection'

// week-w2a-lineup-matchup-layout.md T1–T5. Tests are exempt from the single-importer rule: they build
// the index with the real buildImpliedTotals and pass vegasFor = vegasFactor over it.
const reg = (week, home, away, spreadLine, totalLine) => ({ week, gameType: 'REG', homeTeam: home, awayTeam: away, spreadLine, totalLine })
const vegasForWeek = (games, week) => {
  const index = buildImpliedTotals({ games })
  return t => vegasFactor(index, t, week)
}
const rowOf = (over = {}) => ({ player_id: 'p1', team: 'KC', opponent: 'DEN', opponentEra: 'DEN', position: 'WR', bye: false, ...over })
const allowedTeam = (gp, passYd, rushYd) => ({ gp, passYd, rushYd, pts: {} })
const noMetrics = { currentAllowed: null, priorAllowed: null, priorSeason: 2025, teamMetrics: null }

describe('buildMatchupColumns', () => {
  it('T1 spread is the opponent implied minus his own (betting convention: favourite negative)', () => {
    const vegasFor = vegasForWeek([reg(5, 'KC', 'DEN', 3, 45)], 5)
    expect(vegasFor('KC').implied).toBe(24)
    expect(vegasFor('DEN').implied).toBe(21)
    const out = buildMatchupColumns({
      rows: [rowOf(), rowOf({ player_id: 'p2', team: 'DEN', opponent: 'KC', opponentEra: 'KC' })], vegasFor, ...noMetrics,
    })
    expect(out.p1.spread).toBe(-3)
    expect(out.p2.spread).toBe(3)
  })

  it('T2 implied survives without a baseline; baseline needs two earlier weeks', () => {
    const one = vegasForWeek([reg(4, 'KC', 'LV', 0, 40), reg(5, 'KC', 'DEN', 3, 45)], 5)
    expect(one('KC').baseline).toBeNull()
    const a = buildMatchupColumns({ rows: [rowOf()], vegasFor: one, ...noMetrics }).p1
    expect(a.implied).toBe(24)
    expect(a.impliedBaseline).toBeNull()
    expect(a.impliedBaselineWeeks).toBe(1)
    const two = vegasForWeek([reg(3, 'KC', 'LV', 0, 40), reg(4, 'KC', 'LV', 0, 44), reg(5, 'KC', 'DEN', 3, 45)], 5)
    expect(buildMatchupColumns({ rows: [rowOf()], vegasFor: two, ...noMetrics }).p1.impliedBaseline).toBe(21)
  })

  it('T3 yards are keyed on opponentEra (CR-16) and by play type', () => {
    const currentAllowed = { LA: allowedTeam(2, 500, 200) }
    const priorAllowed = { LA: allowedTeam(17, 4080, 1700) }
    expect('LAR' in currentAllowed).toBe(false)
    const out = buildMatchupColumns({
      rows: [
        rowOf({ player_id: 'rb', position: 'RB', opponent: 'LAR', opponentEra: 'LA' }),
        rowOf({ player_id: 'wr', position: 'WR', opponent: 'LAR', opponentEra: 'LA' }),
      ],
      vegasFor: () => null, currentAllowed, priorAllowed, priorSeason: 2025, teamMetrics: null,
    })
    expect(out.rb.yards).toEqual({ kind: 'rush', current: 100, prior: 100, priorSeason: 2025 })
    expect(out.wr.yards).toEqual({ kind: 'pass', current: 250, prior: 240, priorSeason: 2025 })
  })

  it('T4 pace/PROE ranks are computed over ranked teams only, on the era key', () => {
    const teamMetrics = { KC: { pace: 27, proe: 0.03 }, LA: { pace: 29, proe: -0.01 }, LV: { pace: null, proe: 0.01 } }
    expect(teamMetrics.LAR).toBeUndefined()
    expect(teamMetrics.LV.pace).toBeNull()
    const out = buildMatchupColumns({
      rows: [rowOf({ player_id: 'r', team: 'LAR' }), rowOf({ player_id: 'k', team: 'KC' })],
      vegasFor: () => null, currentAllowed: null, priorAllowed: null, priorSeason: 2025, teamMetrics,
    })
    expect(out.r.pace).toEqual({ value: 29, rank: 2, of: 2 })
    expect(out.r.proe).toEqual({ value: -0.01, rank: 3, of: 3 })
    expect(out.k.pace.rank).toBe(1)
    expect(out.k.proe.rank).toBe(1)
  })

  it('T5 guards: bye, no team, no player_id, no team metrics', () => {
    const vegasFor = vegasForWeek([reg(5, 'KC', 'DEN', 3, 45)], 5)
    const bye = rowOf({ bye: true })
    expect(bye.opponent).not.toBeNull()
    expect(bye.opponentEra).not.toBeNull()
    expect(vegasFor(bye.team).implied).not.toBeNull() // only the bye guard can null it
    const teamMetrics = { KC: { pace: 27, proe: 0.03 } }
    const out = buildMatchupColumns({
      rows: [bye, rowOf({ player_id: 'fa', team: 'FA' }), rowOf({ player_id: null }), rowOf({ player_id: 'nm' })],
      vegasFor, currentAllowed: { DEN: allowedTeam(2, 400, 200) }, priorAllowed: null, priorSeason: 2025, teamMetrics,
    })
    expect(out.p1.implied).toBeNull()
    expect(out.p1.spread).toBeNull()
    expect(out.p1.yards).toBeNull()
    expect(out.p1.pace).not.toBeNull()
    expect(out.p1.proe).not.toBeNull()
    expect(out.fa).toEqual({ implied: null, impliedBaseline: null, impliedBaselineWeeks: 0, spread: null, yards: null, pace: null, proe: null })
    expect(Object.keys(out)).not.toContain('null')
    expect(Object.keys(out).sort()).toEqual(['fa', 'nm', 'p1'])
    const none = buildMatchupColumns({ rows: [rowOf({ player_id: 'nm' })], vegasFor, ...noMetrics })
    expect(none.nm.pace).toBeNull()
    expect(none.nm.proe).toBeNull()
  })
})
