import { describe, it, expect } from 'vitest'
import { matchKTCToSleeper, resolveKtcRows, KTC_TEAM_ALIAS } from './ktcMatch'
import { buildPlayerIdIndex } from './playerIdCrosswalk'

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

describe('matchKTCToSleeper — position-absent rows', () => {
  it('a row with no position is unmatched (the old name+team fallback for position-absent rows is gone)', () => {
    const players = singlePlayer('P_WR', 'Player X', 'WR', 'DEN')
    const ktc = [{ name: 'Player X', team: 'DEN', value: 4000 }]

    expect(matchKTCToSleeper(ktc, players).size).toBe(0)
    expect(resolveKtcRows(ktc, players)[0]).toMatchObject({ sid: null, path: 'unmatched' })
  })

  it('team tie-break is case-insensitive — lower-case team in KTC still picks the exact-team candidate', () => {
    const players = { ...makePlayer('A', 'Speed Back', 'RB', 'DAL'), ...makePlayer('B', 'Speed Back', 'RB', 'NYG') }
    const ktc = [{ name: 'Speed Back', position: 'RB', team: 'dal', value: 3000 }]

    const [r] = resolveKtcRows(ktc, players)
    expect(r).toMatchObject({ sid: 'A', path: 'exact-team' })
    expect(matchKTCToSleeper(ktc, players).get('A')).toEqual({ value: 3000, confidence: 'high' })
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

// ---------------------------------------------------------------------------
// ID-first / variant resolution (CR-31)
// ---------------------------------------------------------------------------

const P = (full_name, position, team, extra = {}) => ({ full_name, position, team, ...extra })
const idx = rows => buildPlayerIdIndex({
  ids: Object.fromEntries(Object.entries(rows).map(([sid, name]) => [`g${sid}`, { name }])),
  bySleeper: Object.fromEntries(Object.keys(rows).map(sid => [sid, { gsisId: `g${sid}` }])),
})
const one = (ktc, players, playerIds = null) => resolveKtcRows([ktc], players, playerIds)[0]

describe('resolveKtcRows — variants, crosswalk alias, team tie-break', () => {
  it('D.J. Moore (KTC initials) resolves to the WR, not a CB decoy; works without a crosswalk', () => {
    const players = { 1: P('DJ Moore', 'WR', 'CHI'), 2: P('DJ Moore', 'CB', 'FA') }
    const r = one({ name: 'D.J. Moore', position: 'WR', team: 'CHI', value: 5000 }, players)
    expect(r).toMatchObject({ sid: '1', path: 'alias-team' })
  })

  it('Kenneth Gainwell: Sleeper "Kenneth", KTC "Kenny" — via the crosswalk name (KTC spelling)', () => {
    const players = { 1: P('Kenneth Gainwell', 'RB', 'PIT') }
    const row = { name: 'Kenny Gainwell', position: 'RB', team: 'PIT', value: 3000 }
    expect(one(row, players).sid).toBe('1')                       // alias-team even without the crosswalk
    expect(one(row, players, idx({ 1: 'Kenny Gainwell' }))).toMatchObject({ sid: '1', path: 'exact' })
  })

  it('Matthew Hibner: given-name alias + team agreement; a team mismatch stays unmatched', () => {
    const players = { 1: P('Matt Hibner', 'TE', 'MIA') }
    expect(one({ name: 'Matthew Hibner', position: 'TE', team: 'MIA', value: 900 }, players)).toMatchObject({ sid: '1', path: 'alias-team' })
    expect(one({ name: 'Matthew Hibner', position: 'TE', team: 'DEN', value: 900 }, players)).toMatchObject({ sid: null, path: 'unmatched' })
  })

  it('Travis Hunter: Sleeper position DB but fantasy_positions WR → KTC WR row matches', () => {
    const players = { 1: P('Travis Hunter', 'DB', 'JAX', { fantasy_positions: ['DB', 'WR'] }) }
    expect(one({ name: 'Travis Hunter', position: 'WR', team: 'JAX', value: 7000 }, players)).toMatchObject({ sid: '1', path: 'exact' })
  })

  it('Kyle Williams: three same-name candidates, the one on the KTC team wins (exact-team)', () => {
    const players = { 1: P('Kyle Williams', 'WR', 'FA'), 2: P('Kyle Williams', 'WR', 'NE'), 3: P('Kyle Williams', 'WR', 'FA') }
    expect(one({ name: 'Kyle Williams', position: 'WR', team: 'NEP', value: 4000 }, players)).toMatchObject({ sid: '2', path: 'exact-team' })
  })

  it('same-name candidates, none on the KTC team → ambiguous, no value (not ids[0])', () => {
    const players = { 1: P('Josh Allen', 'QB', 'BUF'), 2: P('Josh Allen', 'QB', 'FA'), 3: P('Josh Allen', 'QB', 'JAX') }
    const ktc = [{ name: 'Josh Allen', position: 'QB', team: 'DEN', value: 9000 }]
    expect(resolveKtcRows(ktc, players)[0]).toMatchObject({ sid: null, path: 'ambiguous', candidates: ['1', '2', '3'] })
    expect(matchKTCToSleeper(ktc, players).size).toBe(0)
  })

  it('a crosswalk name failing surnameAgrees is not indexed (wrong crosswalk row)', () => {
    const players = { 1: P('Tony Jones', 'RB', 'NO') }
    const row = { name: 'Glenn Cadrez', position: 'RB', team: 'NO', value: 300 }
    expect(one(row, players, idx({ 1: 'Glenn Cadrez' })).sid).toBeNull()
  })

  it('KTC team spellings are aliased (LVR → LV) on the tie-break', () => {
    expect(KTC_TEAM_ALIAS.LVR).toBe('LV')
    const players = { 1: P('Aidan Smith', 'WR', 'LV'), 2: P('Aidan Smith', 'WR', 'DEN') }
    expect(one({ name: 'Aidan Smith', position: 'WR', team: 'LVR', value: 100 }, players)).toMatchObject({ sid: '1', path: 'exact-team' })
  })

  it('pick rows (no position) drop; matchKTCToSleeper keeps the old signature and value shape', () => {
    const players = { 1: P('Aidan Smith', 'WR', 'LV') }
    const ktc = [{ name: '2027 Early 1st', position: null, team: 'FA', value: 5000 }, { name: 'Aidan Smith', position: 'WR', team: 'LV', value: 100 }]
    expect([...matchKTCToSleeper(ktc, players).entries()]).toEqual([['1', { value: 100, confidence: 'high' }]])
  })
})
