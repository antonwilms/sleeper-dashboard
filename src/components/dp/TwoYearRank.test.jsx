// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TwoYearRankCell, AgeCautionMarker } from './TwoYearRank'

expect.extend(jestDomMatchers)
afterEach(cleanup)

describe('TwoYearRankCell', () => {
  it('renders "2-yr avg WR14" and opens the gloss on click', () => {
    render(<TwoYearRankCell entry={{ rank: 14, poolSize: 80, ppg: 12 }} position="WR" />)
    fireEvent.click(screen.getByText('2-yr avg WR14'))
    expect(screen.getByRole('dialog').textContent).toContain('did not beat this ranking')
  })
  it('renders — with the not-ranked gloss for a null entry', () => {
    render(<TwoYearRankCell entry={null} position="WR" />)
    fireEvent.click(screen.getByText('—'))
    expect(screen.getByRole('dialog').textContent).toContain('Not ranked')
  })
  it('a click does not reach a parent onClick', () => {
    const spy = vi.fn()
    render(<div onClick={spy}><TwoYearRankCell entry={{ rank: 1 }} position="QB" /></div>)
    fireEvent.click(screen.getByText('2-yr avg QB1'))
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
