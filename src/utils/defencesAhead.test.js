import { describe, it, expect } from 'vitest'
import { buildDefencesAhead, buildDefenceFailedWeeks } from './defencesAhead'
import { buildRegWeekIndex, buildTeamRecords } from './weeklySchedule'
import { buildFpaTable, rankFpaTable } from './opponentStrength'

// myteam-m2b-defences-ahead.md §5 — Fixture F (not exported).
const g = (week, home, away, homeScore = null, awayScore = null) => ({
  gameType: 'REG', week, homeTeam: home, awayTeam: away, homeScore, awayScore,
})
const live = {
  complete: true,
  games: [
    g(1, 'GB', 'MIN', 20, 17), g(1, 'DET', 'CHI', 24, 20), g(1, 'LA', 'SEA', 21, 14),
    g(2, 'DET', 'GB', 24, 10), g(2, 'CHI', 'LA', 13, 10),
    g(3, 'GB', 'CHI', 21, 14), g(3, 'DET', 'LA', 27, 20),
    g(4, 'DET', 'GB'), g(4, 'LA', 'CHI'),
    g(5, 'CHI', 'DET'), g(5, 'LA', 'GB'),
    g(6, 'LA', 'CHI'), g(6, 'GB', 'MIN'),
  ],
}
const prior = { complete: true, games: [g(4, 'DET', 'MIN', 20, 17), g(1, 'GB', 'MIN', 30, 10)] }

const priorHalf = {
  season: 2025, failedWeeks: [],
  teams: {
    GB: { gp: 17, pts: { qb: 0, rb: 340, wr: 306, te: 0 }, passYd: 4080, rushYd: 1700 },
    CHI: { gp: 17, pts: { qb: 0, rb: 170, wr: 272, te: 0 }, passYd: 3400, rushYd: 1360 },
  },
}
const currentHalf = {
  season: 2026, failedWeeks: [2],
  teams: { GB: { gp: 3, pts: { qb: 0, rb: 90, wr: 72, te: 0 }, passYd: 600, rushYd: 270 } },
}

const priorAllowed = priorHalf.teams
const currentAllowed = currentHalf.teams
const fpaTable = buildFpaTable({ prior: priorAllowed, current: currentAllowed })
const fpaRanks = rankFpaTable(fpaTable)
const scheduleIndex = buildRegWeekIndex(live)
const currentRecords = buildTeamRecords(live, { throughWeek: 3 })
const priorRecords = buildTeamRecords(prior)

const rb1 = { slot: 'RB', player_id: 'rb1', name: 'Rex Back', position: 'RB', points: 14 }
const wl1 = { slot: 'WR', player_id: 'wl1', name: 'Wes Rams', position: 'WR', points: 15 }
const teams = { rb1: 'DET', wl1: 'LAR' }

function build(overrides = {}) {
  return buildDefencesAhead({
    slots: [rb1, wl1], teamOf: id => teams[id] ?? null, scheduleIndex, currentWeek: 4, lastWeek: 18,
    fpaTable, fpaRanks, priorAllowed, currentAllowed, priorRecords, currentRecords,
    ...overrides,
  })
}
const rowOf = (out, id) => out.rows.find(r => r.player_id === id)

