import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeName, normalizeCollege, matchCollegeToSleeper } from './collegeMatch'
import { pivotStatRows, computeTeamTotals } from '../api/cfbd'

vi.mock('../api/cfbd', () => ({
  pivotStatRows: vi.fn(),
  computeTeamTotals: vi.fn(),
}))

// ---------------------------------------------------------------------------
// normalizeName (collegeMatch version)
// ---------------------------------------------------------------------------

describe('normalizeName (collegeMatch)', () => {
  it('returns empty string for null, undefined, and empty string', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
    expect(normalizeName('')).toBe('')
  })

  it('lowercases plain names', () => {
    expect(normalizeName('Patrick Mahomes')).toBe('patrick mahomes')
  })

  it('removes straight apostrophes — D\'Andre → dandre (not a space)', () => {
    expect(normalizeName("D'Andre Swift")).toBe('dandre swift')
  })

  // DUP1 edge: collegeMatch uses ['.]/g which only covers the straight apostrophe (U+0027).
  // A curly/right single quote (U+2019) is NOT removed — it falls through to the
  // [^a-z0-9\s] → space replacement, producing a space, not an empty gap.
  // ktcMatch uses ['']/g (both U+0027 and U+2019), so it REMOVES the curly apostrophe.
  it("curly apostrophe (U+2019) → space, not removed (DUP1 edge — ktcMatch removes it)", () => {
    expect(normalizeName('D’Andre Swift')).toBe('d andre swift')
  })

  // DUP1 edge: collegeMatch removes periods via ['.]/g in the first pass.
  // ktcMatch converts periods to spaces via [^a-z0-9 ]/g, producing "a j brown".
  it("periods inside names are removed, not spaced — A.J. Brown → 'aj brown' (DUP1 edge)", () => {
    expect(normalizeName('A.J. Brown')).toBe('aj brown')
  })

  it('strips suffix: Jr (with period)', () => {
    expect(normalizeName('Marvin Harrison Jr.')).toBe('marvin harrison')
  })

  it('strips suffix: Jr (without period)', () => {
    expect(normalizeName('Marvin Harrison Jr')).toBe('marvin harrison')
  })

  it('strips suffix: Sr', () => {
    expect(normalizeName('Deebo Samuel Sr')).toBe('deebo samuel')
  })

  it('strips suffix: II', () => {
    expect(normalizeName('Calvin Ridley II')).toBe('calvin ridley')
  })

  it('strips suffix: III', () => {
    expect(normalizeName('Odell Beckham III')).toBe('odell beckham')
  })

  it('strips suffix: IV', () => {
    expect(normalizeName('Player Name IV')).toBe('player name')
  })

  it('strips suffix: V', () => {
    expect(normalizeName('Player Name V')).toBe('player name')
  })

  it('replaces hyphens with a space', () => {
    expect(normalizeName('Mack-Jones Test')).toBe('mack jones test')
  })

  it('collapses multiple whitespace tokens', () => {
    expect(normalizeName('  John   Smith  ')).toBe('john smith')
  })
})

// ---------------------------------------------------------------------------
// normalizeCollege
// ---------------------------------------------------------------------------

describe('normalizeCollege', () => {
  it('returns empty string for null, undefined, and empty string', () => {
    expect(normalizeCollege(null)).toBe('')
    expect(normalizeCollege(undefined)).toBe('')
    expect(normalizeCollege('')).toBe('')
  })

  it('lowercases plain school names', () => {
    expect(normalizeCollege('Michigan')).toBe('michigan')
  })

  // "University" is removed as a whole word, but "of" is not — "of michigan" is the result.
  it('removes the word "university" but not filler words like "of"', () => {
    expect(normalizeCollege('University of Michigan')).toBe('of michigan')
  })

  it('removes the word "college"', () => {
    expect(normalizeCollege('Boston College')).toBe('boston')
  })

  it('removes the word "the"', () => {
    expect(normalizeCollege('The Ohio State')).toBe('ohio state')
  })

  it('removes "The" and "University" together', () => {
    expect(normalizeCollege('The Ohio State University')).toBe('ohio state')
  })

  it('applies alias: LSU → louisiana state', () => {
    expect(normalizeCollege('LSU')).toBe('louisiana state')
  })

  it('applies alias: Ole Miss → mississippi', () => {
    expect(normalizeCollege('Ole Miss')).toBe('mississippi')
  })

  it('applies alias: USC → southern california', () => {
    expect(normalizeCollege('USC')).toBe('southern california')
  })

  it('applies alias: Pitt → pittsburgh', () => {
    expect(normalizeCollege('Pitt')).toBe('pittsburgh')
  })

  it('applies alias: North Carolina State → nc state', () => {
    expect(normalizeCollege('North Carolina State')).toBe('nc state')
  })

  it('applies alias: BYU → brigham young', () => {
    expect(normalizeCollege('BYU')).toBe('brigham young')
  })

  it('maps "Miami (FL)" parenthetical through alias to "miami"', () => {
    // Parens → spaces via [^a-z0-9\s], collapses to "miami fl" which aliases to "miami"
    expect(normalizeCollege('Miami (FL)')).toBe('miami')
  })

  it('passes through names with no alias unchanged', () => {
    expect(normalizeCollege('Oklahoma')).toBe('oklahoma')
    expect(normalizeCollege('Alabama')).toBe('alabama')
  })

  it('strips periods from names', () => {
    // "U.S.C." → "usc" after period removal and alias lookup
    expect(normalizeCollege('Florida State')).toBe('florida state')
  })
})

