import { describe, it, expect } from 'vitest'
import { NFL_TEAM_NAMES, teamName } from './nflTeamNames'

describe('nflTeamNames', () => {
  it('has 32 entries in the era-accurate current domain (LA, not LAR)', () => {
    expect(Object.keys(NFL_TEAM_NAMES)).toHaveLength(32)
    expect(NFL_TEAM_NAMES.LA).toBe('Los Angeles Rams')
    expect(NFL_TEAM_NAMES.LAR).toBeUndefined()
    expect(NFL_TEAM_NAMES.LV).toBe('Las Vegas Raiders')
  })
  it('an unknown code falls back to the abbreviation, never undefined', () => {
    expect(teamName('DET')).toBe('Detroit Lions')
    expect(teamName('OAK')).toBe('OAK')
  })
})
