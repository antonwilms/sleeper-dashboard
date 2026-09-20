import { describe, it, expect } from 'vitest'
import { buildTeamPrimaryPassers } from './qbSeason'

const reg = (team, attempts, over = {}) => ({ seasonType: 'REG', team, attempts, ...over })
const logs = players => ({ complete: true, players })

describe('buildTeamPrimaryPassers', () => {
  it('the higher-attempt passer wins, and attempts is the REG sum', () => {
    const out = buildTeamPrimaryPassers(logs({
      a: { games: [reg('DET', 300), reg('DET', 278)] },
      b: { games: [reg('DET', 100)] },
    }))
    expect(out.DET).toEqual({ playerId: 'a', attempts: 578 })
  })

  it('a zero-attempt (or absent) row does not create a passer and does not dilute attempts', () => {
    const out = buildTeamPrimaryPassers(logs({
      rb: { games: [reg('DET', 0), reg('DET', undefined)] },
      qb: { games: [reg('DET', 30), reg('DET', 0)] },
    }))
    expect(out.DET).toEqual({ playerId: 'qb', attempts: 30 })
    expect(buildTeamPrimaryPassers(logs({ rb: { games: [reg('DET', 0)] } }))).toEqual({})
  })

  it('a passer on two teams is returned for each, with only that team\'s attempts', () => {
    const out = buildTeamPrimaryPassers(logs({
      mover: { games: [reg('NYJ', 120), reg('PIT', 250)] },
    }))
    expect(out.NYJ).toEqual({ playerId: 'mover', attempts: 120 })
    expect(out.PIT).toEqual({ playerId: 'mover', attempts: 250 })
  })

  it('a POST row is excluded', () => {
    const out = buildTeamPrimaryPassers(logs({
      a: { games: [reg('KC', 100), { seasonType: 'POST', team: 'KC', attempts: 500 }] },
    }))
    expect(out.KC.attempts).toBe(100)
  })

  it('an exact attempt tie resolves to the lower playerId, whatever the insertion order', () => {
    const one = buildTeamPrimaryPassers(logs({ '20': { games: [reg('SF', 50)] }, '10': { games: [reg('SF', 50)] } }))
    const two = buildTeamPrimaryPassers(logs({ '10': { games: [reg('SF', 50)] }, '20': { games: [reg('SF', 50)] } }))
    expect(one.SF.playerId).toBe('10')
    expect(two.SF.playerId).toBe('10')
  })

  it('complete: false and null inputs → {}', () => {
    expect(buildTeamPrimaryPassers({ complete: false, players: { a: { games: [reg('DET', 300)] } } })).toEqual({})
    expect(buildTeamPrimaryPassers(null)).toEqual({})
    expect(buildTeamPrimaryPassers(undefined)).toEqual({})
  })
})
