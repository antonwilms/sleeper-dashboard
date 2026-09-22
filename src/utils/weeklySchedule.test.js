import { describe, it, expect } from 'vitest'
import { buildRegWeekIndex, resolveTeamWeek, scheduledGamesThrough } from './weeklySchedule'

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

describe('scheduledGamesThrough', () => {
  it('counts scored games in earlier weeks and an unscored game only in the current week itself', () => {
    const index = buildRegWeekIndex({
      games: [
        game(1, 'KC', 'DEN', { homeScore: 20, awayScore: 10 }), // scored
        game(2, 'KC', 'BUF'), // unscored, current week
      ],
    })
    expect(scheduledGamesThrough(index, 'KC', 2)).toBe(2)
  })

  it('an unscored game in an earlier week (cancelled/postponed) is not counted', () => {
    const index = buildRegWeekIndex({
      games: [
        game(1, 'KC', 'DEN'), // unscored, earlier than `week`
        game(2, 'KC', 'BUF', { homeScore: 24, awayScore: 20 }),
      ],
    })
    expect(scheduledGamesThrough(index, 'KC', 2)).toBe(1)
  })

  it('null index counts 0', () => {
    expect(scheduledGamesThrough(null, 'KC', 5)).toBe(0)
  })
})
