import { describe, it, expect } from 'vitest'
import { teamDepthChartPath, CURRENT_TEAM_CODES } from './teamLink'

describe('teamLink', () => {
  it('maps Sleeper codes to the schedule-domain route', () => {
    expect(teamDepthChartPath('LAR')).toBe('/teams/LA?view=depth')
    expect(teamDepthChartPath('KC')).toBe('/teams/KC?view=depth')
  })
  it('FA, null and stale codes produce no link', () => {
    expect(teamDepthChartPath(null)).toBeNull()
    expect(teamDepthChartPath('FA')).toBeNull()
    expect(teamDepthChartPath('OAK')).toBeNull()
  })
  it('CURRENT_TEAM_CODES is the 32 schedule-domain codes', () => {
    expect(CURRENT_TEAM_CODES.size).toBe(32)
    expect(CURRENT_TEAM_CODES.has('LA')).toBe(true)
    expect(CURRENT_TEAM_CODES.has('LAR')).toBe(false)
  })
})
