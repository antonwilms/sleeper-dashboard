// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { LeagueLadders } from './LeagueLadders'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const row = (pos, lastRank, projRank, over = {}) => ({
  pos, slotsLabel: '2 slots + 1 flex',
  lastMine: 30, lastRank, lastMedian: 32, lastAll: [],
  projMine: 31, projRank, projMedian: 33, projAll: [],
  move: lastRank != null && projRank != null ? projRank - lastRank : null,
  ...over,
})

describe('LeagueLadders — rank-tone boundaries at teamCount = 12', () => {
  const cases = [
    { rank: 4, numberClass: 'text-dp-up-text', rungClass: 'bg-dp-up' },
    { rank: 5, numberClass: 'text-dp-text', rungClass: 'bg-dp-text-strong' },
    { rank: 8, numberClass: 'text-dp-text', rungClass: 'bg-dp-text-strong' },
    { rank: 9, numberClass: 'text-dp-down-text', rungClass: 'bg-dp-down' },
  ]

  for (const { rank, numberClass, rungClass } of cases) {
    it(`rank ${rank} -> number ${numberClass}, rung ${rungClass}`, () => {
      const ladders = [row('QB', 6, rank)]
      render(<LeagueLadders ladders={ladders} teamCount={12} dataSeason={2025} projSeason={2026} />)
      const projCell = screen.getByTestId('ladder-proj')
      const rankSpan = projCell.querySelector('[data-testid="ladder-rank"]')
      expect(rankSpan.className).toContain(numberClass)
      if (rank === 5) expect(rankSpan.className).not.toContain('text-dp-up-text')
      const rung = projCell.querySelector('[data-testid="rung-mine"]')
      expect(rung.className).toContain(rungClass)
    })
  }
})

describe('LeagueLadders — MOVE', () => {
  it('up (negative move)', () => {
    render(<LeagueLadders ladders={[row('QB', 6, 3)]} teamCount={12} />)
    const move = screen.getByTestId('ladder-move')
    expect(move.textContent).toBe('up 3')
    expect(move.className).toContain('text-dp-up-text')
  })

  it('down (positive move)', () => {
    render(<LeagueLadders ladders={[row('QB', 3, 6)]} teamCount={12} />)
    const move = screen.getByTestId('ladder-move')
    expect(move.textContent).toBe('down 3')
    expect(move.className).toContain('text-dp-down-text')
  })

  it('no change', () => {
    render(<LeagueLadders ladders={[row('QB', 4, 4)]} teamCount={12} />)
    const move = screen.getByTestId('ladder-move')
    expect(move.textContent).toBe('no change')
    expect(move.className).toContain('text-dp-text-5')
  })

  it('null lastRank -> —', () => {
    render(<LeagueLadders ladders={[row('QB', null, 4)]} teamCount={12} />)
    const move = screen.getByTestId('ladder-move')
    expect(move.textContent).toBe('—')
    expect(move.className).toContain('text-dp-muted')
  })

  it('null projRank -> —', () => {
    render(<LeagueLadders ladders={[row('QB', 4, null)]} teamCount={12} />)
    const move = screen.getByTestId('ladder-move')
    expect(move.textContent).toBe('—')
    expect(move.className).toContain('text-dp-muted')
  })
})

describe('LeagueLadders — rung count follows teamCount', () => {
  it('teamCount = 10 -> 10 rung wrappers, exactly one rung-mine', () => {
    render(<LeagueLadders ladders={[row('QB', 3, 5)]} teamCount={10} />)
    const projCell = screen.getByTestId('ladder-proj')
    const rungStrip = projCell.querySelector('[data-testid="ladder-rungs"]')
    expect(rungStrip.children.length).toBe(10)
    expect(projCell.querySelectorAll('[data-testid="rung-mine"]').length).toBe(1)
  })

  it('rank == null -> zero rung-mine, rank reads —', () => {
    render(<LeagueLadders ladders={[row('QB', 3, null)]} teamCount={10} />)
    const projCell = screen.getByTestId('ladder-proj')
    expect(projCell.querySelectorAll('[data-testid="rung-mine"]').length).toBe(0)
    expect(projCell.querySelector('[data-testid="ladder-rank"]').textContent).toBe('—')
  })
})

describe('LeagueLadders — copy', () => {
  it('teamCount = 12 -> title, meta, caption', () => {
    render(<LeagueLadders ladders={[row('QB', 3, 5)]} teamCount={12} projSeason={2026} />)
    expect(screen.getByText('Where you rank, out of twelve')).toBeInTheDocument()
    expect(screen.getByText(/1ST ← LADDER → 12TH/)).toBeInTheDocument()
    expect(screen.getByText(
      'Each ladder has twelve rungs, one per team, best on the left. The tall rung is you. MOVE is how many places the 2026 projection shifts you.'
    )).toBeInTheDocument()
    expect(screen.queryByText(/season:/)).not.toBeInTheDocument()
    expect(screen.queryByText(/gap/)).not.toBeInTheDocument()
  })

  it('teamCount = 10 -> out of ten / ten rungs', () => {
    render(<LeagueLadders ladders={[row('QB', 3, 5)]} teamCount={10} projSeason={2026} />)
    expect(screen.getByText('Where you rank, out of ten')).toBeInTheDocument()
    expect(screen.getByText(/ten rungs/)).toBeInTheDocument()
  })
})

describe('LeagueLadders — season labels', () => {
  it('both seasons present', () => {
    render(<LeagueLadders ladders={[row('QB', 3, 5)]} teamCount={12} dataSeason={2025} projSeason={2026} />)
    expect(screen.getByText('2025 · SCORED')).toBeInTheDocument()
    expect(screen.getByText('2026 · PROJECTED')).toBeInTheDocument()
  })

  it('both null', () => {
    render(<LeagueLadders ladders={[row('QB', 3, 5)]} teamCount={12} dataSeason={null} projSeason={null} />)
    expect(screen.getByText('— · SCORED')).toBeInTheDocument()
    expect(screen.getByText('— · PROJECTED')).toBeInTheDocument()
    expect(screen.getByText(/MOVE is how many places the projection shifts you\./)).toBeInTheDocument()
  })
})

describe('LeagueLadders — slotsLabel is rendered from the prop', () => {
  it('shows the given label verbatim', () => {
    render(<LeagueLadders ladders={[row('RB', 3, 5, { slotsLabel: '3 slots + 1 flex' })]} teamCount={12} />)
    expect(screen.getByText('3 slots + 1 flex')).toBeInTheDocument()
  })
})

describe('LeagueLadders — empty', () => {
  it('ladders = [], teamCount = 0', () => {
    render(<LeagueLadders ladders={[]} teamCount={0} />)
    expect(screen.getByText('No league lineups — league rosters or slots not loaded.')).toBeInTheDocument()
    expect(screen.getByText('Where you rank')).toBeInTheDocument()
    expect(screen.queryByText(/MOVE/)).not.toBeInTheDocument()
    const card = screen.getByTestId('league-ladders')
    expect(card.textContent).not.toContain('out of')
    expect(card.textContent).not.toContain('zero')
  })
})
