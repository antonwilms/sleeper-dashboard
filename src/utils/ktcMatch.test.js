import { describe, it, expect } from 'vitest'
import { matchKTCToSleeper } from './ktcMatch'

// ---------------------------------------------------------------------------
// Minimal Sleeper playersMap helpers
// ---------------------------------------------------------------------------

function makePlayer(id, full_name, position, team) {
  return { [id]: { full_name, position, team } }
}

function singlePlayer(id, full_name, position, team) {
  return makePlayer(id, full_name, position, team)
}

// ---------------------------------------------------------------------------
// matchKTCToSleeper — null / empty guard
// ---------------------------------------------------------------------------

describe('matchKTCToSleeper — null / empty inputs', () => {
  it('returns empty Map for null ktcPlayers', () => {
    expect(matchKTCToSleeper(null, {})).toEqual(new Map())
  })

  it('returns empty Map for empty ktcPlayers array', () => {
    expect(matchKTCToSleeper([], {})).toEqual(new Map())
  })

  it('returns empty Map for null playersMap', () => {
    expect(matchKTCToSleeper([{ name: 'Patrick Mahomes', position: 'QB', team: 'KC', value: 9000 }], null)).toEqual(new Map())
  })
})

// ---------------------------------------------------------------------------
// matchKTCToSleeper — strategy 1: name + position
// ---------------------------------------------------------------------------

