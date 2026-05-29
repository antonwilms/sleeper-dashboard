/**
 * src/utils/nflDraftMatch.test.js
 *
 * Tests for matchNflDraftToSleeper using the hand-curated 2024 fixture.
 *
 * The fixture entries and their expected match outcomes:
 *   R1P4   WR  Marvin Harrison Jr. / Ohio State  → matched (single candidate, WR)
 *   R1P8   QB  Michael Penix / Washington        → matched (single candidate, QB)
 *   R1P22  OT  Jordan Love / Utah State          → skipped (non-skill position)
 *   R2P33  WR  Joe Smith / Other Tech            → matched by college (two Smiths)
 *   R3P67  RB  Blake Corum / Michigan             → matched (single candidate, RB)
 *   R4P100 WR  Ricky Pearsall / Florida           → matched (single candidate, WR)
 *   R5P150 WR  Miles Turner / Auburn              → matched (single candidate, WR)
 *   R6P180 WR  Rome Odunze / Washington           → matched (single candidate, WR)
 *   R7P232 RB  Joe Smith / Some State             → matched by college (disambiguation)
 *   R7P240 HB  HB Turner / Notre Dame             → matched (HB→RB alias, single candidate)
 */

import { describe, it, expect } from 'vitest'
import { matchNflDraftToSleeper } from './nflDraftMatch'
import samplePicks from '../__fixtures__/nfl-draft-2024-sample.json'

// ---------------------------------------------------------------------------
// Minimal Sleeper playersMap covering the fixture entries
// ---------------------------------------------------------------------------

