// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { WeeklyStrip } from './WeeklyStrip'
import { scaleCss } from '../../utils/percentileColour'
import { percentileOf } from '../../utils/starterPercentiles'

afterEach(cleanup)

const WR = [0, 5, 10, 15, 20, 25, 30]
const RB = [1, 2, 3]
const ready = {
  status: 'ready', needsPrior: false, liveSeason: 2026, priorSeason: 2025,
  basis: { WR: { values: WR, n: 7, season: 2026, source: 'live' }, RB: { values: RB, n: 3, season: 2026, source: 'live' } },
}
const played = (week, points) => ({ week, kind: 'played', points })
const slots = c => [...c.querySelectorAll('[data-testid="strip-slot"]')]

describe('WeeklyStrip', () => {
  it('S6 a played bar is coloured on the position\'s own basis, with data-pct', () => {
    const { container } = render(<WeeklyStrip cells={[played(1, 15)]} position="WR" percentileBasis={ready} />)
    const [bar] = slots(container)
    const p = percentileOf(WR, 15)
    expect(bar.style.backgroundColor).toBe(scaleCss(p))
    expect(bar.getAttribute('data-pct')).toBe(String(Math.round(p * 100)))
    expect(p).not.toBe(percentileOf(RB, 15)) // fixture: the RB basis would colour it differently
  })

  it('S7 bye, dnp and unknown are shape-coded, never scale bars; a 0-pt played week is a 2px coloured stub', () => {
    const cells = [
      { week: 1, kind: 'bye', points: null },
      { week: 2, kind: 'dnp', points: null },
      { week: 3, kind: 'unknown', points: null },
      played(4, 0),
    ]
    const { container } = render(<WeeklyStrip cells={cells} position="WR" percentileBasis={ready} />)
    const [bye, dnp, unk, zero] = slots(container)
    expect(bye.className).toContain('bg-dp-bye-hatch')
    expect(bye.style.height).toBe('18px')
    expect(dnp.className).toContain('bg-dp-missed')
    expect(dnp.style.height).toBe('5px')
    expect(dnp.style.alignSelf).toBe('flex-start')
    expect(unk.style.height).toBe('0px')
    expect(unk.firstElementChild.style.borderTop).toContain('1px dashed')
    for (const el of [bye, dnp, unk]) expect(el.style.backgroundColor).toBe('')
    expect(zero.style.height).toBe('2px')
    expect(zero.style.backgroundColor).not.toBe('')
  })

  it('S8 last-3 emphasis marks the last three PLAYED weeks, with ticks at the same indices', () => {
    const cells = [
      played(1, 10), played(2, 12), played(3, 14), { week: 4, kind: 'dnp', points: null },
      played(5, 16), { week: 6, kind: 'bye', points: null }, played(7, 18),
    ]
    const { container, getByTestId } = render(<WeeklyStrip cells={cells} position="WR" percentileBasis={ready} />)
    const marked = slots(container).filter(el => el.getAttribute('data-last3') === 'true').map(el => el.getAttribute('data-week'))
    expect(marked).toEqual(['3', '5', '7'])
    const ticks = [...getByTestId('weekly-strip').lastElementChild.children]
    expect(ticks).toHaveLength(7)
    ticks.forEach((t, i) => expect(t.className.includes('bg-dp-text-2'), `tick ${i}`).toBe([2, 4, 6].includes(i)))
  })

  it('S9a pending basis renders neutral bars of real height, no inline colour', () => {
    const { container } = render(
      <WeeklyStrip cells={[played(1, 15), played(2, 5)]} position="WR" percentileBasis={{ status: 'pending', basis: { WR: ready.basis.WR } }} />
    )
    for (const bar of slots(container)) {
      expect(bar.style.backgroundColor).toBe('')
      expect(bar.className).toContain('bg-dp-chip')
      expect(parseInt(bar.style.height, 10)).toBeGreaterThan(0)
    }
  })

  it('S9c a ready basis with no entry for the position renders neutral bars, never another position\'s basis', () => {
    const { container } = render(
      <WeeklyStrip
        cells={[played(1, 15)]} position="WR"
        percentileBasis={{ status: 'ready', basis: { RB: { values: [0, 10, 20], n: 3, season: 2026, source: 'live' } } }}
      />
    )
    const [bar] = slots(container)
    expect(bar.className).toContain('bg-dp-chip')
    expect(bar.style.backgroundColor).toBe('')
    expect(bar.getAttribute('data-pct')).toBeNull()
    expect(parseInt(bar.style.height, 10)).toBeGreaterThan(0)
  })

  it('S9b tooltips and aria-labels', () => {
    const cells = [{ week: 1, kind: 'bye', points: null }, { week: 2, kind: 'dnp', points: null }, { week: 3, kind: 'unknown', points: null }, played(7, 18.4)]
    const { container } = render(<WeeklyStrip cells={cells} position="WR" percentileBasis={ready} />)
    const [bye, dnp, unk, pl] = slots(container)
    expect(bye.getAttribute('title')).toBe('Bye')
    expect(dnp.getAttribute('aria-label')).toBe('Did not play')
    expect(unk.getAttribute('title')).toBe('Wk 3 · not loaded')
    expect(pl.getAttribute('title')).toBe('Wk 7 · 18.4 pts')
    expect(pl.getAttribute('aria-label')).toBe('Wk 7 · 18.4 pts')
  })

  it('no cells renders a muted dash instead of a track', () => {
    const { container } = render(<WeeklyStrip cells={[]} position="WR" percentileBasis={ready} />)
    expect(container.querySelector('[data-testid="weekly-strip"]')).toBeNull()
    expect(container.textContent).toBe('—')
  })

  it('M3 W1 the strip markup is pinned (a prop or default added for My Team must not change /week)', () => {
    const cells = [
      played(1, 12), { week: 2, kind: 'bye', points: null }, { week: 3, kind: 'dnp', points: null },
      { week: 4, kind: 'unknown', points: null }, played(5, 0), played(6, 30),
    ]
    const basis = {
      status: 'ready', needsPrior: false, liveSeason: 2026, priorSeason: 2025,
      basis: { WR: { values: Array.from({ length: 60 }, (_, i) => 30 + i), n: 60, season: 2026, source: 'live' }, RB: null, QB: null, TE: null },
    }
    const { container } = render(<WeeklyStrip cells={cells} position="WR" percentileBasis={basis} />)
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div data-testid="weekly-strip" style="width: 107px;"><div class="flex items-end" style="gap: 1px; height: 18px;"><div data-testid="strip-slot" data-week="1" data-kind="played" role="img" aria-label="Wk 1 · 12.0 pts" title="Wk 1 · 12.0 pts" data-last3="true" data-pct="0" class="rounded-[1px]" style="width: 5px; height: 7px; background-color: rgb(42, 27, 77);"></div><div data-testid="strip-slot" data-week="2" data-kind="bye" role="img" aria-label="Bye" title="Bye" class="bg-dp-bye-hatch" style="width: 5px; height: 18px;"></div><div data-testid="strip-slot" data-week="3" data-kind="dnp" role="img" aria-label="Did not play" title="Did not play" class="bg-dp-missed" style="width: 5px; height: 5px; align-self: flex-start;"></div><div data-testid="strip-slot" data-week="4" data-kind="unknown" role="img" aria-label="Wk 4 · not loaded" title="Wk 4 · not loaded" style="width: 5px; height: 0px;"><div style="width: 5px; height: 0px; border-top: 1px dashed var(--color-dp-slate-2);"></div></div><div data-testid="strip-slot" data-week="5" data-kind="played" role="img" aria-label="Wk 5 · 0.0 pts" title="Wk 5 · 0.0 pts" data-last3="true" data-pct="0" class="rounded-[1px]" style="width: 5px; height: 2px; background-color: rgb(42, 27, 77);"></div><div data-testid="strip-slot" data-week="6" data-kind="played" role="img" aria-label="Wk 6 · 30.0 pts" title="Wk 6 · 30.0 pts" data-last3="true" data-pct="1" class="rounded-[1px]" style="width: 5px; height: 18px; background-color: rgb(43, 29, 79);"></div></div><div class="flex mt-[2px]" style="gap: 1px; height: 2px;"><div class="bg-dp-text-2" style="width: 5px; height: 2px;"></div><div style="width: 5px; height: 2px;"></div><div style="width: 5px; height: 2px;"></div><div style="width: 5px; height: 2px;"></div><div class="bg-dp-text-2" style="width: 5px; height: 2px;"></div><div class="bg-dp-text-2" style="width: 5px; height: 2px;"></div></div></div>"`)
  })
})
