import { describe, it, expect } from 'vitest'
import { ktcNormalizeName, topKtcRows, diagnoseKtc, diagnoseDraft, diagnoseCollege } from '../lib/v3Joins.mjs'
import { matchNflDraftToSleeper } from '../../../src/utils/nflDraftMatch.js'
import { matchCollegeToSleeper } from '../../../src/utils/collegeMatch.js'
import { matchKTCToSleeper } from '../../../src/utils/ktcMatch.js'

describe('ktcNormalizeName copy', () => {
  const cases = [
    ["D'Andre Swift", 'dandre swift'],
    ['Marvin Harrison Jr.', 'marvin harrison'],
    ['Kenneth Walker III', 'kenneth walker'],
    ['Amon-Ra St. Brown', 'amon ra st brown'],
    ['Patrick Mahomes II', 'patrick mahomes'],
    ['Odell Beckham Jr', 'odell beckham'],
    ['Travis Etienne Jr.', 'travis etienne'],
    ['  Josh   Allen ', 'josh allen'],
    ['Brian Robinson Jr.', 'brian robinson'],
    ['A.J. Brown', 'a j brown'],
  ]
  it.each(cases)('%s → %s', (input, expected) => {
    expect(ktcNormalizeName(input)).toBe(expected)
  })
})

const p = (full_name, position, team = 'DET', extra = {}) => ({ full_name, position, team, ...extra })

describe('diagnoseKtc', () => {
  it('flags ktc-ambiguous-first-taken when a name|position key has two candidates', () => {
    const playersMap = { 1: p('Josh Allen', 'QB', 'BUF'), 2: p('Josh Allen', 'QB', 'FA') }
    const rows = [{ name: 'Josh Allen', team: 'BUF', position: 'QB', value: 9000 }]
    const top = topKtcRows(rows)
    const { flagged } = diagnoseKtc(top, rows, playersMap, matchKTCToSleeper(rows, playersMap))
    expect(flagged[0].reasons).toContain('ktc-ambiguous-first-taken')
    expect(flagged[0].sid).toBe('1')
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
