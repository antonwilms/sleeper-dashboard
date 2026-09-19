// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { WeakestSlots } from './WeakestSlots'
import { buildWeakestSlots } from '../../utils/lineup'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const mkRow = (slot, slotIndex, position, mine, median, name = `${slot}${slotIndex}`) => ({
  slot, slotIndex, player_id: `p${slotIndex}`, name, position, mine, median, loss: median - mine,
})

describe('WeakestSlots — design worked example (§2.4)', () => {
  const rows = [
    mkRow('RB', 0, 'RB', 11.8, 15.4, 'RB One'),
    mkRow('RB', 1, 'RB', 12.1, 14.3, 'RB Two'),
    mkRow('FLEX', 2, 'WR', 10.9, 12.6, 'Flex Guy'),
    mkRow('SUPER_FLEX', 3, 'QB', 15.8, 17.1, 'SF Guy'),
  ]
  const slots = [{ slot: 'RB' }, { slot: 'RB' }, { slot: 'FLEX' }, { slot: 'SUPER_FLEX' }]

  it('reproduces the design summary verbatim', () => {
    render(<WeakestSlots rows={rows} slots={slots} />)
    expect(screen.getByTestId('weak-summary').textContent).toBe(
      'Two running backs cost you about 6 points a week against a median lineup. Everything else is within a field goal.'
    )
  })

  it('each row shows its loss and mine-vs-median', () => {
    render(<WeakestSlots rows={rows} slots={slots} />)
    expect(screen.getByTestId('weak-row-0').textContent).toContain('−3.6 ppg')
    expect(screen.getByTestId('weak-row-0').textContent).toContain('11.8 vs med 15.4')
    expect(screen.getByTestId('weak-row-3').textContent).toContain('−1.3 ppg')
    expect(screen.getByTestId('weak-row-3').textContent).toContain('15.8 vs med 17.1')
  })
})

describe('WeakestSlots — row content', () => {
  const rows = [mkRow('RB', 0, 'RB', 11.8, 15.4, 'RB One')]
  const slots = [{ slot: 'RB' }]

  it('shows −loss ppg and mine vs med median', () => {
    render(<WeakestSlots rows={rows} slots={slots} />)
    const row0 = screen.getByTestId('weak-row-0')
    expect(row0.textContent).toContain('−3.6 ppg')
    expect(row0.textContent).toContain('11.8 vs med 15.4')
  })
})

describe('WeakestSlots — empty state (healthy)', () => {
  it('rows = [] built from a lineup that loses nowhere, non-empty slots', () => {
    const leagueLineups = [
      { rosterId: 1, teamName: 'Me', proj: { slots: [
        { slot: 'QB', player_id: 'q1', name: 'Q1', position: 'QB', points: 30 },
      ] } },
      { rosterId: 2, teamName: 'Them', proj: { slots: [
        { slot: 'QB', player_id: 'q2', name: 'Q2', position: 'QB', points: 10 },
      ] } },
    ]
    const result = buildWeakestSlots(leagueLineups, 1)
    expect(result).toEqual([])
    const slots = leagueLineups[0].proj.slots

    render(<WeakestSlots rows={result} slots={slots} />)
    expect(screen.getByTestId('weak-summary').textContent).toBe(
      'No starting slot is losing points to a median lineup.'
    )
    expect(screen.queryAllByTestId(/weak-row-/).length).toBe(0)
    expect(document.querySelectorAll('[data-testid^="weak-row-"]').length).toBe(0)
  })
})

describe('WeakestSlots — unloaded vs healthy', () => {
  it('rows = [] and slots = [] -> the unloaded sentence, exactly one weak-summary node', () => {
    render(<WeakestSlots rows={[]} slots={[]} />)
    const summaries = screen.getAllByTestId('weak-summary')
    expect(summaries).toHaveLength(1)
    expect(summaries[0].textContent).toBe('No starting lineup — league slots or roster not loaded.')
    expect(screen.queryByText('No starting slot is losing points to a median lineup.')).not.toBeInTheDocument()
  })
})

describe('WeakestSlots — sub-point losses', () => {
  it('total rounds below 1 -> the "as much as a point a week" line', () => {
    const rows = [mkRow('RB', 0, 'RB', 10, 10.25), mkRow('WR', 1, 'WR', 8, 8.2)]
    const slots = [{ slot: 'RB' }, { slot: 'WR' }]
    render(<WeakestSlots rows={rows} slots={slots} />)
    expect(screen.getByTestId('weak-summary').textContent).toBe(
      'No starting slot costs you as much as a point a week against a median lineup.'
    )
  })
})

describe('WeakestSlots — row cap', () => {
  it('six losing rows -> four rendered rows, summary uses only those four', () => {
    const rows = [
      mkRow('RB', 0, 'RB', 0, 10),
      mkRow('RB', 1, 'RB', 2, 10),
      mkRow('WR', 2, 'WR', 4, 10),
      mkRow('WR', 3, 'WR', 6, 10),
      mkRow('TE', 4, 'TE', 8, 10),
      mkRow('QB', 5, 'QB', 9, 10),
    ]
    const slots = Array.from({ length: 6 }, (_, i) => ({ slot: rows[i].slot }))
    render(<WeakestSlots rows={rows} slots={slots} />)
    const rendered = document.querySelectorAll('[data-testid^="weak-row-"]')
    expect(rendered.length).toBe(4)
    // Rendered rows (top four by loss): losses 10,8,6,4; total 28, threshold 16.8.
    // cumulative 10 (no), 18 (yes) -> P = first two (RB,RB), cost = round(18) = 18.
    // R = remaining two rendered rows (6,4); max 6 >= 3 -> tail names the remainder (10 pts).
    expect(screen.getByTestId('weak-summary').textContent).toBe(
      'Two running backs cost you about 18 points a week against a median lineup. The rest adds another 10 points a week.'
    )
  })
})