// ---------------------------------------------------------------------------
// matchCollegeToSleeper
// ---------------------------------------------------------------------------

describe('matchCollegeToSleeper', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // Helper: set up pivotStatRows / computeTeamTotals for a single year.
  // Calls are ordered: rec → rush → pass for pivotStatRows; same order for computeTeamTotals.
  function setupYear(pivRec, pivRush = {}, pivPass = {}, totRec = {}, totRush = {}, totPass = {}) {
    pivotStatRows
      .mockReturnValueOnce(pivRec)
      .mockReturnValueOnce(pivRush)
      .mockReturnValueOnce(pivPass)
    computeTeamTotals
      .mockReturnValueOnce(totRec)
      .mockReturnValueOnce(totRush)
      .mockReturnValueOnce(totPass)
  }

  function oneYearData(year) {
    return {
      receiving: { [year]: [{}] },
      rushing:   { [year]: [] },
      passing:   { [year]: [] },
    }
  }

  it('returns {} when rawCollegeData is null or playersMap is null', () => {
    expect(matchCollegeToSleeper(null, { P1: { full_name: 'X', position: 'WR', college: 'Y' } })).toEqual({})
    expect(matchCollegeToSleeper({ receiving: { 2020: [] }, rushing: { 2020: [] }, passing: { 2020: [] } }, null)).toEqual({})
  })

  it('happy path — single WR candidate matched by name', () => {
    const pivotedRec = {
      cfbd_1: { playerId: 'cfbd_1', player: 'Justin Jefferson', team: 'LSU', position: 'WR', conference: 'SEC', YDS: 1540, TD: 18 },
    }
    setupYear(pivotedRec, {}, {}, { LSU: { YDS: 2500, TD: 30 } })

    const result = matchCollegeToSleeper(oneYearData(2020), {
      P_JJ: { full_name: 'Justin Jefferson', position: 'WR', college: 'LSU' },
    })

    expect(result['P_JJ']).toHaveLength(1)
    const s = result['P_JJ'][0]
    expect(s.year).toBe(2020)
    expect(s.team).toBe('LSU')
    expect(s.receiving).toMatchObject({ player: 'Justin Jefferson', YDS: 1540, TD: 18 })
    expect(s.rushing).toBeNull()
    expect(s.passing).toBeNull()
    expect(s.teamRecTotals).toEqual({ YDS: 2500, TD: 30 })
    // Rush totals not in the mocked object → default { YDS:0, TD:0 }
    expect(s.teamRushTotals).toEqual({ YDS: 0, TD: 0 })
  })

  it('non-skill position (OT) in playersMap is never added to nameMap — no match', () => {
    setupYear({ cfbd_1: { playerId: 'cfbd_1', player: 'Big Lineman', team: 'Alabama', position: 'OL', conference: 'SEC', YDS: 0, TD: 0 } })

    const result = matchCollegeToSleeper(oneYearData(2021), {
      P_OT: { full_name: 'Big Lineman', position: 'OT', college: 'Alabama' },
    })
    expect(result['P_OT']).toBeUndefined()
  })

  it('miss — CFBD player name absent from Sleeper nameMap', () => {
    setupYear({ cfbd_1: { playerId: 'cfbd_1', player: 'Unknown Player', team: 'SMU', position: 'WR', conference: 'American Athletic', YDS: 800, TD: 5 } })

    const result = matchCollegeToSleeper(oneYearData(2022), {
      P_OTHER: { full_name: 'Different Name', position: 'WR', college: 'SMU' },
    })
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('disambiguation by college — two WRs share a normalized name, matched by team', () => {
    const pivotedRec = {
      cfbd_1: { playerId: 'cfbd_1', player: 'John Smith', team: 'Auburn', position: 'WR', conference: 'SEC', YDS: 900, TD: 8 },
      cfbd_2: { playerId: 'cfbd_2', player: 'John Smith', team: 'Alabama', position: 'WR', conference: 'SEC', YDS: 700, TD: 6 },
    }
    setupYear(pivotedRec, {}, {}, { Auburn: { YDS: 2000, TD: 20 }, Alabama: { YDS: 2500, TD: 25 } })

    const result = matchCollegeToSleeper(oneYearData(2023), {
      P_JS1: { full_name: 'John Smith', position: 'WR', college: 'Auburn' },
      P_JS2: { full_name: 'John Smith', position: 'WR', college: 'Alabama' },
    })
    expect(result['P_JS1'][0].team).toBe('Auburn')
    expect(result['P_JS2'][0].team).toBe('Alabama')
  })

  it('QB matched via pass-driven pass 2 — passing field populated', () => {
    const pivotedPass = {
      cfbd_qb1: { playerId: 'cfbd_qb1', player: 'Lamar Jackson', team: 'Louisville', position: 'QB', conference: 'ACC', YDS: 3500, ATT: 400, TD: 30 },
    }
    setupYear({}, {}, pivotedPass, {}, {}, { Louisville: { YDS: 3500, TD: 30 } })

    const result = matchCollegeToSleeper(oneYearData(2016), {
      P_LJ: { full_name: 'Lamar Jackson', position: 'QB', college: 'Louisville' },
    })

    expect(result['P_LJ']).toHaveLength(1)
    expect(result['P_LJ'][0].passing).toMatchObject({ player: 'Lamar Jackson', YDS: 3500 })
    expect(result['P_LJ'][0].teamPassTotals).toEqual({ YDS: 3500, TD: 30 })
  })

  it('non-QB Sleeper player is skipped in pass-driven pass 2 even if name matches passRows', () => {
    const pivotedPass = {
      cfbd_1: { playerId: 'cfbd_1', player: 'Taysom Hill', team: 'BYU', position: 'QB', conference: 'Big 12', YDS: 1000, ATT: 200, TD: 5 },
    }
    setupYear({}, {}, pivotedPass)

    const result = matchCollegeToSleeper(oneYearData(2017), {
      P_WR: { full_name: 'Taysom Hill', position: 'WR', college: 'BYU' },
    })
    expect(result['P_WR']).toBeUndefined()
  })

  it('multi-year player — seasons sorted oldest to newest', () => {
    const pivRec2020 = {
      cfbd_1: { playerId: 'cfbd_1', player: 'Ja\'Marr Chase', team: 'LSU', position: 'WR', conference: 'SEC', YDS: 1780, TD: 20 },
    }
    const pivRec2021 = {
      cfbd_1: { playerId: 'cfbd_1', player: 'Ja\'Marr Chase', team: 'LSU', position: 'WR', conference: 'SEC', YDS: 800, TD: 8 },
    }
    // Year 2020: 3 pivotStatRows + 3 computeTeamTotals calls
    pivotStatRows
      .mockReturnValueOnce(pivRec2020).mockReturnValueOnce({}).mockReturnValueOnce({})
      .mockReturnValueOnce(pivRec2021).mockReturnValueOnce({}).mockReturnValueOnce({})
    computeTeamTotals
      .mockReturnValueOnce({ LSU: { YDS: 3000, TD: 40 } }).mockReturnValueOnce({}).mockReturnValueOnce({})
      .mockReturnValueOnce({ LSU: { YDS: 2800, TD: 35 } }).mockReturnValueOnce({}).mockReturnValueOnce({})

    const rawCollegeData = {
      receiving: { 2020: [{}], 2021: [{}] },
      rushing:   { 2020: [],   2021: [] },
      passing:   { 2020: [],   2021: [] },
    }
    const result = matchCollegeToSleeper(rawCollegeData, {
      P_JC: { full_name: "Ja'Marr Chase", position: 'WR', college: 'LSU' },
    })

    expect(result['P_JC']).toHaveLength(2)
    expect(result['P_JC'][0].year).toBe(2020)
    expect(result['P_JC'][1].year).toBe(2021)
  })
})
