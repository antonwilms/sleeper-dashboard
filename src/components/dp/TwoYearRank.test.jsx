// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { TwoYearRankCell, AgeCautionMarker } from './TwoYearRank'

expect.extend(jestDomMatchers)
afterEach(cleanup)

describe('TwoYearRankCell', () => {
  const entry = { rank: 14, rankPpg: 11, poolSize: 80, points: 1500, ppg: 12 }
  const openGloss = () => fireEvent.click(within(screen.getByTestId('two-year-rank')).getByRole('button'))

  it('TR-1: renders the total and per-game ranks and opens the gloss on click', () => {
    render(<TwoYearRankCell entry={entry} position="WR" />)
    expect(screen.getByTestId('two-year-rank').textContent).toBe('2-yr WR14 · WR11/g')
    openGloss()
    const gloss = screen.getByRole('dialog').textContent
    expect(gloss).toContain('by total points across both seasons')
    expect(gloss).toContain('averaged over the seasons with 8+ games')
  })
  it('TR-2: lifts the total rank, shows /g in dp-muted, and sets no native title', () => {
    render(<TwoYearRankCell entry={entry} position="WR" />)
    const [total, perGame] = screen.getByTestId('rank-pair').children
    expect(total.classList.contains('text-dp-text-4')).toBe(true)
    expect(perGame.classList.contains('text-dp-muted')).toBe(true)
    expect(perGame.classList.contains('text-dp-muted-2')).toBe(false)
    expect(screen.getByTestId('two-year-rank').querySelectorAll('[title]').length).toBe(0)
  })
  it('renders — with the not-ranked gloss for a null entry', () => {
    render(<TwoYearRankCell entry={null} position="WR" />)
    expect(screen.getByTestId('two-year-rank').textContent).toBe('—')
    fireEvent.click(screen.getByText('—'))
    expect(screen.getByRole('dialog').textContent).toContain('Not ranked')
  })
  it('a click does not reach a parent onClick', () => {
    const spy = vi.fn()
    render(<div onClick={spy}><TwoYearRankCell entry={{ rank: 1, rankPpg: 2 }} position="QB" /></div>)
    expect(screen.getByTestId('two-year-rank').textContent).toBe('2-yr QB1 · QB2/g')
    openGloss()
    expect(spy).not.toHaveBeenCalled()
  })
})

describe('AgeCautionMarker', () => {
  it('renders nothing for null', () => {
    const { container } = render(<AgeCautionMarker kind={null} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('over: ▲ glyph, aria-label and gloss; no Sleeper sentence for a birthdate age', () => {
    render(<AgeCautionMarker kind="over" ageSource="birthdate" />)
    expect(screen.getByLabelText('The score has historically rated this age group too high.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('▲ age'))
    expect(screen.getByRole('dialog').textContent).toContain('31+ over-rated')
    expect(screen.getByRole('dialog').textContent).not.toContain('Age from Sleeper')
  })
  it('under: ▼ glyph and aria-label; Sleeper sentence only for a Sleeper age', () => {
    render(<AgeCautionMarker kind="under" ageSource="sleeper" />)
    expect(screen.getByLabelText('The score has historically rated this age group too low.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('▼ age'))
    expect(screen.getByRole('dialog').textContent).toContain('Age from Sleeper (no birthdate on file).')
  })
  it('a click does not reach a parent onClick', () => {
    const spy = vi.fn()
    render(<div onClick={spy}><AgeCautionMarker kind="over" /></div>)
    fireEvent.click(screen.getByText('▲ age'))
    expect(spy).not.toHaveBeenCalled()
  })
})