describe('WeakestSlots — slot numbering', () => {
  const slots = [{ slot: 'QB' }, { slot: 'RB' }, { slot: 'RB' }, { slot: 'TE' }, { slot: 'FLEX' }, { slot: 'FLEX' }]

  it('RB1/RB2 at index 1/2, FLX1/FLX2 at index 4/5', () => {
    const rows = [
      mkRow('RB', 1, 'RB', 8, 10),
      mkRow('RB', 2, 'RB', 7, 10),
      mkRow('FLEX', 4, 'WR', 6, 10),
      mkRow('FLEX', 5, 'WR', 5, 10),
    ]
    render(<WeakestSlots rows={rows} slots={slots} />)
    expect(screen.getByTestId('weak-row-1').querySelector('.font-dp-mono.text-\\[11px\\]').textContent).toBe('RB1')
    expect(screen.getByTestId('weak-row-2').querySelector('.font-dp-mono.text-\\[11px\\]').textContent).toBe('RB2')
    expect(screen.getByTestId('weak-row-4').querySelector('.font-dp-mono.text-\\[11px\\]').textContent).toBe('FLX1')
    expect(screen.getByTestId('weak-row-5').querySelector('.font-dp-mono.text-\\[11px\\]').textContent).toBe('FLX2')
  })

  it('a lone TE at index 3 keeps its bare label', () => {
    const rows = [mkRow('TE', 3, 'TE', 6, 10)]
    render(<WeakestSlots rows={rows} slots={slots} />)
    expect(screen.getByTestId('weak-row-3').querySelector('.font-dp-mono.text-\\[11px\\]').textContent).toBe('TE')
  })
})

describe('WeakestSlots — bar widths never overflow', () => {
  it('mineW + lossW <= 100, each >= 0, negative mine clamps to 0', () => {
    const rows = [
      mkRow('RB', 0, 'RB', -2, 10), // loss 12, mine negative
      mkRow('WR', 1, 'WR', 8, 10), // loss 2
    ]
    const slots = [{ slot: 'RB' }, { slot: 'WR' }]
    render(<WeakestSlots rows={rows} slots={slots} />)

    for (const row of rows) {
      const el = screen.getByTestId(`weak-row-${row.slotIndex}`)
      const mineEl = el.querySelector('.bg-dp-slate')
      const lossEl = el.querySelector('.bg-dp-down')
      const mineW = parseFloat(mineEl.style.width)
      const lossLeft = parseFloat(lossEl.style.left)
      const lossW = parseFloat(lossEl.style.width)
      expect(mineW).toBeGreaterThanOrEqual(0)
      expect(lossW).toBeGreaterThanOrEqual(0)
      expect(mineW + lossW).toBeLessThanOrEqual(100)
      expect(lossLeft).toBe(mineW)
    }
    // The negative-mine row clamps to 0.
    const negRow = screen.getByTestId('weak-row-0')
    expect(parseFloat(negRow.querySelector('.bg-dp-slate').style.width)).toBe(0)
  })
})

describe('WeakestSlots — singular grammar', () => {
  it('one losing slot of 4.0 against a 1.0 second row', () => {
    const rows = [mkRow('RB', 0, 'RB', 6, 10), mkRow('WR', 1, 'WR', 9, 10)]
    const slots = [{ slot: 'RB' }, { slot: 'WR' }]
    render(<WeakestSlots rows={rows} slots={slots} />)
    expect(screen.getByTestId('weak-summary').textContent).toBe(
      'One running back costs you about 4 points a week against a median lineup. Everything else is within a field goal.'
    )
  })
})

describe('WeakestSlots — two positions in the dominant set', () => {
  it('Two running backs and one tight end cost you about N points a week against a median lineup', () => {
    // sorted desc losses: 3, 2, 2, 2 -> total 9, threshold 5.4; cumulative 3, 5, 7 -> cutoff at 3
    // rows (RB, RB, TE); cost = round(3+2+2) = 7; remaining row (2) < 3 -> field-goal tail.
    const rows = [
      mkRow('RB', 0, 'RB', 7, 10),
      mkRow('RB', 1, 'RB', 8, 10),
      mkRow('TE', 2, 'TE', 8, 10),
      mkRow('WR', 3, 'WR', 8, 10),
    ]
    const slots = [{ slot: 'RB' }, { slot: 'RB' }, { slot: 'TE' }, { slot: 'WR' }]
    render(<WeakestSlots rows={rows} slots={slots} />)
    expect(screen.getByTestId('weak-summary').textContent).toBe(
      'Two running backs and one tight end cost you about 7 points a week against a median lineup. Everything else is within a field goal.'
    )
  })
})
