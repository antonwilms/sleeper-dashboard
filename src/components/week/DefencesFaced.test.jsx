// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { DefencesFaced } from './DefencesFaced'
import { FPA_PRIOR_DROP_GAMES } from '../../utils/opponentStrength'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function starterRow(overrides = {}) {
  return {
    slot: 'QB', player_id: 'p1', name: 'Player One', position: 'QB', team: 'KC',
    opponent: 'DEN', opponentEra: 'DEN', bye: false, allows: 18.4, allowsRank: 5, weight: 0.6,
    usage: null, form: [null, null, null], points: 12.3,
    ...overrides,
  }
}

function emptyStarterRow(slot = 'RB') {
  return {
    slot, player_id: null, name: null, position: null, team: null,
    opponent: null, opponentEra: null, bye: false, allows: null, allowsRank: null, weight: null,
    usage: null, form: [null, null, null], points: null,
  }
}

// A `teams` map entry: season totals as buildDefenceSeasonAllowed returns them.
function allowedTeam({ gp, qb = 0, passYd = 0, rushYd = 0 }) {
  return { gp, pts: { qb, rb: 0, wr: 0, te: 0 }, passYd, rushYd }
}

describe('DefencesFaced', () => {
  it('renders both halves when present', () => {
    const starters = [starterRow()]
    const priorAllowed = { DEN: allowedTeam({ gp: 10, qb: 150 }) }
    const currentAllowed = { DEN: allowedTeam({ gp: 2, qb: 26 }) }
    const { getByTestId } = render(<DefencesFaced starters={starters} priorAllowed={priorAllowed} currentAllowed={currentAllowed} />)
    expect(getByTestId('defences-prior').textContent).toContain('15.0')
    expect(getByTestId('defences-current').textContent).toContain('13.0')
  })

  it('current half absent -> —; prior absent -> —; neither -> the row still renders', () => {
    const { getByTestId } = render(<DefencesFaced starters={[starterRow()]} />)
    expect(getByTestId('defences-prior').textContent).toContain('—')
    expect(getByTestId('defences-current').textContent).toContain('—')
    expect(getByTestId('defences-row-p1')).toBeInTheDocument()
  })

  it('joins on the era key: an LAR opponent reads the LA-keyed maps via opponentEra', () => {
    const starters = [starterRow({ opponent: 'LAR', opponentEra: 'LA' })]
    // Maps are era-keyed (LA only — no LAR key). If the panel keyed on `opponent` ('LAR'), every
    // cell below would read `—`.
    const priorAllowed = { LA: allowedTeam({ gp: 10, qb: 150, passYd: 2000, rushYd: 1000 }) }
    const currentAllowed = { LA: allowedTeam({ gp: 2, qb: 26, passYd: 500, rushYd: 220 }) }
    const priorRecords = { LA: { w: 7, l: 3, t: 0, lastWeek: 10, unscored: 0 } }
    const currentRecords = { LA: { w: 1, l: 1, t: 0, lastWeek: 2, unscored: 0 } }
    const { getByTestId } = render(<DefencesFaced
      starters={starters} priorAllowed={priorAllowed} currentAllowed={currentAllowed}
      priorRecords={priorRecords} currentRecords={currentRecords} />)
    expect(getByTestId('defences-prior').textContent).toContain('15.0')
    expect(getByTestId('defences-current').textContent).toContain('13.0')
    expect(getByTestId('defences-pass').textContent).toContain('250')
    expect(getByTestId('defences-record').textContent).toContain('1-1')
    // the visible VS cell stays in the Sleeper domain
    expect(getByTestId('defences-row-p1').textContent).toContain('LAR')
  })

  it('an empty starter slot gets no row', () => {
    const { queryAllByTestId } = render(<DefencesFaced starters={[starterRow(), emptyStarterRow('RB')]} />)
    expect(queryAllByTestId(/^defences-row-/).length).toBe(1)
  })

  it('a defence with >= 9 current games shows its prior cell muted, labelled "not blended"', () => {
    const starters = [starterRow({ weight: 1 })]
    const priorAllowed = { DEN: allowedTeam({ gp: 10, qb: 150 }) }
    const currentAllowed = { DEN: allowedTeam({ gp: FPA_PRIOR_DROP_GAMES, qb: 180 }) }
    const { getByTestId, getByText } = render(<DefencesFaced starters={starters} priorAllowed={priorAllowed} currentAllowed={currentAllowed} />)
    expect(getByTestId('defences-prior').textContent).toContain('15.0')
    expect(getByText('not blended')).toBeInTheDocument()
  })

  it('each row shows its own weight; the header has no single percentage', () => {
    const { getByTestId, container } = render(<DefencesFaced starters={[starterRow({ weight: 0.25 })]} />)
    expect(getByTestId('defences-blended').textContent).toContain('25%')
    const header = container.querySelector('.border-b')
    expect(header.textContent).not.toMatch(/\d+%/)
    expect(header.textContent).toContain('k 3')
  })

  it('pass / rush cells: current value on top, prior below, rounded to whole yards', () => {
    const priorAllowed = { DEN: allowedTeam({ gp: 17, passYd: 3332, rushYd: 1802 }) }     // 196 / 106
    const currentAllowed = { DEN: allowedTeam({ gp: 3, passYd: 534, rushYd: 300 }) }       // 178 / 100
    const { getByTestId } = render(<DefencesFaced starters={[starterRow()]} priorAllowed={priorAllowed} currentAllowed={currentAllowed} />)
    const pass = getByTestId('defences-pass')
    expect(pass.children[0].textContent).toBe('178')
    expect(pass.children[1].textContent).toBe('196')
    const rush = getByTestId('defences-rush')
    expect(rush.children[0].textContent).toBe('100')
    expect(rush.children[1].textContent).toBe('106')
  })

  it('record: W-L, and W-L-T only when there is a tie', () => {
    const priorRecords = { DEN: { w: 6, l: 11, t: 0, lastWeek: 18, unscored: 0 } }
    const currentRecords = { DEN: { w: 2, l: 1, t: 1, lastWeek: 4, unscored: 0 } }
    const { getByTestId } = render(<DefencesFaced starters={[starterRow()]} priorRecords={priorRecords} currentRecords={currentRecords} />)
    const rec = getByTestId('defences-record')
    expect(rec.children[0].textContent).toBe('2-1-1')
    expect(rec.children[1].textContent).toBe('6-11')
  })

  it('"thru wk N" appears only when the current record trails (unscored > 0); a bye-week team (unscored 0) shows none', () => {
    const trailing = { DEN: { w: 2, l: 0, t: 0, lastWeek: 2, unscored: 1 } }
    const { getByTestId, unmount } = render(<DefencesFaced starters={[starterRow()]} currentRecords={trailing} />)
    expect(getByTestId('defences-record').textContent).toContain('2-0 thru wk 2')
    unmount()

    const onBye = { DEN: { w: 2, l: 0, t: 0, lastWeek: 2, unscored: 0 } }
    const second = render(<DefencesFaced starters={[starterRow()]} currentRecords={onBye} />)
    expect(second.getByTestId('defences-record').textContent).not.toContain('thru wk')
  })

  it('a trailing record with nothing scored reads "no wk scored", not 0-0', () => {
    const currentRecords = { DEN: { w: 0, l: 0, t: 0, lastWeek: 0, unscored: 2 } }
    const { getByTestId } = render(<DefencesFaced starters={[starterRow()]} currentRecords={currentRecords} />)
    const text = getByTestId('defences-record').textContent
    expect(text).toContain('no wk scored')
    expect(text).not.toContain('0-0')
  })

  it('a bye row renders — in the three new cells', () => {
    const starters = [starterRow({ bye: true, opponent: null, opponentEra: null })]
    const { getByTestId } = render(<DefencesFaced
      starters={starters} priorAllowed={{ DEN: allowedTeam({ gp: 1, passYd: 100 }) }}
      currentRecords={{ DEN: { w: 1, l: 0, t: 0, lastWeek: 1, unscored: 0 } }} />)
    for (const id of ['defences-pass', 'defences-rush', 'defences-record']) {
      expect(getByTestId(id).textContent).toBe('——')
    }
  })

  it('failed weeks add one footer line per season, singular/plural worded', () => {
    const { getAllByTestId } = render(<DefencesFaced
      starters={[starterRow()]}
      failedWeeks={[{ season: 2025, weeks: [4] }, { season: 2026, weeks: [1, 2] }]} />)
    const lines = getAllByTestId('defences-failed-weeks').map(n => n.textContent)
    expect(lines).toEqual([
      'Week 4 of 2025 failed to load from Sleeper and is left out of these figures.',
      'Weeks 1, 2 of 2026 failed to load from Sleeper and are left out of these figures.',
    ])
  })

  it('no failed weeks -> no failed-weeks line', () => {
    const { queryAllByTestId } = render(<DefencesFaced starters={[starterRow()]} failedWeeks={[]} />)
    expect(queryAllByTestId('defences-failed-weeks')).toEqual([])
  })
})