describe('matchKTCToSleeper — strategy 1: name + position match', () => {
  it('v2 format (name + position string) — matches by normalized name + position', () => {
    const players = singlePlayer('P_PM', 'Patrick Mahomes', 'QB', 'KC')
    const ktc = [{ name: 'Patrick Mahomes', position: 'QB', team: 'KC', value: 9000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.get('P_PM')).toEqual({ value: 9000, confidence: 'high' })
  })

  it('v1 format (playerName + positionID) — normalizeEntry maps positionID 0→QB', () => {
    const players = singlePlayer('P_PM', 'Patrick Mahomes', 'QB', 'KC')
    const ktc = [{ playerName: 'Patrick Mahomes', positionID: 0, team: 'KC', value: 9000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.get('P_PM')).toEqual({ value: 9000, confidence: 'high' })
  })

  it('v1 format — positionID 1→RB, 2→WR, 3→TE all matched', () => {
    const players = {
      'P_RB': { full_name: 'Christian McCaffrey', position: 'RB', team: 'SF' },
      'P_WR': { full_name: 'Justin Jefferson',    position: 'WR', team: 'MIN' },
      'P_TE': { full_name: 'Travis Kelce',        position: 'TE', team: 'KC' },
    }
    const ktc = [
      { playerName: 'Christian McCaffrey', positionID: 1, team: 'SF',  value: 8500 },
      { playerName: 'Justin Jefferson',    positionID: 2, team: 'MIN', value: 8200 },
      { playerName: 'Travis Kelce',        positionID: 3, team: 'KC',  value: 7800 },
    ]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.get('P_RB')).toEqual({ value: 8500, confidence: 'high' })
    expect(result.get('P_WR')).toEqual({ value: 8200, confidence: 'high' })
    expect(result.get('P_TE')).toEqual({ value: 7800, confidence: 'high' })
  })

  it('suffix normalization — "Jr." in KTC name matches Sleeper "Jr." — both normalize to same key', () => {
    const players = singlePlayer('P_MHJ', 'Marvin Harrison Jr.', 'WR', 'ARI')
    const ktc = [{ name: 'Marvin Harrison Jr.', position: 'WR', team: 'ARI', value: 7000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.get('P_MHJ')).toEqual({ value: 7000, confidence: 'high' })
  })

  // DUP1 edge: ktcMatch's normalizeName removes curly apostrophes (U+2019) entirely.
  // Both KTC name and Sleeper name pass through the same normalizeName, so they produce
  // identical keys ("dandre swift") and match — unlike collegeMatch, which converts U+2019 to a space.
  it('curly apostrophe (U+2019) — stripped on both sides → match succeeds (DUP1 edge)', () => {
    const players = singlePlayer('P_DS', 'D’Andre Swift', 'RB', 'PHI')
    const ktc = [{ name: 'D’Andre Swift', position: 'RB', team: 'PHI', value: 5500 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.get('P_DS')).toEqual({ value: 5500, confidence: 'high' })
  })

  it('position string is case-insensitive — "qb" resolves to QB', () => {
    const players = singlePlayer('P_QB', 'Joe Burrow', 'QB', 'CIN')
    const ktc = [{ name: 'Joe Burrow', position: 'qb', team: 'CIN', value: 8000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.get('P_QB')).toEqual({ value: 8000, confidence: 'high' })
  })
})

// ---------------------------------------------------------------------------
// matchKTCToSleeper — strategy 2: name + team (position absent / unknown)
// ---------------------------------------------------------------------------

describe('matchKTCToSleeper — strategy 2: name + team fallback', () => {
  it('matches when position is absent from KTC entry — uses team instead', () => {
    const players = singlePlayer('P_WR', 'Player X', 'WR', 'DEN')
    // No position field in KTC entry → normalizeEntry returns position: null → skip strategy 1
    const ktc = [{ name: 'Player X', team: 'DEN', value: 4000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.get('P_WR')).toEqual({ value: 4000, confidence: 'high' })
  })

  it('team matching is case-insensitive — lower-case team in KTC normalised to upper', () => {
    const players = singlePlayer('P_RB', 'Speed Back', 'RB', 'DAL')
    const ktc = [{ name: 'Speed Back', team: 'dal', value: 3000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.get('P_RB')).toEqual({ value: 3000, confidence: 'high' })
  })
})

// ---------------------------------------------------------------------------
// matchKTCToSleeper — skip / miss cases
// ---------------------------------------------------------------------------

describe('matchKTCToSleeper — skipped and missed entries', () => {
  it('K / DEF entries (non-skill) are not in byNamePos / byNameTeam → counted as unmatched', () => {
    // Sleeper has no K/DEF entries in the skill map; KTC kicker has no position match
    const players = singlePlayer('P_WR', 'Someone Else', 'WR', 'KC')
    const ktc = [{ name: 'Harrison Butker', position: 'K', team: 'KC', value: 1000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.has('P_WR')).toBe(false)
    // Kicker yields no match; only player that was in Sleeper is the WR — no entry for kicker
    expect(result.size).toBe(0)
  })

  it('entry with null name is skipped', () => {
    const players = singlePlayer('P_WR', 'Real Player', 'WR', 'BUF')
    const ktc = [{ position: 'WR', team: 'BUF', value: 5000 }] // no name or playerName

    const result = matchKTCToSleeper(ktc, players)
    expect(result.size).toBe(0)
  })

  it('entry with null value is skipped', () => {
    const players = singlePlayer('P_WR', 'Real Player', 'WR', 'BUF')
    const ktc = [{ name: 'Real Player', position: 'WR', team: 'BUF' }] // no value

    const result = matchKTCToSleeper(ktc, players)
    expect(result.size).toBe(0)
  })

  it('miss — KTC name has no matching Sleeper player', () => {
    const players = singlePlayer('P_WR', 'Someone Else', 'WR', 'LAR')
    const ktc = [{ name: 'Nobody Known', position: 'WR', team: 'LAR', value: 4000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.has('P_WR')).toBe(false)
    expect(result.size).toBe(0)
  })

  it('Sleeper player with non-skill position (OT) is not indexed — KTC WR with same name misses', () => {
    const players = { 'P_OT': { full_name: 'Big Lineman', position: 'OT', team: 'CLE' } }
    const ktc = [{ name: 'Big Lineman', position: 'WR', team: 'CLE', value: 3000 }]

    const result = matchKTCToSleeper(ktc, players)
    expect(result.size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// matchKTCToSleeper — result shape
// ---------------------------------------------------------------------------

describe('matchKTCToSleeper — result shape', () => {
  it('returns a Map (not a plain object)', () => {
    const result = matchKTCToSleeper([], {})
    expect(result).toBeInstanceOf(Map)
  })

  it('each matched entry has value and confidence: "high"', () => {
    const players = singlePlayer('P_QB', 'Joe Flacco', 'QB', 'CLE')
    const ktc = [{ name: 'Joe Flacco', position: 'QB', team: 'CLE', value: 2000 }]
    const result = matchKTCToSleeper(ktc, players)
    const entry = result.get('P_QB')
    expect(entry).toHaveProperty('value', 2000)
    expect(entry).toHaveProperty('confidence', 'high')
  })
})
