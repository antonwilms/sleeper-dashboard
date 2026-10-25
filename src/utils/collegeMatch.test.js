import { describe, it, expect, vi, beforeEach } from 'vitest'
import { normalizeName, normalizeCollege, matchCollegeToSleeper } from './collegeMatch'
import { computeTeamTotals } from '../api/cfbd'

vi.mock('../api/cfbd', () => ({
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

  // Helper: set up computeTeamTotals for a single year. Calls are ordered rec → rush → pass.
  // pivotStatRows is no longer called by collegeMatch.js (college-pivot.md §4 step 5) — the
  // loader now returns already-pivoted objects, passed directly into collegeData() below.
  function setupYear(totRec = {}, totRush = {}, totPass = {}) {
    computeTeamTotals
      .mockReturnValueOnce(totRec)
      .mockReturnValueOnce(totRush)
      .mockReturnValueOnce(totPass)
  }

  // Builds a rawCollegeData for one year from already-pivoted objects, as getBulkPlayerStats
  // now returns (normalizeCollegeStats, cfbd.js).
  function collegeData(year, { receiving = {}, rushing = {}, passing = {} } = {}) {
    return {
      receiving: { [year]: receiving },
      rushing:   { [year]: rushing },
      passing:   { [year]: passing },
    }
  }

  it('returns {} when rawCollegeData is null or playersMap is null', () => {
    expect(matchCollegeToSleeper(null, { P1: { full_name: 'X', position: 'WR', college: 'Y' } })).toEqual({})
    expect(matchCollegeToSleeper({ receiving: { 2020: {} }, rushing: { 2020: {} }, passing: { 2020: {} } }, null)).toEqual({})
  })

  it('happy path — single WR candidate matched by name', () => {
    const pivotedRec = {
      cfbd_1: { playerId: 'cfbd_1', player: 'Justin Jefferson', team: 'LSU', position: 'WR', conference: 'SEC', YDS: 1540, TD: 18 },
    }
    setupYear({ LSU: { YDS: 2500, TD: 30 } })

    const result = matchCollegeToSleeper(collegeData(2020, { receiving: pivotedRec }), {
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
    const pivotedRec = { cfbd_1: { playerId: 'cfbd_1', player: 'Big Lineman', team: 'Alabama', position: 'OL', conference: 'SEC', YDS: 0, TD: 0 } }
    setupYear()

    const result = matchCollegeToSleeper(collegeData(2021, { receiving: pivotedRec }), {
      P_OT: { full_name: 'Big Lineman', position: 'OT', college: 'Alabama' },
    })
    expect(result['P_OT']).toBeUndefined()
  })

  it('miss — CFBD player name absent from Sleeper nameMap', () => {
    const pivotedRec = { cfbd_1: { playerId: 'cfbd_1', player: 'Unknown Player', team: 'SMU', position: 'WR', conference: 'American Athletic', YDS: 800, TD: 5 } }
    setupYear()

    const result = matchCollegeToSleeper(collegeData(2022, { receiving: pivotedRec }), {
      P_OTHER: { full_name: 'Different Name', position: 'WR', college: 'SMU' },
    })
    expect(Object.keys(result)).toHaveLength(0)
  })

  it('disambiguation by college — two WRs share a normalized name, matched by team', () => {
    const pivotedRec = {
      cfbd_1: { playerId: 'cfbd_1', player: 'John Smith', team: 'Auburn', position: 'WR', conference: 'SEC', YDS: 900, TD: 8 },
      cfbd_2: { playerId: 'cfbd_2', player: 'John Smith', team: 'Alabama', position: 'WR', conference: 'SEC', YDS: 700, TD: 6 },
    }
    setupYear({ Auburn: { YDS: 2000, TD: 20 }, Alabama: { YDS: 2500, TD: 25 } })

    const result = matchCollegeToSleeper(collegeData(2023, { receiving: pivotedRec }), {
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
    setupYear({}, {}, { Louisville: { YDS: 3500, TD: 30 } })

    const result = matchCollegeToSleeper(collegeData(2016, { passing: pivotedPass }), {
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
    setupYear()

    const result = matchCollegeToSleeper(collegeData(2017, { passing: pivotedPass }), {
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
    // Year 2020: 3 computeTeamTotals calls (rec/rush/pass); year 2021: 3 more.
    computeTeamTotals
      .mockReturnValueOnce({ LSU: { YDS: 3000, TD: 40 } }).mockReturnValueOnce({}).mockReturnValueOnce({})
      .mockReturnValueOnce({ LSU: { YDS: 2800, TD: 35 } }).mockReturnValueOnce({}).mockReturnValueOnce({})

    const rawCollegeData = {
      receiving: { 2020: pivRec2020, 2021: pivRec2021 },
      rushing:   { 2020: {}, 2021: {} },
      passing:   { 2020: {}, 2021: {} },
    }
    const result = matchCollegeToSleeper(rawCollegeData, {
      P_JC: { full_name: "Ja'Marr Chase", position: 'WR', college: 'LSU' },
    })

    expect(result['P_JC']).toHaveLength(2)
    expect(result['P_JC'][0].year).toBe(2020)
    expect(result['P_JC'][1].year).toBe(2021)
  })
})

// ---------------------------------------------------------------------------
// Id join, draft window, same-year collision guard (CR-31)
// ---------------------------------------------------------------------------

describe('matchCollegeToSleeper — player-id crosswalk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    computeTeamTotals.mockReset()
    computeTeamTotals.mockImplementation(() => ({}))
  })

  const row = (playerId, player, team) => ({ playerId, player, team, position: 'WR', YDS: 100, TD: 1 })
  const years = (byYear, cat = 'receiving') => {
    const ys = Object.keys(byYear).map(Number)
    const out = { receiving: {}, rushing: {}, passing: {} }
    for (const y of ys) { out.receiving[y] = {}; out.rushing[y] = {}; out.passing[y] = {} }
    for (const [y, rows] of Object.entries(byYear)) out[cat][y] = Object.fromEntries(rows.map(r => [r.playerId, r]))
    return out
  }
  const idx = bySleeper => ({ version: 1, bySleeper })
  const cw = (o = {}) => ({ name: null, cfbrefName: null, espnId: null, draftYear: null, draftOvr: null, undrafted: false, college: null, ...o })

  it('Caleb Williams shape: a same-name row after the draft year is not attached; the id season is', () => {
    const raw = years({ 2023: [row('4431611', 'Caleb Williams', 'USC')], 2025: [row('999', 'Caleb Williams', 'Pittsburgh')] })
    const players = { Q: { full_name: 'Caleb Williams', position: 'QB', college: 'USC' } }
    const withIds = matchCollegeToSleeper(raw, players, idx({ Q: cw({ espnId: '4431611', draftYear: 2024 }) }))
    expect(withIds.Q.map(s => s.year)).toEqual([2023])
    // today's behaviour (no crosswalk) attached both
    expect(matchCollegeToSleeper(raw, players).Q.map(s => s.year)).toEqual([2023, 2025])
  })

  it('A.J. Brown shape: a lone name candidate is still rejected outside the six years before the draft', () => {
    const raw = years({ 2018: [row('1', 'A.J. Brown', 'Ole Miss')], 2022: [row('2', 'A.J. Brown', 'Georgia Southern')] })
    const players = { B: { full_name: 'A.J. Brown', position: 'WR', college: 'Ole Miss' } }
    const r = matchCollegeToSleeper(raw, players, idx({ B: cw({ draftYear: 2019 }) }))
    expect(r.B.map(s => s.year)).toEqual([2018])
  })

  it('Bo Nix shape: id rows 2022–23, a different CFBD id with the same name 2019–21 attached by name', () => {
    const raw = {
      receiving: { 2019: {}, 2021: {}, 2022: {}, 2023: {} },
      rushing: { 2019: {}, 2021: {}, 2022: {}, 2023: {} },
      passing: {
        2019: { 4567218: row('4567218', 'Bo Nix', 'Auburn') }, 2021: { 4567218: row('4567218', 'Bo Nix', 'Auburn') },
        2022: { 4426338: row('4426338', 'Bo Nix', 'Oregon') }, 2023: { 4426338: row('4426338', 'Bo Nix', 'Oregon') },
      },
    }
    const players = { N: { full_name: 'Bo Nix', position: 'QB', college: 'Oregon' } }
    const r = matchCollegeToSleeper(raw, players, idx({ N: cw({ espnId: '4426338', draftYear: 2024, college: 'Oregon' }) }))
    expect(r.N.map(s => [s.year, s.matchedBy])).toEqual([[2019, 'name'], [2021, 'name'], [2022, 'id'], [2023, 'id']])
  })

  it('Isaiah Davis shape: a name row in a year where an id row exists in rushing only is rejected', () => {
    const raw = {
      receiving: { 2021: { 222: row('222', 'Isaiah Davis', 'UTSA') } },
      rushing: { 2021: { 111: row('111', 'Isaiah Davis', 'South Dakota State') } },
      passing: { 2021: {} },
    }
    const players = { D: { full_name: 'Isaiah Davis', position: 'RB', college: 'South Dakota State' } }
    const r = matchCollegeToSleeper(raw, players, idx({ D: cw({ espnId: '111', draftYear: 2024 }) }))
    expect(r.D).toBeUndefined()   // the rushing id row alone does not seed a receiving-driven entry; UTSA name row dropped
  })

  it('Josh Johnson shape: one sid, three same-name CFBD ids on different teams — only the college-agreeing one is kept', () => {
    const raw = years({ 2019: [row('1', 'Josh Johnson', 'Utah'), row('2', 'Josh Johnson', 'Ohio'), row('3', 'Josh Johnson', 'Tulane')] })
    const players = { J: { full_name: 'Josh Johnson', position: 'WR', college: 'Tulane' } }
    const r = matchCollegeToSleeper(raw, players)
    expect(r.J).toHaveLength(1)
    expect(r.J[0].team).toBe('Tulane')
  })

  it('Josh Johnson shape: when none (or several) of the teams agree, every name row of that sid is dropped', () => {
    const raw = years({ 2019: [row('1', 'Josh Johnson', 'Utah'), row('2', 'Josh Johnson', 'Ohio')] })
    expect(matchCollegeToSleeper(raw, { J: { full_name: 'Josh Johnson', position: 'WR', college: 'Tulane' } }).J).toBeUndefined()
  })

  it('Webb shape: two CFBD ids on the SAME team merge as today', () => {
    const raw = years({ 2022: [row('1', "La'Damian Webb", 'Rice'), row('2', "La'Damian Webb", 'Rice')] })
    const r = matchCollegeToSleeper(raw, { W: { full_name: "La'Damian Webb", position: 'RB', college: 'Rice' } })
    expect(r.W).toHaveLength(1)
  })

  it('Hartman shape: an espn id mapped to a sid whose names fail surnameAgrees is not an id match', () => {
    const raw = years({ 2022: [row('555', 'Sam Hartman', 'Notre Dame')] })
    const players = { G: { full_name: 'Richard Gouraige', position: 'WR', college: 'Florida' }, H: { full_name: 'Sam Hartman', position: 'QB', college: 'Notre Dame' } }
    // the crosswalk row of a skill-position sid carries someone else's espn id and no agreeing name
    const r = matchCollegeToSleeper(raw, players, idx({ G: cw({ espnId: '555', name: 'Richard Gouraige' }) }))
    expect(r.G).toBeUndefined()
    expect(r.H).toHaveLength(1)   // the real Hartman still comes by name
    expect(r.H[0].matchedBy).toBe('name')
  })

  it('Hibner shape: CFBD "Matthew", Sleeper "Matt", no crosswalk row — given-name variants match by name', () => {
    const raw = years({ 2022: [row('9', 'Matthew Hibner', 'Michigan')] })
    const r = matchCollegeToSleeper(raw, { M: { full_name: 'Matt Hibner', position: 'TE', college: 'SMU' } })
    expect(r.M).toHaveLength(1)
  })

  it('a fullback listed fantasy_positions [RB] (primary FB) is not in the name universe', () => {
    const raw = years({ 2025: [row('1', 'Taniela Tupou', 'USC')] })
    expect(matchCollegeToSleeper(raw, { F: { full_name: 'Taniela Tupou', position: 'FB', fantasy_positions: ['RB'], college: 'Colorado' } }, idx({}))).toEqual({})
  })

  it('matchedBy: id when any merged row came by id, name otherwise; playerIds null keeps today\'s name path', () => {
    const raw = years({ 2022: [row('7', 'Id Guy', 'Ohio State')], 2021: [row('8', 'Name Guy', 'Ohio State')] })
    const players = { I: { full_name: 'Id Guy', position: 'WR', college: 'Ohio State' }, N: { full_name: 'Name Guy', position: 'WR', college: 'Ohio State' } }
    const withIds = matchCollegeToSleeper(raw, players, idx({ I: cw({ espnId: '7' }) }))
    expect(withIds.I[0].matchedBy).toBe('id')
    expect(withIds.N[0].matchedBy).toBe('name')
    const nameOnly = matchCollegeToSleeper(raw, players)
    expect(nameOnly.I[0].matchedBy).toBe('name')
  })

  it('the crosswalk and cfbref names key a Sleeper player only when they share a surname with full_name', () => {
    const raw = years({ 2022: [row('1', 'Keandre Lambert', 'Penn State'), row('2', 'Wrong Person', 'Penn State')] })
    const players = { L: { full_name: 'KeAndre Lambert-Smith', position: 'WR', college: 'Auburn' } }
    const ok = matchCollegeToSleeper(raw, players, idx({ L: cw({ name: 'Keandre Lambert', draftYear: 2025 }) }))
    expect(ok.L).toHaveLength(1)
    const bad = matchCollegeToSleeper(raw, players, idx({ L: cw({ name: 'Wrong Person', draftYear: 2025 }) }))
    expect(bad.L).toBeUndefined()   // the rejected crosswalk name is not a key, and CFBD's short form is not a variant
  })
})
