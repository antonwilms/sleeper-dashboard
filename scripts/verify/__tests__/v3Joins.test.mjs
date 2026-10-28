import { describe, it, expect } from 'vitest'
import { topKtcRows, buildJoinDump, diagnoseKtc, diagnoseDraft, diagnoseCollege } from '../lib/v3Joins.mjs'
import { matchNflDraftToSleeper } from '../../../src/utils/nflDraftMatch.js'
import { matchCollegeToSleeper } from '../../../src/utils/collegeMatch.js'
import { buildPlayerIdIndex } from '../../../src/utils/playerIdCrosswalk.js'
import { matchKTCToSleeper } from '../../../src/utils/ktcMatch.js'

const p = (full_name, position, team = 'DET', extra = {}) => ({ full_name, position, team, ...extra })

describe('diagnoseKtc', () => {
  it('flags ktc-ambiguous-unresolved (no sid) when several candidates and none is on the KTC team', () => {
    const playersMap = { 1: p('Josh Allen', 'QB', 'BUF'), 2: p('Josh Allen', 'QB', 'FA') }
    const rows = [{ name: 'Josh Allen', team: 'DEN', position: 'QB', value: 9000 }]
    const top = topKtcRows(rows)
    const { flagged, resolved } = diagnoseKtc(top, rows, playersMap, matchKTCToSleeper(rows, playersMap))
    expect(flagged[0].reasons).toEqual(['ktc-ambiguous-unresolved'])
    expect(flagged[0].sid).toBeNull()
    expect(flagged[0].evidence.candidates).toEqual(['1', '2'])
    expect(resolved.get(1)).toBeNull()
  })
  it('reports a team-resolved match as ktc-team-fallback with its path (info, not a defect)', () => {
    const playersMap = { 1: p('Josh Allen', 'QB', 'BUF'), 2: p('Josh Allen', 'QB', 'FA') }
    const rows = [{ name: 'Josh Allen', team: 'BUF', position: 'QB', value: 9000 }]
    const { flagged, resolved, paths } = diagnoseKtc(topKtcRows(rows), rows, playersMap, matchKTCToSleeper(rows, playersMap))
    expect(flagged[0].reasons).toEqual(['ktc-team-fallback'])
    expect(flagged[0].evidence.path).toBe('exact-team')
    expect(resolved.get(1)).toBe('1')
    expect(paths.get(1)).toBe('exact-team')
  })
  it('flags ktc-unmatched with a same-last-token hint', () => {
    const playersMap = { 1: p('Jaylen Warren', 'RB', 'PIT') }
    const rows = [{ name: 'Jaylon Warren', team: 'PIT', position: 'RB', value: 5000 }]
    const { flagged } = diagnoseKtc(topKtcRows(rows), rows, playersMap, new Map())
    expect(flagged[0].reasons).toEqual(['ktc-unmatched'])
    expect(flagged[0].evidence.hint[0].name).toBe('Jaylen Warren')
  })
  it('flags ktc-team-disagree after the LVR→LV alias, but not for matching aliased teams', () => {
    const playersMap = { 1: p('Aidan Smith', 'WR', 'LV'), 2: p('Bo Jones', 'WR', 'DEN'), 3: p('Cy Young', 'WR', 'KC') }
    const rows = [
      { name: 'Aidan Smith', team: 'LVR', position: 'WR', value: 9000 },
      { name: 'Cy Young', team: 'KCC', position: 'WR', value: 7000 },
      { name: 'Bo Jones', team: 'KC', position: 'WR', value: 8000 },
    ]
    const { flagged } = diagnoseKtc(topKtcRows(rows), rows, playersMap, matchKTCToSleeper(rows, playersMap))
    expect(flagged.map(f => f.name)).toEqual(['Bo Jones'])
    expect(flagged[0].reasons).toEqual(['ktc-team-disagree'])
  })
  it('flags ktc-duplicate-target when two KTC rows resolve to one sid', () => {
    const playersMap = { 1: p('Jake Ball', 'TE', 'NE') }
    const rows = [
      { name: 'Jake Ball', team: 'NE', position: 'TE', value: 4000 },
      { name: 'Jake Ball Jr.', team: 'NE', position: 'TE', value: 3000 },
    ]
    const { flagged } = diagnoseKtc(topKtcRows(rows), rows, playersMap, new Map())
    expect(flagged.every(f => f.reasons.includes('ktc-duplicate-target'))).toBe(true)
  })
})

