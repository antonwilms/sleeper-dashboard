// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { WeeklyStrip, WEEKS_STRIP_TITLE } from './WeeklyStrip'
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
const barOf = slot => slot.querySelector('[data-slot-mark="bar"]')
const heights = c => slots(c).map(s => barOf(s).style.height)

describe('WeeklyStrip', () => {
  it('S6 a played bar is coloured on the position\'s own basis, with data-pct', () => {
    const { container } = render(<WeeklyStrip cells={[played(1, 15)]} position="WR" percentileBasis={ready} />)
    const [bar] = slots(container)
    const p = percentileOf(WR, 15)
    expect(barOf(bar).style.backgroundColor).toBe(scaleCss(p))
    expect(bar.getAttribute('data-pct')).toBe(String(Math.round(p * 100)))
    expect(p).not.toBe(percentileOf(RB, 15)) // fixture: the RB basis would colour it differently
  })

  it('S7 bye, dnp and unknown are shape-coded on the baseline, never scale bars; a 0-pt played week is a 2px coloured stub', () => {
    const cells = [
      { week: 1, kind: 'bye', points: null },
      { week: 2, kind: 'dnp', points: null },
      { week: 3, kind: 'unknown', points: null },
      played(4, 0),
    ]
    const { container } = render(<WeeklyStrip cells={cells} position="WR" percentileBasis={ready} />)
    const [bye, dnp, unk, zero] = slots(container)
    const byeMark = bye.querySelector('[data-slot-mark="bye"]')
    expect(byeMark.className).toContain('bg-dp-bye-hatch')
    expect(byeMark.style.height).toBe('5px')
    expect(dnp.querySelector('svg[data-slot-mark="dnp"]')).not.toBeNull()
    expect(container.querySelector('.bg-dp-missed')).toBeNull()
    for (const el of container.querySelectorAll('*')) expect(el.style.alignSelf).toBe('')
    expect([bye, dnp, unk, zero].map(s => s.lastElementChild.getAttribute('data-slot-base'))).toEqual(['solid', 'solid', 'void', 'solid'])
    expect(unk.querySelector('[data-slot-mark]')).toBeNull()
    for (const el of [bye, dnp, unk]) {
      expect(barOf(el)).toBeNull()
      for (const m of el.querySelectorAll('[data-slot-mark]')) {
        const h = m.tagName.toLowerCase() === 'svg' ? Number(m.getAttribute('height')) : parseInt(m.style.height, 10)
        expect(h).toBeLessThanOrEqual(5)
      }
    }
    expect(barOf(zero).style.height).toBe('2px')
    expect(barOf(zero).style.backgroundColor).not.toBe('')
  })

  it('S8 no last-3 marker: no data-last3, and the strip holds only the track', () => {
    const cells = [
      played(1, 10), played(2, 12), played(3, 14), { week: 4, kind: 'dnp', points: null },
      played(5, 16), { week: 6, kind: 'bye', points: null }, played(7, 18),
    ]
    const { container, getByTestId } = render(<WeeklyStrip cells={cells} position="WR" percentileBasis={ready} />)
    expect(container.querySelector('[data-last3]')).toBeNull()
    expect(getByTestId('weekly-strip').children).toHaveLength(1)
  })

  it('S9a pending basis renders neutral bars of real height, no inline colour', () => {
    const { container } = render(
      <WeeklyStrip cells={[played(1, 15), played(2, 5)]} position="WR" percentileBasis={{ status: 'pending', basis: { WR: ready.basis.WR } }} />
    )
    for (const slot of slots(container)) {
      const bar = barOf(slot)
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
    const [slot] = slots(container)
    const bar = barOf(slot)
    expect(bar.className).toContain('bg-dp-chip')
    expect(bar.style.backgroundColor).toBe('')
    expect(slot.getAttribute('data-pct')).toBeNull()
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

  // p95 of 0..99 is 94.05.
  const scaled = {
    status: 'ready', needsPrior: false, liveSeason: 2026, priorSeason: 2025,
    basis: { WR: { values: Array.from({ length: 100 }, (_, i) => i), n: 100, season: 2026, source: 'live' } },
  }

  it('WS-1 height is on one scale per position, not each player\'s own max', () => {
    const low = render(<WeeklyStrip cells={[played(1, 47)]} position="WR" percentileBasis={scaled} />)
    const high = render(<WeeklyStrip cells={[played(1, 94)]} position="WR" percentileBasis={scaled} />)
    expect(heights(low.container)).toEqual(['9px'])
    expect(heights(high.container)).toEqual(['18px'])
    for (const r of [low, high]) {
      expect(r.container.querySelector('[data-testid="weekly-strip"]').getAttribute('data-scale')).toBe('position')
    }
  })

  it('WS-2 a week above the p95 clamps to the track and keeps its exact points in the title', () => {
    const { container } = render(<WeeklyStrip cells={[played(3, 150)]} position="WR" percentileBasis={scaled} />)
    expect(heights(container)).toEqual(['18px'])
    expect(slots(container)[0].getAttribute('title')).toBe('Wk 3 · 150.0 pts')
  })

  it('WS-3 a pending basis or no entry for the position falls back to own-max heights', () => {
    const cells = [played(1, 10), played(2, 20)]
    const noEntry = { ...scaled, basis: { RB: scaled.basis.WR } }
    for (const percentileBasis of [{ ...scaled, status: 'pending' }, noEntry]) {
      const { container, unmount } = render(<WeeklyStrip cells={cells} position="WR" percentileBasis={percentileBasis} />)
      expect(container.querySelector('[data-testid="weekly-strip"]').getAttribute('data-scale')).toBe('own')
      expect(heights(container)).toEqual(['9px', '18px'])
      unmount()
    }
  })

  it('WS-4 the WEEKS header title states the real colour ends and the missed mark', () => {
    expect(WEEKS_STRIP_TITLE).toContain('light green the top')
    expect(WEEKS_STRIP_TITLE).toContain('dark purple the bottom')
    expect(WEEKS_STRIP_TITLE.toLowerCase()).toContain('did not play')
    expect(WEEKS_STRIP_TITLE).not.toContain('Ticked')
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
    expect(container.innerHTML).toMatchInlineSnapshot(`"<div data-testid="weekly-strip" data-scale="position" style="width: 107px;"><div class="flex items-end" style="gap: 1px; height: 19px;"><div data-testid="strip-slot" data-week="1" data-kind="played" role="img" aria-label="Wk 1 · 12.0 pts" title="Wk 1 · 12.0 pts" data-pct="0" style="width: 5px; height: 19px; display: flex; flex-direction: column; justify-content: flex-end;"><div data-slot-mark="bar" class="rounded-t-[1px] " style="width: 5px; height: 3px; background-color: rgb(42, 27, 77);"></div><div data-slot-base="solid" class="bg-dp-border-row" style="width: 5px; height: 1px;"></div></div><div data-testid="strip-slot" data-week="2" data-kind="bye" role="img" aria-label="Bye" title="Bye" style="width: 5px; height: 19px; display: flex; flex-direction: column; justify-content: flex-end;"><div data-slot-mark="bye" class="bg-dp-bye-hatch" style="width: 5px; height: 5px;"></div><div data-slot-base="solid" class="bg-dp-border-row" style="width: 5px; height: 1px;"></div></div><div data-testid="strip-slot" data-week="3" data-kind="dnp" role="img" aria-label="Did not play" title="Did not play" style="width: 5px; height: 19px; display: flex; flex-direction: column; justify-content: flex-end;"><svg data-slot-mark="dnp" aria-hidden="true" width="5" height="5" viewBox="0 0 5 5" style="display: block;"><path d="M1 1L4 4M4 1L1 4" stroke="var(--color-dp-missed)" stroke-width="1.25" stroke-linecap="round" fill="none"></path></svg><div data-slot-base="solid" class="bg-dp-border-row" style="width: 5px; height: 1px;"></div></div><div data-testid="strip-slot" data-week="4" data-kind="unknown" role="img" aria-label="Wk 4 · not loaded" title="Wk 4 · not loaded" style="width: 5px; height: 19px; display: flex; flex-direction: column; justify-content: flex-end;"><div data-slot-base="void"><div style="width: 5px; height: 0px; border-top: 1px dashed var(--color-dp-slate-2);"></div></div></div><div data-testid="strip-slot" data-week="5" data-kind="played" role="img" aria-label="Wk 5 · 0.0 pts" title="Wk 5 · 0.0 pts" data-pct="0" style="width: 5px; height: 19px; display: flex; flex-direction: column; justify-content: flex-end;"><div data-slot-mark="bar" class="rounded-t-[1px] " style="width: 5px; height: 2px; background-color: rgb(42, 27, 77);"></div><div data-slot-base="solid" class="bg-dp-border-row" style="width: 5px; height: 1px;"></div></div><div data-testid="strip-slot" data-week="6" data-kind="played" role="img" aria-label="Wk 6 · 30.0 pts" title="Wk 6 · 30.0 pts" data-pct="1" style="width: 5px; height: 19px; display: flex; flex-direction: column; justify-content: flex-end;"><div data-slot-mark="bar" class="rounded-t-[1px] " style="width: 5px; height: 6px; background-color: rgb(43, 29, 79);"></div><div data-slot-base="solid" class="bg-dp-border-row" style="width: 5px; height: 1px;"></div></div></div></div>"`)
  })
})
