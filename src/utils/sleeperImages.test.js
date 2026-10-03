import { describe, it, expect } from 'vitest'
import { playerHeadshotUrl, teamLogoUrl, SLEEPER_LOGO_TEAMS } from './sleeperImages'

describe('playerHeadshotUrl', () => {
  it('builds the /thumb/ URL from a numeric id given as string or number', () => {
    const url = 'https://sleepercdn.com/content/nfl/players/thumb/4046.jpg'
    expect(playerHeadshotUrl('4046')).toBe(url)
    expect(playerHeadshotUrl(4046)).toBe(url)
  })

  it('returns null for anything that is not all digits', () => {
    for (const bad of [null, undefined, '', 'KC', 'p1', '12a', '../4046', '4046.jpg']) {
      expect(playerHeadshotUrl(bad)).toBeNull()
    }
  })
})

describe('teamLogoUrl', () => {
  it('the allowlist is the 32 Sleeper-domain codes, each mapping to its lower-case png', () => {
    expect(SLEEPER_LOGO_TEAMS.size).toBe(32)
    for (const t of SLEEPER_LOGO_TEAMS) {
      expect(teamLogoUrl(t)).toMatch(new RegExp(`/${t.toLowerCase()}\\.png$`))
    }
  })

  it('LAR resolves to lar.png', () => {
    expect(teamLogoUrl('LAR')).toBe('https://sleepercdn.com/images/team_logos/nfl/lar.png')
  })

  it('performs no domain hop: the era code LA is rejected (CR-16), as are FA, other era codes, lower case and WSH', () => {
    for (const bad of ['LA', 'FA', null, undefined, 'STL', 'SD', 'OAK', 'kc', 'WSH']) {
      expect(teamLogoUrl(bad)).toBeNull()
    }
  })
})
