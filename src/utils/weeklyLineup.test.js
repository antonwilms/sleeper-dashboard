import { describe, it, expect } from 'vitest'
import { buildWeeklyLineup, hasScoringProjection } from './weeklyLineup'
import { startingSlots } from './lineup'
import { alignStarterSlots } from './rosterSlots'
import { buildRegWeekIndex } from './weeklySchedule'
import { PRIOR_WEIGHT_GAMES, FPA_PRIOR_DROP_GAMES } from './opponentStrength'

const SCORING = { pass_yd: 0.04, rush_yd: 0.1, rec: 0.5, rec_yd: 0.1 }
const CURRENT_WEEK = 2

function enriched(id, position, name, team = null) {
  return { id, slot: 'Starter', full_name: name, position, team, age: null }
}

function projRow(opponent, stats) {
  return { stats, opponent, team: null }
}

function buildTeam({ rawStarters, starters = [], bench = [], reserve = [], taxi = [] }) {
  return {
    starterSlots: alignStarterSlots(rawStarters),
    starters,
    bench,
    reserve,
    taxi,
  }
}

const BASE_ARGS = {
  currentWeek: CURRENT_WEEK,
  scheduleIndex: null,
  projections: {},
  scoringSettings: SCORING,
  usageByPlayer: {},
  formByPlayer: {},
  fpaTable: {},
  fpaRanks: {},
  playerMap: {},
}

describe('buildWeeklyLineup — starters render the lineup as set in Sleeper, not projection-optimal', () => {
  it('a sub-optimally set lineup (bench QB out-projects the starter, FLEX holds a TE, SUPER_FLEX holds an RB) renders unchanged, in startingSlots order', () => {
    const rosterPositions = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'BN']
    const rawStarters = ['qb1', 'rb1', 'rb2', 'wr1', 'wr2', 'te1', 'te2', 'rb3']
    const myTeam = buildTeam({
      rawStarters,
      starters: [
        enriched('qb1', 'QB', 'QB One'),
        enriched('rb1', 'RB', 'RB One'),
        enriched('rb2', 'RB', 'RB Two'),
        enriched('wr1', 'WR', 'WR One'),
        enriched('wr2', 'WR', 'WR Two'),
        enriched('te1', 'TE', 'TE One'),
        enriched('te2', 'TE', 'TE Two'), // in FLEX
        enriched('rb3', 'RB', 'RB Three'), // in SUPER_FLEX
      ],
      bench: [enriched('qb-bench', 'QB', 'Bench QB Outscores Starter')],
    })
    const projections = {
      'qb-bench': projRow('DEN', { pass_yd: 1000 }), // far out-projects qb1
      qb1: projRow('DEN', { pass_yd: 100 }),
    }

    const { starters } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections })

    expect(starters.map(s => s.player_id)).toEqual(rawStarters)
    expect(starters.map(s => s.slot)).toEqual(startingSlots(rosterPositions))
  })
})

describe('buildWeeklyLineup — empty slot handling (rosterSlots.js)', () => {
  it('an empty ("0") slot in the middle renders an empty row in that slot, and later starters keep their own slot', () => {
    const rosterPositions = ['QB', 'RB', 'WR']
    const rawStarters = ['qb1', '0', 'wr1']
    const myTeam = buildTeam({
      rawStarters,
      starters: [enriched('qb1', 'QB', 'QB One'), enriched('wr1', 'WR', 'WR One')],
    })

    const { starters } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections: {} })

    expect(starters).toHaveLength(3)
    expect(starters[0].player_id).toBe('qb1')
    expect(starters[1]).toMatchObject({ slot: 'RB', player_id: null, points: null })
    expect(starters[1].form).toEqual([null, null, null])
    expect(starters[2].player_id).toBe('wr1')
    expect(starters[2].slot).toBe('WR')
  })
})

describe('buildWeeklyLineup — surplus starters', () => {
  it('an extra starterSlots id beyond the slot list appears in the bench section, not in neither', () => {
    const rosterPositions = ['QB', 'BN']
    const rawStarters = ['qb1', 'qb2']
    const myTeam = buildTeam({
      rawStarters,
      starters: [enriched('qb1', 'QB', 'QB One'), enriched('qb2', 'QB', 'QB Two')],
      bench: [],
    })

    const { starters, bench } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections: {} })

    expect(starters).toHaveLength(1)
    expect(starters[0].player_id).toBe('qb1')
    expect(bench.map(b => b.player_id)).toEqual(['qb2'])
    expect(bench[0].slot).toBe('BN')
  })
})

