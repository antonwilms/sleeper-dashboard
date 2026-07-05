import { describe, it, expect } from 'vitest'
import { eraTeam, resolvePlayerTeam } from './playerTeam.js'

describe('eraTeam', () => {
  it('boundary matrix', () => {
    expect(eraTeam('LA', 2015)).toBe('STL')
    expect(eraTeam('LA', 2016)).toBe('LA')
    expect(eraTeam('LAC', 2016)).toBe('SD')
    expect(eraTeam('LAC', 2017)).toBe('LAC')
    expect(eraTeam('LV', 2019)).toBe('OAK')
    expect(eraTeam('LV', 2020)).toBe('LV')
  })

  it('identity on already-era-accurate codes', () => {
    expect(eraTeam('KC', 2013)).toBe('KC')
    expect(eraTeam('STL', 2013)).toBe('STL')
  })
})

describe('resolvePlayerTeam — season grain', () => {
  it('resolves the STL-2013 case', () => {
    const careerStats = { 2013: { p1: { team: 'STL' } } }
    expect(resolvePlayerTeam({ careerStats }, 'p1', 2013)).toBe('STL')
  })

  it('resolves a current-era LA value unchanged', () => {
    const careerStats = { 2025: { p1: { team: 'LA' } } }
    expect(resolvePlayerTeam({ careerStats }, 'p1', 2025)).toBe('LA')
  })

  it('defensive LAR input resolves via the alias chain', () => {
    const careerStats = { 2025: { p1: { team: 'LAR' } } }
    expect(resolvePlayerTeam({ careerStats }, 'p1', 2025)).toBe('LA')
  })

  it('missing season returns null', () => {
    const careerStats = { 2013: { p1: { team: 'STL' } } }
    expect(resolvePlayerTeam({ careerStats }, 'p1', 2014)).toBeNull()
  })

  it('missing pid returns null', () => {
    const careerStats = { 2013: { p1: { team: 'STL' } } }
    expect(resolvePlayerTeam({ careerStats }, 'p2', 2013)).toBeNull()
  })

  it('team: null returns null', () => {
    const careerStats = { 2013: { p1: { team: null } } }
    expect(resolvePlayerTeam({ careerStats }, 'p1', 2013)).toBeNull()
  })

  it('careerStats undefined returns null', () => {
    expect(resolvePlayerTeam({}, 'p1', 2013)).toBeNull()
  })
})

describe('resolvePlayerTeam — week grain', () => {
  it('load-bearing era remap of the current-franchise gamelogs domain (season 2013)', () => {
    const gameLogPlayers = { p1: { games: [{ week: 5, team: 'LA' }] } }
    expect(resolvePlayerTeam({ gameLogPlayers }, 'p1', 2013, 5)).toBe('STL')
  })

  it('current-era season resolves LA unchanged', () => {
    const gameLogPlayers = { p1: { games: [{ week: 5, team: 'LA' }] } }
    expect(resolvePlayerTeam({ gameLogPlayers }, 'p1', 2025, 5)).toBe('LA')
  })

  it('week miss returns null', () => {
    const gameLogPlayers = { p1: { games: [{ week: 5, team: 'LA' }] } }
    expect(resolvePlayerTeam({ gameLogPlayers }, 'p1', 2013, 6)).toBeNull()
  })

  it('pid miss returns null', () => {
    const gameLogPlayers = { p1: { games: [{ week: 5, team: 'LA' }] } }
    expect(resolvePlayerTeam({ gameLogPlayers }, 'p2', 2013, 5)).toBeNull()
  })

  it('gameLogPlayers undefined returns null', () => {
    expect(resolvePlayerTeam({}, 'p1', 2013, 5)).toBeNull()
  })
})

describe('resolvePlayerTeam — coercion and defensive inputs', () => {
  it('season passed as string coerces to the same result', () => {
    const careerStats = { 2013: { p1: { team: 'STL' } } }
    expect(resolvePlayerTeam({ careerStats }, 'p1', '2013')).toBe('STL')
  })

  it('empty sources object never throws, returns null', () => {
    expect(resolvePlayerTeam({}, 'p1', 2013)).toBeNull()
  })

  it('undefined sources never throws, returns null', () => {
    expect(resolvePlayerTeam(undefined, 'p1', 2013)).toBeNull()
  })
})
