import { describe, it, expect } from 'vitest'
import { buildSosTable } from './strengthOfSchedule'
import { rankFpaTable } from './opponentStrength'

const game = (homeTeam, awayTeam, over = {}) => ({
  gameType: 'REG', homeTeam, awayTeam, homeScore: null, awayScore: null, result: null, ...over,
})
const fpa = (qb, rb, wr, te) => ({ qb, rb, wr, te, weights: { qb: 0, rb: 0, wr: 0, te: 0 } })

describe('buildSosTable', () => {
  // Round robin: AAA-BBB, AAA-CCC, BBB-CCC.
  const schedule = { games: [game('AAA', 'BBB'), game('CCC', 'AAA'), game('BBB', 'CCC')] }
  const table = { AAA: fpa(20, 10, 30, 8), BBB: fpa(22, 12, 34, 6), CCC: fpa(18, 14, 26, 10) }

  it('averages the opponents; a team counts in both its home and away games', () => {
    const sos = buildSosTable(schedule, table)
    expect(sos.AAA.opponents).toBe(2)
    expect(sos.AAA.wr).toBe((34 + 26) / 2) // BBB (home game) and CCC (away game)
    expect(sos.BBB.wr).toBe((30 + 26) / 2)
    expect(sos.CCC.qb).toBe((22 + 20) / 2)
  })

  it('an opponent with a null value for a position is dropped from the denominator, not zero-filled', () => {
    const t = { ...table, BBB: fpa(22, null, 34, 6) }
    const sos = buildSosTable(schedule, t)
    expect(sos.AAA.rb).toBe(14) // only CCC counts: 14, NOT (0 + 14) / 2 = 7
    expect(sos.CCC.rb).toBe(10) // only AAA counts
  })

  it('a position no opponent has a value for is null', () => {
    const t = { AAA: fpa(20, null, 30, 8), BBB: fpa(22, null, 34, 6), CCC: fpa(18, null, 26, 10) }
    expect(buildSosTable(schedule, t).AAA.rb).toBeNull()
  })

  it('a non-REG game is excluded', () => {
    const s = { games: [game('AAA', 'BBB'), game('AAA', 'CCC', { gameType: 'POST' })] }
    const sos = buildSosTable(s, table)
    expect(sos.AAA.opponents).toBe(1)
    expect(sos.AAA.wr).toBe(34)
    expect(sos.CCC).toBeUndefined()
  })

  it('played games are excluded — including a 0-0 score and a tie (result 0), which truthiness gets wrong', () => {
    const s = {
      games: [
        game('AAA', 'BBB', { homeScore: 21, awayScore: 17, result: 4 }),
        game('AAA', 'CCC', { homeScore: 0, awayScore: 0, result: 0 }),
        game('BBB', 'CCC', { homeScore: 20, awayScore: 20, result: 0 }),
        game('BBB', 'AAA'), // the one unplayed game
      ],
    }
    const sos = buildSosTable(s, table)
    expect(sos.AAA.opponents).toBe(1)
    expect(sos.BBB.opponents).toBe(1)
    expect(sos.AAA.wr).toBe(34)
    // CCC's two REG games are both played (nothing left), not "no schedule" — it still gets a row.
    expect(sos.CCC).toEqual({ opponents: 0, qb: null, rb: null, wr: null, te: null })
  })

  it('all games played → every team keeps its row with opponents 0 and every position null (§4.3), not an absent row', () => {
    const s = { games: [game('AAA', 'BBB', { homeScore: 1, awayScore: 0, result: 1 })] }
    const sos = buildSosTable(s, table)
    expect(sos.AAA).toEqual({ opponents: 0, qb: null, rb: null, wr: null, te: null })
    expect(sos.BBB).toEqual({ opponents: 0, qb: null, rb: null, wr: null, te: null })
  })

  it('no REG games at all → {}, distinguishing "no schedule" from "season over"', () => {
    const s = { games: [game('AAA', 'BBB', { gameType: 'POST' })] }
    expect(buildSosTable(s, table)).toEqual({})
  })

  it('every position null and opponents 0 when no opponent has FPA data', () => {
    const sos = buildSosTable({ games: [game('AAA', 'ZZZ')] }, { AAA: fpa(1, 1, 1, 1) })
    expect(sos.AAA).toEqual({ opponents: 1, qb: null, rb: null, wr: null, te: null })
  })

  it('null / empty schedule → {}, no throw', () => {
    expect(buildSosTable(null, table)).toEqual({})
    expect(buildSosTable({ games: [] }, table)).toEqual({})
    expect(buildSosTable(undefined, undefined)).toEqual({})
  })

  it('schedule LAR is normalised to the era-accurate LA key', () => {
    const sos = buildSosTable({ games: [game('LAR', 'AAA')] }, { LA: fpa(1, 1, 1, 1), AAA: fpa(5, 5, 5, 5) })
    expect(sos.LA.qb).toBe(5)
    expect(sos.AAA.qb).toBe(1)
    expect(sos.LAR).toBeUndefined()
  })
})

describe('rankFpaTable over buildSosTable', () => {
  it('1 = lowest FPA (hardest); opponents is not a fifth position; null-value team keeps its entry with a null rank; ranks over 3 not 32', () => {
    const sched = { games: [game('AAA', 'BBB'), game('CCC', 'AAA'), game('BBB', 'CCC')] }
    const table = {
      AAA: { qb: 20, rb: null, wr: 30, te: 8, weights: {} },
      BBB: { qb: 22, rb: null, wr: 34, te: 6, weights: {} },
      CCC: { qb: 18, rb: 14, wr: 26, te: 10, weights: {} },
    }
    const sos = buildSosTable(sched, table)
    const ranks = rankFpaTable(sos)
    expect(Object.keys(ranks.AAA).sort()).toEqual(['qb', 'rb', 'te', 'wr'])
    expect('opponents' in ranks.AAA).toBe(false)
    // wr: AAA 30, BBB 28, CCC 32 → BBB hardest
    expect(ranks.BBB.wr).toBe(1)
    expect(ranks.AAA.wr).toBe(2)
    expect(ranks.CCC.wr).toBe(3)
    // rb: AAA and BBB each face one opponent with a value (CCC = 14); CCC's opponents both lack one → null rank
    expect(ranks.CCC.rb).toBeNull()
    expect(ranks.CCC).toBeDefined()
    expect(Math.max(...Object.values(ranks).map(r => r.wr))).toBe(3)
  })
})