describe('buildWeeklyLineup — IR and taxi reach neither section', () => {
  it('a projected IR player (highest projection on the roster) appears in neither section', () => {
    const rosterPositions = ['QB', 'BN']
    const rawStarters = ['qb1']
    const myTeam = buildTeam({
      rawStarters,
      starters: [enriched('qb1', 'QB', 'QB One')],
      bench: [enriched('bench1', 'RB', 'Bench One')],
      reserve: [enriched('ir1', 'RB', 'IR Guy')],
    })
    const projections = {
      ir1: projRow('DEN', { rush_yd: 1000 }), // highest projection on the roster
      bench1: projRow('DEN', { rush_yd: 10 }),
    }

    const { starters, bench } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections })

    const allIds = [...starters, ...bench].map(r => r.player_id)
    expect(allIds).not.toContain('ir1')
  })

  it('a taxi player present in both myTeam.bench and myTeam.taxi appears in neither section', () => {
    const rosterPositions = ['QB', 'BN']
    const rawStarters = ['qb1']
    const myTeam = buildTeam({
      rawStarters,
      starters: [enriched('qb1', 'QB', 'QB One')],
      bench: [enriched('taxi1', 'WR', 'Taxi Guy'), enriched('bench1', 'RB', 'Bench One')],
      taxi: [enriched('taxi1', 'WR', 'Taxi Guy')],
    })

    const { starters, bench } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections: {} })

    const allIds = [...starters, ...bench].map(r => r.player_id)
    expect(allIds).not.toContain('taxi1')
    expect(bench.map(b => b.player_id)).toEqual(['bench1'])
  })
})

describe('buildWeeklyLineup — bench sort, nulls last', () => {
  it('an unprojected bench player (name sorts first) is placed after a real zero-projection bench player', () => {
    const rosterPositions = ['QB', 'BN', 'BN']
    const rawStarters = ['qb1']
    const myTeam = buildTeam({
      rawStarters,
      starters: [enriched('qb1', 'QB', 'QB One')],
      bench: [
        enriched('aaa-noproj', 'RB', 'Aaron NoProj'),
        enriched('zzz-zero', 'RB', 'Zack ZeroScore'),
      ],
    })
    const projections = { 'zzz-zero': projRow('DEN', { pass_yd: 0 }) } // scores exactly 0.0

    const { bench } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections })

    expect(bench.map(b => b.player_id)).toEqual(['zzz-zero', 'aaa-noproj'])
    expect(bench[0].points).toBe(0)
    expect(bench[1].points).toBeNull()
  })

  it('an ADP-only row (no scoring stat) is not a projection: points null, sorts after a real zero', () => {
    const rosterPositions = ['QB', 'BN', 'BN']
    const rawStarters = ['qb1']
    const myTeam = buildTeam({
      rawStarters,
      starters: [enriched('qb1', 'QB', 'QB One')],
      bench: [
        enriched('zzz-zero', 'RB', 'Zack ZeroScore'),
        enriched('aaa-adp', 'RB', 'Aaron AdpOnly'),
      ],
    })
    const projections = {
      'zzz-zero': projRow('DEN', { pass_yd: 0 }), // scores exactly 0.0
      'aaa-adp': projRow('DEN', { adp_dd_ppr: 1000 }), // ADP-only, not a projection
    }

    const { bench } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections })

    expect(bench.map(b => b.player_id)).toEqual(['zzz-zero', 'aaa-adp'])
    expect(bench[0].points).toBe(0)
    expect(bench[1].points).toBeNull()
  })
})

describe('hasScoringProjection', () => {
  it('an ADP-only stats object is not a scoring projection', () => {
    expect(hasScoringProjection({ adp_dd_ppr: 1 }, SCORING)).toBe(false)
  })

  it('empty stats is not a scoring projection', () => {
    expect(hasScoringProjection({}, SCORING)).toBe(false)
  })

  it('undefined stats is not a scoring projection', () => {
    expect(hasScoringProjection(undefined, SCORING)).toBe(false)
  })

  it('a real scoring key (even valued 0) is a scoring projection', () => {
    expect(hasScoringProjection({ pass_yd: 0 }, SCORING)).toBe(true)
  })

  it('a stat key whose league weight is 0 does not count', () => {
    expect(hasScoringProjection({ fum_lost: 5 }, { ...SCORING, fum_lost: 0 })).toBe(false)
  })
})

