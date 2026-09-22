// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { LineupTable } from './LineupTable'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function row(overrides = {}) {
  return {
    slot: 'QB', player_id: 'p1', name: 'Player One', position: 'QB', team: 'KC', role: null,
    opponent: 'DEN', opponentEra: 'DEN', bye: false, allows: null, allowsRank: null, weight: null,
    usage: null, form: [null, null, null], points: 12.3,
    ...overrides,
  }
}

function emptyRow(slot = 'RB') {
  return {
    slot, player_id: null, name: null, position: null, team: null, role: null,
    opponent: null, opponentEra: null, bye: false, allows: null, allowsRank: null,
    weight: null, usage: null, form: [null, null, null], points: null,
  }
}

describe('LineupTable — PROJ rendering (weekly-decision-2a-lineup-truth.md §7)', () => {
  it('an unprojected bench row renders PROJ "—", and a real-zero row renders "0.0"', () => {
    const bench = [
      row({ slot: 'BN', player_id: 'unproj', name: 'Unprojected', points: null }),
      row({ slot: 'BN', player_id: 'zero', name: 'Real Zero', points: 0 }),
    ]
    const { container } = render(<LineupTable starters={[]} bench={bench} />)
    // Last <td> of each data row is the PROJ cell — target it directly so the ALLOWS column's own
    // unconditional `—` (allows: null on both fixture rows) can't make this pass spuriously.
    const dataRows = [...container.querySelectorAll('tbody tr')].filter(tr => tr.textContent.includes('Unprojected') || tr.textContent.includes('Real Zero'))
    const projCellFor = name => dataRows.find(tr => tr.textContent.includes(name)).querySelector('td:last-child').textContent
    expect(projCellFor('Unprojected')).toBe('—')
    expect(projCellFor('Real Zero')).toBe('0.0')
  })
})

describe('LineupTable — empty starter row and the BENCH divider', () => {
  it('an empty starter row renders "Empty" in the player cell', () => {
    const { getByText } = render(<LineupTable starters={[emptyRow('RB')]} bench={[]} />)
    expect(getByText('Empty')).toBeInTheDocument()
  })

  it('the BENCH divider renders only when the bench is non-empty', () => {
    const withBench = render(<LineupTable starters={[row()]} bench={[row({ slot: 'BN', player_id: 'b1' })]} />)
    expect(withBench.getByText('BENCH · 1')).toBeInTheDocument()
    withBench.unmount()

    const withoutBench = render(<LineupTable starters={[row()]} bench={[]} />)
    expect(withoutBench.queryByText(/BENCH ·/)).toBeNull()
  })
})

describe('LineupTable — subtitle', () => {
  it('states starters-as-set, not projection framing', () => {
    const { getByText } = render(<LineupTable starters={[row(), row({ player_id: 'p2' })]} bench={[]} />)
    expect(getByText(/2 slots as set in Sleeper, then the bench/)).toBeInTheDocument()
  })
})

describe('LineupTable — prior-season SNAP sub-line (weekly-decision-2-panels.md §1a)', () => {
  it('a bench row gets its sub-line', () => {
    const bench = [row({ slot: 'BN', player_id: 'b1', usage: { rush: null, target: null, touch: null, snap: 0.6 } })]
    const { getByText } = render(
      <LineupTable starters={[]} bench={bench} priorSnapByPlayer={{ b1: 0.42 }} />
    )
    expect(getByText('42%')).toBeInTheDocument()
  })

  it('only SNAP renders a grey value — RUSH/TARGET/TOUCH render nothing beneath, no dash', () => {
    const starters = [row({ usage: { rush: 0.3, target: 0.2, touch: 0.25, snap: 0.6 } })]
    const { container, queryByText } = render(
      <LineupTable starters={starters} bench={[]} priorSnapByPlayer={{ p1: 0.42 }} />
    )
    // Only one sub-line value anywhere in the row — RUSH/TARGET/TOUCH have no equivalent prop, so
    // no grey sub-line can appear beneath them.
    expect(container.querySelectorAll('[data-testid="prior-share"]').length).toBe(1)
    expect(queryByText('30%')).toBeInTheDocument() // the RUSH main value itself renders fine
  })

  it('an absent prior share renders nothing beneath (not missing player, not missing prop)', () => {
    const starters = [row({ usage: { rush: null, target: null, touch: null, snap: 0.6 } })]
    const { container } = render(<LineupTable starters={starters} bench={[]} priorSnapByPlayer={{ p1: null }} />)
    expect(container.querySelectorAll('[data-testid="prior-share"]').length).toBe(0)
  })

  it('an empty starter row renders no sub-line', () => {
    const { container } = render(<LineupTable starters={[emptyRow('RB')]} bench={[]} priorSnapByPlayer={{}} />)
    expect(container.querySelectorAll('[data-testid="prior-share"]').length).toBe(0)
  })
})
