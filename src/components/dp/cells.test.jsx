// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { CareerBars } from './cells'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function bars(container) {
  return [...container.firstChild.children]
}

describe('CareerBars', () => {
  it('void ≠ measured zero: a null slot and a measured-0 slot render differently', () => {
    const { container } = render(<CareerBars values={[null, 0, 10, 10, 10]} />)
    const [voidBar, zeroBar] = bars(container)
    // void: dashed border, no fill, zero-height
    expect(voidBar.style.borderTop).toMatch(/dashed/)
    expect(voidBar).toHaveStyle({ height: '0px' })
    expect(voidBar.className).toBe('')
    // measured 0: a filled 2px stub with a real bg class, no dashed border
    expect(zeroBar).toHaveStyle({ height: '2px' })
    expect(zeroBar.style.borderTop).toBe('')
    expect(zeroBar.className).toMatch(/bg-dp-slate|bg-dp-up/)
  })

  it('a void slot renders no fill class at all', () => {
    const { container } = render(<CareerBars values={[null, 5, 5, 5, 5]} />)
    expect(bars(container)[0].className).toBe('')
  })

  it('a measured 0 renders a filled 2px stub, not the old 3px non-highlight stub', () => {
    const { container } = render(<CareerBars values={[5, 5, 5, 5, 0]} />)
    const last = bars(container)[4]
    expect(last).toHaveStyle({ height: '2px' })
  })

  it('a value > 0 renders proportional to max, minimum 3px', () => {
    const { container } = render(<CareerBars values={[10, 20, null, null, null]} />)
    const [first, second] = bars(container)
    expect(first).toHaveStyle({ height: '11px' }) // round(10/20*22)
    expect(second).toHaveStyle({ height: '22px' }) // max value -> full height
  })

  it('NaN and undefined render as void, not as a measured-zero stub', () => {
    const { container } = render(<CareerBars values={[NaN, undefined, 10, 10, 10]} />)
    const [nanBar, undefBar] = bars(container)
    for (const b of [nanBar, undefBar]) {
      expect(b.style.borderTop).toMatch(/dashed/)
      expect(b).toHaveStyle({ height: '0px' })
    }
  })

  it('max ignores non-finite entries when scaling the finite bars', () => {
    const { container } = render(<CareerBars values={[null, NaN, 10, 20, undefined]} />)
    const tallest = bars(container)[3] // value 20, the max among finite entries
    expect(tallest).toHaveStyle({ height: '22px' })
  })

  it('a measured 0 in the last slot still carries bg-dp-up', () => {
    const { container } = render(<CareerBars values={[10, 10, 10, 10, 0]} />)
    const last = bars(container)[4]
    expect(last.className).toContain('bg-dp-up')
  })

  it('when the last slot is void, no bar carries bg-dp-up at all', () => {
    const { container } = render(<CareerBars values={[10, 10, 10, 10, null]} />)
    for (const b of bars(container)) {
      expect(b.className).not.toContain('bg-dp-up')
    }
  })

  it('priors (measured, any value) render bg-dp-slate, not bg-dp-up', () => {
    const { container } = render(<CareerBars values={[0, 10, 10, 10, 10]} />)
    const [zeroPrior, positivePrior] = bars(container)
    expect(zeroPrior.className).toContain('bg-dp-slate')
    expect(positivePrior.className).toContain('bg-dp-slate')
  })
})
