import { describe, it, expect } from 'vitest'
import { resolvePlayerTeam } from '../utils/playerTeam.js'
import { getTeamWeekRow } from '../api/teamContext.js'

// Behavioural test for the join Slices 4/5/6 depend on: a player resolved via
// resolvePlayerTeam must land on a key that actually exists in a teamContext
// loader result, and getTeamWeekRow must find that team's row for a given week.
//
// The LV/OAK boundary (era ≤2019) is used so both grains are pinned against a
// real code difference — season grain is already era-accurate (OAK), week grain
// is current-franchise (LV) and only resolves to OAK via the eraTeam remap
// (playerTeam.js:65 applies it unconditionally to whatever it reads).
describe('teamContext join', () => {
  const season = 2018

  // Season grain: careerStats[season][pid].team is documented as ALREADY
  // era-accurate — the fixture carries OAK (not LV), so eraTeam is an identity
  // here and the assertion doesn't pass through the remap by accident.
  const careerStats = {
    [season]: {
      p1: { team: 'OAK' },
    },
  }

  // Week grain: gamelogs games[].team is CURRENT-FRANCHISE domain in every
  // season — the fixture carries LV, and resolvePlayerTeam must remap it to OAK.
  const gameLogPlayers = {
    p1: {
      games: [
        { week: 5, team: 'LV' },
      ],
    },
  }

  const teamContextResult = {
    teams: {
      OAK: {
        games: [
          { week: 5, seasonType: 'REG', opponent: 'KC' },
        ],
      },
    },
    year: season,
    complete: true,
    rowCount: 1,
  }

  it('season-grain resolution is an identity on the era-accurate code', () => {
    const team = resolvePlayerTeam({ careerStats }, 'p1', season)
    expect(team).toBe('OAK')
  })

  it('week-grain resolution remaps the current-franchise code to era-accurate', () => {
    const team = resolvePlayerTeam({ gameLogPlayers }, 'p1', season, 5)
    expect(team).toBe('OAK')
  })

  it('the resolved code is a key in the teamContext fixture', () => {
    const team = resolvePlayerTeam({ gameLogPlayers }, 'p1', season, 5)
    expect(Object.keys(teamContextResult.teams)).toContain(team)
  })

  it('getTeamWeekRow finds the row when called with the whole loader result', () => {
    const team = resolvePlayerTeam({ gameLogPlayers }, 'p1', season, 5)
    const row = getTeamWeekRow(teamContextResult, team, 5)
    expect(row).toEqual({ week: 5, seasonType: 'REG', opponent: 'KC' })
  })
})