describe('buildWeeklyLineup — opponent / bye (A3, weekly-decision-2a-lineup-truth.md §4)', () => {
  const rosterPositions = ['QB']
  const rawStarters = ['qb1']

  it('the schedule resolves a game for an unprojected starter: bye false, opponent from the schedule, points null', () => {
    const myTeam = buildTeam({ rawStarters, starters: [enriched('qb1', 'QB', 'QB One', 'KC')] })
    const scheduleIndex = buildRegWeekIndex({
      games: [{ week: CURRENT_WEEK, gameType: 'REG', homeTeam: 'KC', awayTeam: 'DEN', homeScore: null, awayScore: null }],
    })

    const { starters } = buildWeeklyLineup({
      myTeam, rosterPositions, ...BASE_ARGS, projections: {}, scheduleIndex,
    })

    expect(starters[0]).toMatchObject({ bye: false, opponent: 'DEN', points: null })
  })

  it('schedule null and no projection row -> unknown: bye false, opponent null', () => {
    const myTeam = buildTeam({ rawStarters, starters: [enriched('qb1', 'QB', 'QB One', 'KC')] })

    const { starters } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections: {} })

    expect(starters[0].bye).toBe(false)
    expect(starters[0].opponent).toBeNull()
  })

  it('a team with no REG game that week renders as a bye', () => {
    const myTeam = buildTeam({ rawStarters, starters: [enriched('qb1', 'QB', 'QB One', 'BUF')] })
    const scheduleIndex = buildRegWeekIndex({
      games: [{ week: CURRENT_WEEK, gameType: 'REG', homeTeam: 'KC', awayTeam: 'DEN', homeScore: 20, awayScore: 17 }],
    })

    const { starters } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections: {}, scheduleIndex })

    expect(starters[0].bye).toBe(true)
    expect(starters[0].opponent).toBeNull()
  })

  it('an LAR opponent (no schedule; from the projections fallback) resolves against the era-accurate fpaTable via normalizeTeamForSchedule', () => {
    const myTeam = buildTeam({ rawStarters, starters: [enriched('qb1', 'QB', 'QB One')] })
    const fpaTable = { LA: { qb: 18.5, weights: { qb: FPA_PRIOR_DROP_GAMES } } }
    const fpaRanks = { LA: { qb: 12 } }
    const projections = { qb1: projRow('LAR', { pass_yd: 250 }) } // Sleeper domain

    const { starters } = buildWeeklyLineup({
      myTeam, rosterPositions, ...BASE_ARGS, projections, fpaTable, fpaRanks,
    })

    expect(starters[0].opponent).toBe('LAR')
    expect(starters[0].allows).toBe(18.5) // proves the CR-16 hop ran
    expect(starters[0].allowsRank).toBe(12)
  })

  it('weight clamps to 1 once gCur >= FPA_PRIOR_DROP_GAMES', () => {
    const myTeam = buildTeam({ rawStarters, starters: [enriched('qb1', 'QB', 'QB One')] })
    const fpaTable = { DEN: { qb: 15, weights: { qb: FPA_PRIOR_DROP_GAMES } } }
    const projections = { qb1: projRow('DEN', { pass_yd: 200 }) }

    const { starters } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections, fpaTable })

    expect(starters[0].weight).toBe(1)
  })

  it('weight is the games-played blend below the drop threshold', () => {
    const myTeam = buildTeam({ rawStarters, starters: [enriched('qb1', 'QB', 'QB One')] })
    const fpaTable = { DEN: { qb: 15, weights: { qb: 1 } } }
    const projections = { qb1: projRow('DEN', { pass_yd: 200 }) }

    const { starters } = buildWeeklyLineup({ myTeam, rosterPositions, ...BASE_ARGS, projections, fpaTable })

    expect(starters[0].weight).toBeCloseTo(1 / (1 + PRIOR_WEIGHT_GAMES))
  })
})

describe('buildWeeklyLineup — form with fewer than three played weeks', () => {
  it('one played week yields two leading nulls and no zeros', () => {
    const rosterPositions = ['QB']
    const myTeam = buildTeam({ rawStarters: ['qb1'], starters: [enriched('qb1', 'QB', 'QB One')] })

    const { starters } = buildWeeklyLineup({
      myTeam, rosterPositions, ...BASE_ARGS, projections: {},
      formByPlayer: { qb1: [null, null, 12.4] },
    })

    expect(starters[0].form).toEqual([null, null, 12.4])
  })
})
