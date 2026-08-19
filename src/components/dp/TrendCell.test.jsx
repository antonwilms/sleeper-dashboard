// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { TrendCell } from './TrendCell'

expect.extend(jestDomMatchers)
afterEach(cleanup)

describe('TrendCell', () => {
  describe('scale geometry', () => {
    it('cell scale uses h=14, bar=3, gap=1', () => {
      const { container } = render(
        <TrendCell values={[1, 2, 3]} delta={1} window="3w" band="high" scale="cell" />
      )
      const track = container.querySelector('.flex.items-end')
      expect(track).toHaveStyle({ height: '14px', gap: '1px' })
      expect(track.firstChild).toHaveStyle({ width: '3px' })
    })

    it('tile scale uses h=22, bar=6, gap=2 — identical to CareerBars', () => {
      const { container } = render(
        <TrendCell values={[1, 2, 3]} delta={1} window="3w" band="high" scale="tile" />
      )
      const track = container.querySelector('.flex.items-end')
      expect(track).toHaveStyle({ height: '22px', gap: '2px' })
      expect(track.firstChild).toHaveStyle({ width: '6px' })
    })

    it('section scale uses h=40, bar=14, gap=5', () => {
      const { container } = render(
        <TrendCell values={[1, 2, 3]} delta={1} window="3w" band="high" scale="section" />
      )
      const track = container.querySelector('.flex.items-end')
      expect(track).toHaveStyle({ height: '40px', gap: '5px' })
      expect(track.firstChild).toHaveStyle({ width: '14px' })
    })
  })

  describe('band gating', () => {
    it('high renders series + delta + window', () => {
      const { container, getByText } = render(
        <TrendCell values={[1, 2, 3]} delta={2} window="3w" band="high" />
      )
      expect(container.querySelector('.flex.items-end')).toBeInTheDocument()
      expect(getByText('3w')).toBeInTheDocument()
      expect(getByText(/2/)).toBeInTheDocument()
    })

    it('medium renders series + delta + window', () => {
      const { container } = render(
        <TrendCell values={[1, 2, 3]} delta={2} window="3w" band="medium" />
      )
      expect(container.querySelector('.flex.items-end')).toBeInTheDocument()
    })

    it('low suppresses the series but keeps delta + window', () => {
      const { container, getByText } = render(
        <TrendCell values={[1, 2, 3]} delta={2} window="3w" band="low" />
      )
      expect(container.querySelector('.flex.items-end')).not.toBeInTheDocument()
      expect(getByText('3w')).toBeInTheDocument()
      expect(getByText(/2/)).toBeInTheDocument()
    })

    it('none renders "—" only', () => {
      const { container } = render(
        <TrendCell values={[1, 2, 3]} delta={2} window="3w" band="none" />
      )
      expect(container.textContent).toBe('—')
    })

    it('an absent band is treated as none', () => {
      const { container } = render(<TrendCell values={[1, 2, 3]} delta={2} window="3w" />)
      expect(container.textContent).toBe('—')
    })

    it('an unrecognised band is treated as none, not high', () => {
      const { container } = render(
        <TrendCell values={[1, 2, 3]} delta={2} window="3w" band="bogus" />
      )
      expect(container.textContent).toBe('—')
    })
  })

  describe('delta', () => {
    it('glyph precedes colour for positive', () => {
      const { container } = render(<TrendCell delta={5} window="3w" band="low" />)
      const span = container.querySelector('.text-dp-up-text')
      expect(span.textContent).toMatch(/^▲/)
    })

    it('glyph precedes colour for negative', () => {
      const { container } = render(<TrendCell delta={-5} window="3w" band="low" />)
      const span = container.querySelector('.text-dp-down-text')
      expect(span.textContent).toMatch(/^▼/)
    })

    it('glyph precedes colour for flat', () => {
      const { container } = render(<TrendCell delta={0} window="3w" band="low" />)
      const span = container.querySelector('.text-dp-text-5')
      expect(span.textContent).toMatch(/^→/)
    })

    it('renders "—" for the delta whenever delta == null, independent of band', () => {
      const { getByText } = render(<TrendCell values={[1, 2]} window="3w" band="high" delta={null} />)
      expect(getByText('—')).toBeInTheDocument()
    })
  })

  describe('projectedIndex', () => {
    it('marks the bar at projectedIndex dashed instead of filled', () => {
      const { container } = render(
        <TrendCell values={[1, 2, 3]} delta={1} window="3w" band="high" projectedIndex={2} />
      )
      const track = container.querySelector('.flex.items-end')
      const bars = [...track.children]
      expect(bars[2].className).toMatch(/border-dashed/)
      expect(bars[0].className).not.toMatch(/border-dashed/)
    })
  })

  it('does not throw when windowLabel is absent (caller bug, not a crash)', () => {
    expect(() => render(<TrendCell values={[1, 2, 3]} delta={1} band="high" />)).not.toThrow()
  })

  it('windowLabel absence does not suppress the series or delta', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container, getByText } = render(<TrendCell values={[1, 2, 3]} delta={1} band="high" />)
    expect(container.querySelector('.flex.items-end')).toBeInTheDocument()
    expect(getByText(/1/)).toBeInTheDocument()
    warnSpy.mockRestore()
  })
})