describe('buildJoinDump (ktc paths)', () => {
  it('carries the resolver path per rank', () => {
    const playersMap = { 1: p('Aidan Smith', 'WR', 'LV') }
    const rows = [{ name: 'Aidan Smith', team: 'LVR', position: 'WR', value: 9000 }]
    const top = topKtcRows(rows)
    const { resolved, paths } = diagnoseKtc(top, rows, playersMap, null)
    expect(buildJoinDump(top, resolved, {}, {}, paths)[0]).toMatchObject({ sid: '1', ktcPath: 'exact' })
  })
})

describe('diagnoseDraft', () => {
  const crosswalk = (o) => ({ bySleeper: { 77: { gsisId: 'g1', undrafted: false, draftYear: 2023, draftRound: 5, draftPick: 20, draftOvr: 160, college: 'Notre Dame', ...o } }, ids: { g1: { name: 'Robbie Ouzts' } } })
  const top = [{ rank: 1, name: 'Robbie Ouzts', team: 'SEA', position: 'RB', value: 100 }]
  const resolved = new Map([[1, '77']])
  const playersMap = { 77: p('Robbie Ouzts', 'RB', 'SEA', { college: 'Alabama' }) }
  const picksByYear = { 2023: [{ year: 2023, round: 5, pick: 160, fullName: 'Robbie Ouzts', position: 'TE', college: 'Alabama' }] }

  it('an Ouzts-shaped miss (pick TE, Sleeper RB, crosswalk drafted) yields draft-missing/position-incompatible', () => {
    const drafts = matchNflDraftToSleeper(picksByYear, playersMap)
    expect(drafts['77']).toBeUndefined()   // the app's known positionsCompatible miss
    const { flagged } = diagnoseDraft(top, resolved, playersMap, picksByYear, drafts, crosswalk())
    expect(flagged[0].reasons).toEqual(['draft-missing'])
    expect(flagged[0].evidence.subReason).toBe('position-incompatible')
  })
  it('with the crosswalk index the Ouzts-shaped hybrid is matched by id and not flagged', () => {
    const idx = buildPlayerIdIndex(crosswalk())
    const drafts = matchNflDraftToSleeper(picksByYear, playersMap, idx)
    expect(drafts['77']).toMatchObject({ year: 2023, pick: 160 })
    expect(diagnoseDraft(top, resolved, playersMap, picksByYear, drafts, crosswalk()).flagged).toEqual([])
  })
  it('a 2016 pick yields draft-out-of-window and no draft-missing', () => {
    const { flagged, info } = diagnoseDraft(top, resolved, playersMap, picksByYear, {}, crosswalk({ draftYear: 2016 }))
    expect(flagged[0].reasons).toEqual(['draft-out-of-window'])
    expect(info.outOfWindow).toHaveLength(1)
  })
  it('flags draft-disagree when the matched round differs from the crosswalk', () => {
    const drafts = { 77: { year: 2023, round: 3, pick: 160 } }
    const { flagged } = diagnoseDraft(top, resolved, playersMap, picksByYear, drafts, crosswalk())
    expect(flagged[0].reasons).toEqual(['draft-disagree'])
  })
  it('compares the overall pick to crosswalk draftOvr, not the in-round draftPick', () => {
    const drafts = { 77: { year: 2023, round: 5, pick: 160 } }
    expect(diagnoseDraft(top, resolved, playersMap, picksByYear, drafts, crosswalk()).flagged).toEqual([])
  })
})