describe('buildDefencesAhead', () => {
  it('U1 this-week row carries every metric', () => {
    const r = rowOf(build(), 'rb1')
    expect(r.opponent).toBe('GB')
    expect(r.opponentEra).toBe('GB')
    expect(r.prior).toBe(20)
    expect(r.current).toBe(30)
    expect(r.allows).toBe(25)
    expect(r.allowsRank).toBe(2)
    expect(r.weight).toBe(0.5)
    expect(r.notBlended).toBe(false)
    expect(r.yardsPrior).toEqual({ pass: 240, rush: 100 })
    expect(r.yardsCurrent).toEqual({ pass: 200, rush: 90 })
    expect(r.recCurrent).toMatchObject({ w: 2, l: 1, t: 0 })
    expect(r.recPrior).toMatchObject({ w: 1, l: 0, t: 0 })
  })

  it('U2 remaining weeks exclude played weeks and this week', () => {
    const out = build()
    expect(out.weeks).toEqual([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18])
    expect(out.weeks).toHaveLength(14)
    const r = rowOf(out, 'rb1')
    expect(r.ahead[0].week).toBe(5)
    expect(r.ahead.every(c => c.week > 4)).toBe(true)
  })

  it('U3 a bye is shown as a bye, a week with no games as unknown', () => {
    const r = rowOf(build(), 'rb1')
    const wk6 = r.ahead.find(c => c.week === 6)
    expect(wk6).toMatchObject({ status: 'bye', opponent: null, allows: null })
    expect(r.ahead.find(c => c.week === 7).status).toBe('unknown')
  })

  it('U3b a bye THIS week: the row is a bye with every number null (no half, yards or record read)', () => {
    const r = rowOf(build({ currentWeek: 6 }), 'rb1')
    expect(r).toMatchObject({ bye: true, opponent: null, opponentEra: null, allows: null, weight: null })
    for (const k of ['prior', 'current', 'yardsPrior', 'yardsCurrent', 'recPrior', 'recCurrent']) expect(r[k]).toBeNull()
  })

  it('U4 an ahead cell reads the row\'s own position group, via the era key', () => {
    const out = build()
    const w5 = rowOf(out, 'wl1').ahead.find(c => c.week === 5)
    expect(w5).toMatchObject({ status: 'game', opponent: 'GB', allows: 21 })
    expect(w5.allowsRank).toBe(2)
    expect(rowOf(out, 'rb1').ahead.find(c => c.week === 5).allows).toBe(10)
    // Sleeper LAR resolves through the era hop: this week (wk4) he plays CHI.
    const wl = rowOf(out, 'wl1')
    expect(wl.opponent).toBe('CHI')
    expect(wl.opponentEra).toBe('CHI')
  })

  it('U4b a Rams opponent joins every read on the era key LA, and the ahead rank is the row\'s own position', () => {
    const liveSched = { complete: true, games: [g(1, 'LA', 'SEA', 21, 14), g(4, 'SEA', 'LA'), g(5, 'LA', 'SEA')] }
    const priorSched = { complete: true, games: [g(1, 'SEA', 'LA', 30, 10)] }
    const priorTeams = {
      LA: { gp: 17, pts: { qb: 0, rb: 340, wr: 0, te: 136 }, passYd: 3740, rushYd: 1870 },
      KC: { gp: 17, pts: { qb: 0, rb: 255, wr: 0, te: 170 }, passYd: 0, rushYd: 0 },
    }
    const currentTeams = { LA: { gp: 1, pts: { qb: 0, rb: 20, wr: 0, te: 6 }, passYd: 230, rushYd: 95 } }
    const table = buildFpaTable({ prior: priorTeams, current: currentTeams })
    const ranks = rankFpaTable(table)
    const te1 = { slot: 'TE', player_id: 'te1', name: 'Tess End', position: 'TE', points: 9 }
    const out = buildDefencesAhead({
      slots: [te1], teamOf: () => 'SEA', scheduleIndex: buildRegWeekIndex(liveSched), currentWeek: 4, lastWeek: 18,
      fpaTable: table, fpaRanks: ranks, priorAllowed: priorTeams, currentAllowed: currentTeams,
      priorRecords: buildTeamRecords(priorSched), currentRecords: buildTeamRecords(liveSched, { throughWeek: 3 }),
    })
    const r = rowOf(out, 'te1')
    expect(r.opponent).toBe('LAR')
    expect(r.opponentEra).toBe('LA')
    expect(r.prior).toBe(8)
    expect(r.current).toBe(6)
    expect(r.allows).toBe(7.5)
    expect(r.allowsRank).toBe(1)
    expect(r.weight).toBe(0.25)
    expect(r.yardsPrior).toEqual({ pass: 220, rush: 110 })
    expect(r.yardsCurrent).toEqual({ pass: 230, rush: 95 })
    expect(r.recCurrent).toMatchObject({ w: 1, l: 0, t: 0 })
    expect(r.recPrior).toMatchObject({ w: 0, l: 1, t: 0 })
    expect(r.ahead.find(c => c.week === 5)).toMatchObject({
      status: 'game', opponent: 'LAR', opponentEra: 'LA', allows: 7.5, allowsRank: 1,
    })
  })

  it('U5 an empty slot gets no row', () => {
    const out = build({ slots: [rb1, { slot: 'FLEX', player_id: null }] })
    expect(out.rows).toHaveLength(1)
  })

  it('U6 notBlended exactly when the blend weight is 1', () => {
    const nine = buildFpaTable({
      prior: priorAllowed,
      current: { GB: { gp: 9, pts: { qb: 0, rb: 270, wr: 216, te: 0 }, passYd: 1800, rushYd: 810 } },
    })
    const out = build({ fpaTable: nine, fpaRanks: rankFpaTable(nine) })
    expect(rowOf(out, 'rb1')).toMatchObject({ weight: 1, notBlended: true })
    expect(rowOf(build(), 'rb1').notBlended).toBe(false)
  })

  it('U7 schedule absent: rows stay, every number null, every ahead cell unknown', () => {
    const out = build({ scheduleIndex: null })
    const r = rowOf(out, 'rb1')
    expect(out.rows).toHaveLength(2)
    expect(r.opponent).toBeNull()
    expect(r.prior).toBeNull()
    expect(r.current).toBeNull()
    expect(r.allows).toBeNull()
    expect(r.ahead.every(c => c.status === 'unknown')).toBe(true)
  })
})

describe('buildDefenceFailedWeeks', () => {
  it('null -> []', () => {
    expect(buildDefenceFailedWeeks(null)).toEqual([])
  })
  it('only the failing half is reported', () => {
    expect(buildDefenceFailedWeeks({
      prior: { season: 2025, failedWeeks: [4] }, current: { season: 2026, failedWeeks: [] },
    })).toEqual([{ season: 2025, weeks: [4] }])
  })
  it('both halves failing -> two entries, prior first', () => {
    expect(buildDefenceFailedWeeks({
      prior: { season: 2025, failedWeeks: [4] }, current: { season: 2026, failedWeeks: [2] },
    })).toEqual([{ season: 2025, weeks: [4] }, { season: 2026, weeks: [2] }])
  })
  it('a null prior half is skipped', () => {
    expect(buildDefenceFailedWeeks({
      prior: null, current: { season: 2026, failedWeeks: [2, 3] },
    })).toEqual([{ season: 2026, weeks: [2, 3] }])
  })
})