function makePlayers() {
  return {
    // Marvin Harrison Jr. — WR, Ohio State
    'P_MHJ':   { full_name: 'Marvin Harrison Jr.', position: 'WR', college: 'Ohio State',  years_exp: 0 },
    // Michael Penix — QB, Washington
    'P_PENIX': { full_name: 'Michael Penix',        position: 'QB', college: 'Washington',  years_exp: 0 },
    // Jordan Love — a QB in Sleeper (nflverse fixture entry is OT → should NOT match)
    'P_LOVE':  { full_name: 'Jordan Love',          position: 'QB', college: 'Utah State',  years_exp: 5 },
    // Joe Smith — WR, from Other Tech (for R2P33 disambiguation)
    'P_JS_WR': { full_name: 'Joe Smith',            position: 'WR', college: 'Other Tech',  years_exp: 0 },
    // Joe Smith — RB, from Some State (for R7P232 disambiguation)
    'P_JS_RB': { full_name: 'Joe Smith',            position: 'RB', college: 'Some State',  years_exp: 0 },
    // Blake Corum — RB, Michigan
    'P_CORUM': { full_name: 'Blake Corum',          position: 'RB', college: 'Michigan',    years_exp: 0 },
    // Ricky Pearsall — WR, Florida
    'P_PEARS': { full_name: 'Ricky Pearsall',       position: 'WR', college: 'Florida',     years_exp: 0 },
    // Miles Turner — WR, Auburn
    'P_MTUR':  { full_name: 'Miles Turner',         position: 'WR', college: 'Auburn',      years_exp: 0 },
    // Rome Odunze — WR, Washington
    'P_ODU':   { full_name: 'Rome Odunze',          position: 'WR', college: 'Washington',  years_exp: 0 },
    // HB Turner — RB (Sleeper has position RB), Notre Dame
    'P_HBTUR': { full_name: 'HB Turner',            position: 'RB', college: 'Notre Dame',  years_exp: 0 },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('matchNflDraftToSleeper', () => {
  it('returns {} when called with null inputs', () => {
    expect(matchNflDraftToSleeper(null, null)).toEqual({})
    expect(matchNflDraftToSleeper({}, null)).toEqual({})
    expect(matchNflDraftToSleeper(null, {})).toEqual({})
  })

  it('matches Marvin Harrison Jr. (single WR candidate, R1P4)', () => {
    const result = matchNflDraftToSleeper(samplePicks, makePlayers())
    // NflDraftMatch shape: { year, round, pick, team, college, position, ageAtDraft }
    // nflDraftMatchSource is added by resolveNflDraftFactor in seasonProjection — NOT in this object.
    expect(result['P_MHJ']).toMatchObject({
      year: 2024, round: 1, pick: 4, team: 'ARI',
    })
    expect(result['P_MHJ']).not.toHaveProperty('nflDraftMatchSource')
    expect(result['P_MHJ'].round).toBe(1)
    expect(result['P_MHJ'].pick).toBe(4)
  })

  it('skips Jordan Love OT pick — non-skill position vs QB in Sleeper', () => {
    const result = matchNflDraftToSleeper(samplePicks, makePlayers())
    expect(result['P_LOVE']).toBeUndefined()
  })

  it('disambiguates two Joe Smiths by college — WR gets R2P33', () => {
    const result = matchNflDraftToSleeper(samplePicks, makePlayers())
    expect(result['P_JS_WR']).toMatchObject({ round: 2, pick: 33, college: 'Other Tech' })
    expect(result['P_JS_RB']).toMatchObject({ round: 7, pick: 232, college: 'Some State' })
  })

  it('maps HB Turner pick (position HB) to RB player in Sleeper', () => {
    const result = matchNflDraftToSleeper(samplePicks, makePlayers())
    expect(result['P_HBTUR']).toMatchObject({ round: 7, pick: 240, team: 'KC' })
  })

  it('matches Blake Corum RB (R3P67)', () => {
    const result = matchNflDraftToSleeper(samplePicks, makePlayers())
    expect(result['P_CORUM']).toMatchObject({ round: 3, pick: 67, team: 'NE' })
  })

  it('matches Rome Odunze WR (R6P180)', () => {
    const result = matchNflDraftToSleeper(samplePicks, makePlayers())
    expect(result['P_ODU']).toMatchObject({ round: 6, pick: 180, team: 'CHI' })
  })

  it('does not match players absent from the pick list', () => {
    const players = {
      'P_GHOST': { full_name: 'Nobody Exists', position: 'WR', college: 'Nowhere', years_exp: 0 },
    }
    const result = matchNflDraftToSleeper(samplePicks, players)
    expect(result['P_GHOST']).toBeUndefined()
  })

  it('skips non-skill positions in the playersMap (e.g. OT players are never in nameMap)', () => {
    const players = {
      'P_OT': { full_name: 'Marvin Harrison Jr.', position: 'OT', college: 'Ohio State', years_exp: 0 },
    }
    const result = matchNflDraftToSleeper(samplePicks, players)
    // OT is not a skill position → not in nameMap → no match
    expect(result['P_OT']).toBeUndefined()
  })

  it('applies recency rule — later year entry overwrites earlier for same player', () => {
    const picks = {
      2023: [{ year: 2023, round: 3, pick: 70, team: 'OLD', fullName: 'Marvin Harrison Jr.', position: 'WR', college: 'Ohio State', age: 20 }],
      2024: samplePicks['2024'],
    }
    const result = matchNflDraftToSleeper(picks, makePlayers())
    // 2024 entry should overwrite 2023 entry for P_MHJ
    expect(result['P_MHJ'].year).toBe(2024)
    expect(result['P_MHJ'].round).toBe(1)
  })

  it('result shape includes all NflDraftMatch fields', () => {
    const result = matchNflDraftToSleeper(samplePicks, makePlayers())
    const match = result['P_MHJ']
    expect(match).toHaveProperty('year')
    expect(match).toHaveProperty('round')
    expect(match).toHaveProperty('pick')
    expect(match).toHaveProperty('team')
    expect(match).toHaveProperty('college')
    expect(match).toHaveProperty('position')
    expect(match).toHaveProperty('ageAtDraft')
  })
})