describe('diagnoseCollege', () => {
  const playersMap = { 5: p('Rush Only', 'RB', 'DAL', { college: 'Texas', years_exp: 2 }) }
  const top = [{ rank: 1, name: 'Rush Only', team: 'DAL', position: 'RB', value: 100 }]
  const resolved = new Map([[1, '5']])
  const crosswalk = { bySleeper: { 5: { draftYear: 2024, college: 'Texas' } }, ids: {} }

  it('a rushing-only CFBD player yields college-rushing-only (and college-none) and counts the RB', () => {
    const rawCollege = {
      receiving: { 2023: {} },
      rushing: { 2023: { a1: { playerId: 'a1', player: 'Rush Only', team: 'Texas' } } },
      passing: { 2023: {} },
    }
    const matches = matchCollegeToSleeper(rawCollege, playersMap)
    expect(matches['5']).toBeUndefined()
    const { flagged, rushingOnlyRbs } = diagnoseCollege(top, resolved, playersMap, matches, rawCollege, crosswalk, 2026)
    expect(flagged[0].reasons).toEqual(['college-none', 'college-rushing-only'])
    expect(rushingOnlyRbs).toHaveLength(1)
  })
  it('flags college-after-draft when a matched season is not before the draft year', () => {
    const rawCollege = { receiving: { 2024: { b1: { playerId: 'b1', player: 'Rush Only', team: 'Texas' } } }, rushing: {}, passing: {} }
    const matches = matchCollegeToSleeper(rawCollege, playersMap)
    const { flagged } = diagnoseCollege(top, resolved, playersMap, matches, rawCollege, crosswalk, 2026)
    expect(flagged[0].reasons).toEqual(['college-after-draft'])
  })
})

describe('diagnoseCollege — matchedBy rule', () => {
  const playersMap = { 5: p('Same Name', 'WR', 'DAL', { college: 'Texas', years_exp: 5 }) }
  const top = [{ rank: 1, name: 'Same Name', team: 'DAL', position: 'WR', value: 100 }]
  const resolved = new Map([[1, '5']])
  const crosswalk = { bySleeper: { 5: { draftYear: 2024, college: 'Texas' } }, ids: {} }
  const row = (id, team) => ({ playerId: id, player: 'Same Name', team })
  const raw = { receiving: { 2022: { a1: row('a1', 'Ohio State'), a2: row('a2', 'Texas') } }, rushing: {}, passing: {} }

  it('an id-matched season is never college-disagree or college-name-collision', () => {
    const matches = { 5: [{ year: 2022, team: 'Ohio State', matchedBy: 'id' }] }
    expect(diagnoseCollege(top, resolved, playersMap, matches, raw, crosswalk, 2026).flagged).toEqual([])
  })
  it('an id-anchored player is not college-disagree for name-matched re-issued-id seasons (Bo Nix shape)', () => {
    const nixMap = { 7: p('Bo Nix', 'QB', 'DEN', { college: 'Oregon', years_exp: 2 }) }
    const nixTop = [{ rank: 1, name: 'Bo Nix', team: 'DEN', position: 'QB', value: 100 }]
    const nixCw = { bySleeper: { 7: { draftYear: 2024, college: 'Oregon' } }, ids: {} }
    const matches = { 7: [
      { year: 2019, team: 'Auburn', matchedBy: 'name' }, { year: 2020, team: 'Auburn', matchedBy: 'name' }, { year: 2021, team: 'Auburn', matchedBy: 'name' },
      { year: 2022, team: 'Oregon', matchedBy: 'id' }, { year: 2023, team: 'Oregon', matchedBy: 'id' },
    ] }
    const empty = { receiving: {}, rushing: {}, passing: {} }
    expect(diagnoseCollege(nixTop, new Map([[1, '7']]), nixMap, matches, empty, nixCw, 2026).flagged).toEqual([])
  })
  it('the same season name-matched is flagged for both', () => {
    const matches = { 5: [{ year: 2022, team: 'Ohio State', matchedBy: 'name' }] }
    const { flagged } = diagnoseCollege(top, resolved, playersMap, matches, raw, crosswalk, 2026)
    expect(flagged[0].reasons).toEqual(['college-disagree', 'college-name-collision'])
  })
})
