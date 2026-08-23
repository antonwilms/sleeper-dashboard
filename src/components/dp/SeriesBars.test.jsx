// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { SeriesBars } from './SeriesBars'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function bars(container) {
  return [...container.firstChild.children]
}

describe('SeriesBars', () => {
  it('never pads: renders exactly one bar per value, any length', () => {
    const { container } = render(<SeriesBars values={[1, 2, 3, 4, 5, 6, 7]} />)
    expect(bars(container)).toHaveLength(7)
  })

  describe('scaled mode', () => {
    it('honours an explicit domain instead of computing min-max', () => {
      const { container } = render(<SeriesBars values={[5]} domain={[0, 10]} height={40} />)
      const bar = bars(container)[0]
      // 5 against domain [0,10] with height 40 -> 20px
      expect(bar).toHaveStyle({ height: '20px' })
    })

    it('nulls are excluded from the domain computation and never become 0', () => {
      const { container } = render(<SeriesBars values={[null, 10, 20]} height={40} />)
      const [voidBar, , tallBar] = bars(container)
      // if the null were treated as 0, min would be 0 and the domain would differ
      expect(voidBar).toHaveStyle({ height: '0px' })
      expect(voidBar.style.borderTop).toMatch(/dashed/)
      expect(tallBar).toHaveStyle({ height: '40px' }) // max value -> full height
    })

    it('a void slot renders a dashed border-top at the baseline, not a filled bar', () => {
      const { container } = render(<SeriesBars values={[NaN, undefined, null]} />)
      for (const b of bars(container)) {
        expect(b.style.borderTop).toMatch(/dashed/)
        expect(b).toHaveStyle({ height: '0px' })
      }
    })
  })

  describe('signed mode', () => {
    it('positive values render above the zero rule, negative below', () => {
      const { container } = render(<SeriesBars values={[10, -5]} mode="signed" height={40} />)
      const wrappers = bars(container)
      const posBar = wrappers[0].querySelector('.bg-dp-up')
      const negBar = wrappers[1].querySelector('.bg-dp-down')
      expect(posBar).toBeTruthy()
      expect(negBar).toBeTruthy()
      // positive bar sits above the zero line (bottom offset), negative sits below (top offset)
      expect(posBar.style.bottom).toBeTruthy()
      expect(negBar.style.top).toBeTruthy()
    })

    it('draws a 1px zero rule for every finite slot', () => {
      const { container } = render(<SeriesBars values={[3, -3]} mode="signed" />)
      const rules = container.querySelectorAll('.bg-dp-muted-2')
      expect(rules).toHaveLength(2)
      for (const r of rules) expect(r).toHaveStyle({ height: '1px' })
    })

    it('nulls remain void slots in signed mode too', () => {
      const { container } = render(<SeriesBars values={[5, null, -5]} mode="signed" />)
      const middle = bars(container)[1]
      expect(middle.style.borderTop).toMatch(/dashed/)
    })
  })

  // dp-v2 Slice 6b — additive `colour="neutral"` option. Default (no `colour` prop) behaviour
  // must stay byte-identical to the tests above, since two real callers (EnvironmentSection,
  // UsageEfficiencySection) are NOT edited this slice and must keep colouring by sign.
  describe('colour="neutral" (dp-v2 6b)', () => {
    it('signed mode renders every bar bg-dp-slate-2, positive and negative alike', () => {
      const { container } = render(<SeriesBars values={[10, -5]} mode="signed" colour="neutral" height={40} />)
      const wrappers = bars(container)
      expect(wrappers[0].querySelector('.bg-dp-up')).toBeNull()
      expect(wrappers[1].querySelector('.bg-dp-down')).toBeNull()
      expect(wrappers[0].querySelector('.bg-dp-slate-2')).toBeTruthy()
      expect(wrappers[1].querySelector('.bg-dp-slate-2')).toBeTruthy()
    })

    it('the real zero-axis geometry is unchanged — bar offsets still split on the zero rule', () => {
      const { container } = render(<SeriesBars values={[10, -5]} mode="signed" colour="neutral" height={40} />)
      const wrappers = bars(container)
      const posBar = wrappers[0].querySelector('.bg-dp-slate-2')
      const negBar = wrappers[1].querySelector('.bg-dp-slate-2')
      expect(posBar.style.bottom).toBeTruthy()
      expect(negBar.style.top).toBeTruthy()
    })

    it('is a no-op in scaled mode — already neutral, colour prop changes nothing', () => {
      const withColour = render(<SeriesBars values={[1, 5, 10]} mode="scaled" colour="neutral" height={40} />)
      const withoutColour = render(<SeriesBars values={[1, 5, 10]} mode="scaled" height={40} />)
      expect(bars(withColour.container).map(b => b.className)).toEqual(bars(withoutColour.container).map(b => b.className))
    })

    it('default (no colour prop) signed-mode colouring is unchanged — the two un-edited real callers depend on this', () => {
      const { container } = render(<SeriesBars values={[10, -5]} mode="signed" height={40} />)
      const wrappers = bars(container)
      expect(wrappers[0].querySelector('.bg-dp-up')).toBeTruthy()
      expect(wrappers[1].querySelector('.bg-dp-down')).toBeTruthy()
    })
  })
})
