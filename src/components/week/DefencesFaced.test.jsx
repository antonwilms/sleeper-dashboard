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

function defRow(gamesPlayed, statsOverrides = {}) {
  return { gamesPlayed, stats: { fan_pts_allow_qb: 20, ...statsOverrides } }
}

describe('DefencesFaced', () => {
  it('renders both halves when present', () => {
    const starters = [starterRow()]
    const priorRows = { DEN: defRow(10, { fan_pts_allow_qb: 15 }) }
    const currentRows = { DEN: defRow(2, { fan_pts_allow_qb: 26 }) }
    const { getByTestId } = render(<DefencesFaced starters={starters} priorRows={priorRows} currentRows={currentRows} />)
    expect(getByTestId('defences-prior').textContent).toContain('1.5')
    expect(getByTestId('defences-current').textContent).toContain('13.0')
  })

  it('current half absent -> —; prior absent -> —; neither -> the row still renders', () => {
    const starters = [starterRow()]
    const { getByTestId } = render(<DefencesFaced starters={starters} priorRows={null} currentRows={null} />)
    expect(getByTestId('defences-prior').textContent).toContain('—')
    expect(getByTestId('defences-current').textContent).toContain('—')
    expect(getByTestId('defences-row-p1')).toBeInTheDocument()
  })

  it('an LAR opponent reads the Sleeper-keyed DEF row via opponent, and the era-keyed value via opponentEra is NOT used for the raw halves', () => {
    const starters = [starterRow({ opponent: 'LAR', opponentEra: 'LA' })]
    // Row maps are Sleeper-keyed (LAR only — there is no LA key in this fixture). If the panel
    // passed opponentEra ('LA') into computeFpaPerGame instead of opponent ('LAR'), the lookup
    // would miss entirely and both halves would read `—` instead of the values below.
    const priorRows = { LAR: defRow(10, { fan_pts_allow_qb: 15 }) }
    const currentRows = { LAR: defRow(2, { fan_pts_allow_qb: 26 }) }
    const { getByTestId } = render(<DefencesFaced starters={starters} priorRows={priorRows} currentRows={currentRows} />)
    expect(getByTestId('defences-prior').textContent).toContain('1.5')
    expect(getByTestId('defences-current').textContent).toContain('13.0')
  })

  it('an empty starter slot gets no row', () => {
    const starters = [starterRow(), emptyStarterRow('RB')]
    const { queryAllByTestId } = render(<DefencesFaced starters={starters} priorRows={{}} currentRows={{}} />)
    expect(queryAllByTestId(/^defences-row-/).length).toBe(1)
  })

  it('a defence with >= 9 current games shows its prior cell muted, labelled "not blended"', () => {
    const starters = [starterRow({ weight: 1 })]
    const priorRows = { DEN: defRow(10, { fan_pts_allow_qb: 15 }) }
    const currentRows = { DEN: defRow(FPA_PRIOR_DROP_GAMES, { fan_pts_allow_qb: 180 }) }
    const { getByTestId, getByText } = render(<DefencesFaced starters={starters} priorRows={priorRows} currentRows={currentRows} />)
    expect(getByTestId('defences-prior').textContent).toContain('1.5')
    expect(getByText('not blended')).toBeInTheDocument()
  })

  it('each row shows its own weight; the header has no single percentage', () => {
    const starters = [starterRow({ weight: 0.25 })]
    const { getByTestId, container } = render(<DefencesFaced starters={starters} priorRows={{}} currentRows={{}} />)
    expect(getByTestId('defences-blended').textContent).toContain('25%')
    const header = container.querySelector('.border-b');
    expect(header.textContent).not.toMatch(/\d+%/)
    expect(header.textContent).toContain('k 3')
  })
})
