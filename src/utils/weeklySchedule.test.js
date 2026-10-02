import { describe, it, expect } from 'vitest'
import { buildRegWeekIndex, resolveTeamWeek, buildTeamRecords } from './weeklySchedule'

function game(week, homeTeam, awayTeam, { gameType = 'REG', homeScore = null, awayScore = null } = {}) {
  return { week, gameType, homeTeam, awayTeam, homeScore, awayScore }
}

describe('buildRegWeekIndex', () => {
  it('returns null for a null/absent schedule (the caller\'s complete-gate)', () => {
    expect(buildRegWeekIndex(null)).toBeNull()
  })
})

describe('resolveTeamWeek', () => {
  it('a team with no REG game that week resolves as a bye', () => {
    const index = buildRegWeekIndex({ games: [game(2, 'KC', 'DEN', { homeScore: 20, awayScore: 17 })] })
    const r = resolveTeamWeek(index, 'BUF', 2)
    expect(r.status).toBe('bye')
  })

  it('a game resolves with the opponent in both domains', () => {
    const index = buildRegWeekIndex({ games: [game(2, 'KC', 'DEN')] })
    expect(resolveTeamWeek(index, 'KC', 2)).toEqual({ status: 'game', opponentEra: 'DEN', opponent: 'DEN' })
    expect(resolveTeamWeek(index, 'DEN', 2)).toEqual({ status: 'game', opponentEra: 'KC', opponent: 'KC' })
  })

  it('LAR resolves against a schedule keyed LA as a game, opponent in the Sleeper domain, opponentEra in the era domain', () => {
    const index = buildRegWeekIndex({ games: [game(3, 'LA', 'SEA')] })
    const r = resolveTeamWeek(index, 'LAR', 3)
    expect(r.status).toBe('game')
    expect(r.opponentEra).toBe('SEA')
    expect(r.opponent).toBe('SEA')

    // The reciprocal lookup: SEA's opponent is LAR in the Sleeper domain, LA in the era domain —
    // proves denormalizeTeamForSchedule actually ran, not just normalizeTeamForSchedule's input hop.
    const seaResult = resolveTeamWeek(index, 'SEA', 3)
    expect(seaResult).toEqual({ status: 'game', opponent: 'LAR', opponentEra: 'LA' })
  })

  it('schedule null, no projection row -> unknown, never bye', () => {
    expect(resolveTeamWeek(null, 'KC', 2)).toEqual({ status: 'unknown' })
  })

  it('team null or "FA" -> unknown, never bye', () => {
    const index = buildRegWeekIndex({ games: [game(2, 'KC', 'DEN')] })
    expect(resolveTeamWeek(index, null, 2).status).toBe('unknown')
    expect(resolveTeamWeek(index, 'FA', 2).status).toBe('unknown')
  })

  it('week 19 with no REG games in the index -> unknown for every team', () => {
    const index = buildRegWeekIndex({ games: [game(2, 'KC', 'DEN')] })
    expect(resolveTeamWeek(index, 'KC', 19).status).toBe('unknown')
    expect(resolveTeamWeek(index, 'DEN', 19).status).toBe('unknown')
  })

  it('a POST game in week 19 (no REG games that week) resolves as unknown for both teams — the gameType filter, not a bye', () => {
    const index = buildRegWeekIndex({
      games: [
        game(2, 'KC', 'DEN'),
        game(19, 'KC', 'BUF', { gameType: 'POST' }),
      ],
    })
    expect(resolveTeamWeek(index, 'KC', 19).status).toBe('unknown')
    expect(resolveTeamWeek(index, 'DAL', 19).status).toBe('unknown')
  })
})

describe('buildTeamRecords', () => {
  it('counts W / L / T from the scores — an equal-score game is a tie for both teams', () => {
    const r = buildTeamRecords({
      games: [
        game(1, 'KC', 'DEN', { homeScore: 20, awayScore: 10 }),
        game(2, 'BUF', 'KC', { homeScore: 17, awayScore: 24 }),
        game(3, 'KC', 'LV', { homeScore: 14, awayScore: 21 }),
        game(4, 'KC', 'SEA', { homeScore: 13, awayScore: 13 }),
      ],
    })
    expect(r.KC).toMatchObject({ w: 2, l: 1, t: 1, lastWeek: 4, unscored: 0 })
    expect(r.DEN).toMatchObject({ w: 0, l: 1, t: 0 })
    expect(r.LV).toMatchObject({ w: 1, l: 0, t: 0 })
    expect(r.SEA).toMatchObject({ t: 1 })
  })

  it('non-REG games are skipped', () => {
    const r = buildTeamRecords({ games: [game(19, 'KC', 'BUF', { gameType: 'POST', homeScore: 27, awayScore: 24 })] })
    expect(r).toEqual({})
  })

  it('keys by the era domain — a Sleeper-domain LAR code lands on LA', () => {
    const r = buildTeamRecords({ games: [game(1, 'LAR', 'SEA', { homeScore: 30, awayScore: 3 })] })
    expect(r.LA).toMatchObject({ w: 1, l: 0 })
    expect(r.LAR).toBeUndefined()
  })

  it('lastWeek is the highest scored week for the team', () => {
    const r = buildTeamRecords({
      games: [game(5, 'KC', 'DEN', { homeScore: 1, awayScore: 0 }), game(2, 'KC', 'BUF', { homeScore: 1, awayScore: 0 })],
    })
    expect(r.KC.lastWeek).toBe(5)
  })

  it('a null schedule -> {}', () => {
    expect(buildTeamRecords(null)).toEqual({})
  })

  it('unscored counts a null-score game at week <= throughWeek only', () => {
    const schedule = {
      games: [
        game(1, 'KC', 'DEN', { homeScore: 20, awayScore: 10 }),
        game(2, 'KC', 'BUF'),   // inside throughWeek: the file trails
        game(3, 'KC', 'LV'),    // beyond throughWeek: not yet played
      ],
    }
    const r = buildTeamRecords(schedule, { throughWeek: 2 })
    expect(r.KC).toMatchObject({ w: 1, lastWeek: 1, unscored: 1 })
    expect(r.BUF).toMatchObject({ w: 0, l: 0, t: 0, unscored: 1 })
    expect(r.LV).toBeUndefined()
  })

  it('a team whose latest week is a bye has unscored 0', () => {
    const r = buildTeamRecords(
      { games: [game(1, 'KC', 'DEN', { homeScore: 20, awayScore: 10 }), game(2, 'BUF', 'LV', { homeScore: 3, awayScore: 0 })] },
      { throughWeek: 2 },
    )
    expect(r.KC.unscored).toBe(0)
    expect(r.KC.lastWeek).toBe(1)
  })
})
