// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { readFileSync } from 'node:fs'
import { render, cleanup, fireEvent, within } from '@testing-library/react'
import { CareerBars, PlayerCell, ClickableRow, StatusChip, SortTh, WATERMARK_OPACITY, WATERMARK_OPACITY_CLASS } from './cells'
import { SLEEPER_LOGO_TEAMS } from '../../utils/sleeperImages'
import { minWatermarkContrast } from '../../__tests__/watermarkContrast'

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

describe('PlayerCell (W2b-2)', () => {
  const row = (over = {}) => ({ player_id: '4046', position: 'WR', full_name: 'Test Player', nfl_team: 'KC', age: 25, years_exp: 3, ...over })

  it('T1 renders the shared root containing the headshot', () => {
    const { getByTestId } = render(<PlayerCell row={row()} />)
    expect(getByTestId('player-cell')).toContainElement(getByTestId('headshot'))
    expect(getByTestId('headshot')).toHaveAttribute('src', expect.stringMatching(/\/4046\.jpg$/))
  })

  it('T2 watermark present for a Sleeper-logo team, absent for FA / null / era code, gone after a load error', () => {
    expect(SLEEPER_LOGO_TEAMS.has('KC')).toBe(true)
    expect(SLEEPER_LOGO_TEAMS.has('LA')).toBe(false) // era code (CR-16)
    const kc = render(<PlayerCell row={row()} />)
    const wm = kc.getByTestId('team-watermark')
    expect(wm).toHaveAttribute('aria-hidden', 'true')
    expect(within(wm).getByTestId('team-logo')).toHaveAttribute('src', expect.stringMatching(/\/kc\.png$/))
    fireEvent.error(within(wm).getByTestId('team-logo'))
    expect(within(wm).queryByTestId('team-logo')).toBeNull()
    kc.unmount()
    for (const t of ['FA', null, 'LA']) {
      const r = render(<PlayerCell row={row({ nfl_team: t })} />)
      expect(r.queryByTestId('team-watermark')).toBeNull()
      r.unmount()
    }
  })

  it('T3 the team abbr text is always rendered and never phone-hidden', () => {
    for (const [t, want] of [['KC', 'KC'], ['FA', 'FA'], [null, 'FA']]) {
      const r = render(<PlayerCell row={row({ nfl_team: t })} />)
      const el = r.getByTestId('player-cell-team')
      expect(el.textContent).toBe(want)
      expect(el.className).not.toMatch(/\bhidden\b/)
      r.unmount()
    }
    const kc = render(<PlayerCell row={row()} />)
    expect(kc.getByTestId('team-watermark')).toBeInTheDocument()
    expect(kc.getByTestId('player-cell-team').textContent).toBe('KC')
  })

  it('T4 name and sub-line text keep >= 4.5:1 under a white watermark pixel on every ground; opacity pinned', () => {
    const { getByTestId } = render(<PlayerCell row={row()} />)
    expect(minWatermarkContrast(getByTestId('player-cell-name'))).toBeGreaterThanOrEqual(4.5)
    expect(minWatermarkContrast(getByTestId('player-cell-sub'))).toBeGreaterThanOrEqual(4.5)
    expect(WATERMARK_OPACITY_CLASS).toBe(`opacity-[${WATERMARK_OPACITY}]`)
    expect(getByTestId('team-watermark').className).toContain(WATERMARK_OPACITY_CLASS)
  })

  it('T5 the marker sits on the name line, outside the truncating span', () => {
    const { getByTestId, container } = render(<PlayerCell row={row({ full_name: 'Some Name' })} marker={<i data-testid="m">MARK</i>} />)
    const nameLine = getByTestId('player-cell-name')
    expect(nameLine.textContent).toBe('Some NameMARK')
    expect(getByTestId('m').parentElement).toBe(nameLine)
    expect(container.querySelector('span.truncate')).not.toContainElement(getByTestId('m'))
    expect(nameLine.className).not.toMatch(/(^|\s)gap-/)
  })

  it('T6 sub-line: default, FA without age, sub override keeps the abbr, sub=null, no truncate', () => {
    const text = el => el.textContent
    let r = render(<PlayerCell row={row()} />)
    expect(text(r.getByTestId('player-cell-sub'))).toBe('KC · 25 · 3yr')
    expect(r.getByTestId('player-cell-sub').className).not.toContain('truncate')
    r.unmount()
    r = render(<PlayerCell row={row({ nfl_team: 'FA', age: undefined })} />)
    expect(text(r.getByTestId('player-cell-sub'))).toBe('FA · 3yr')
    r.unmount()
    r = render(<PlayerCell row={row()} sub={<b>X</b>} />)
    expect(text(r.getByTestId('player-cell-sub'))).toBe('KC · X')
    r.unmount()
    r = render(<PlayerCell row={row()} sub={null} />)
    expect(text(r.getByTestId('player-cell-sub'))).toBe('KC')
  })

  it('T7 position chip shows by default and is removed by showPosition={false}', () => {
    let r = render(<PlayerCell row={row()} />)
    expect(r.getByTestId('player-cell-pos').textContent).toBe('WR')
    r.unmount()
    r = render(<PlayerCell row={row()} showPosition={false} />)
    expect(r.queryByTestId('player-cell-pos')).toBeNull()
  })

  it('T8 photo is class-sized (28 / md:40), flex-wrapped, and photoFromMd hides it on phone', () => {
    let r = render(<PlayerCell row={row()} />)
    let img = r.getByTestId('headshot')
    expect(img.className).toContain('size-7')
    expect(img.className).toContain('md:size-10')
    expect(img.style.width).toBe('')
    expect(img.parentElement.className).toMatch(/\bflex\b/)
    expect(img.parentElement.className).not.toMatch(/\bhidden\b/)
    r.unmount()
    r = render(<PlayerCell row={row()} photoFromMd />)
    img = r.getByTestId('headshot')
    expect(img.parentElement.className).toMatch(/\bhidden\b/)
    expect(img.parentElement.className).toContain('md:flex')
  })

  it('footer renders inside the cell, under the sub-line', () => {
    const { getByTestId } = render(<PlayerCell row={row()} footer={<div data-testid="ft">F</div>} />)
    expect(getByTestId('player-cell')).toContainElement(getByTestId('ft'))
  })

  it('a non-numeric id renders the neutral placeholder, not an img', () => {
    const { queryByTestId } = render(<PlayerCell row={row({ player_id: 'p1' })} />)
    expect(queryByTestId('headshot')).toBeNull()
    expect(queryByTestId('headshot-fallback')).not.toBeNull()
  })
})

describe('SortTh className (W2b-2)', () => {
  const head = props => render(<table><thead><tr><SortTh label="Player" col="x" sortKey="y" sortAsc onSort={() => {}} {...props} /></tr></thead></table>).container.querySelector('th')
  it('T8b appends className, and without it adds nothing', () => {
    expect(head({ className: 'x-frozen' }).className).toContain('x-frozen')
    cleanup()
    const plain = head({}).className
    expect(plain).not.toContain('undefined')
    expect(plain.endsWith('text-dp-muted')).toBe(true)
  })
})

describe('ClickableRow', () => {
  it('T8 the row carries group/row so frozen cells can follow its hover', () => {
    const { container } = render(<table><tbody><ClickableRow row={{ player_id: 'x' }} onOpen={() => {}}><td>a</td></ClickableRow></tbody></table>)
    const tr = container.querySelector('tr')
    expect(tr.getAttribute('role')).toBe('button')
    expect(tr.className.split(/\s+/)).toContain('group/row')
  })
})

// W2b-1q — StatusChip colours
const css = () => readFileSync('src/index.css', 'utf8')
const token = (name) => css().match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))[1]
const lin = (c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) }
const contrast = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

describe('StatusChip', () => {
  it('T1 Questionable is outlined amber, not the severe colour', () => {
    const { getByTestId } = render(<StatusChip status="Questionable" />)
    const cls = getByTestId('status-flag').className
    expect(cls).toContain('text-dp-caution-text')
    expect(cls).toContain('border-dp-caution-border')
    expect(cls).not.toContain('text-dp-down-text')
    expect(cls).not.toContain('text-dp-severe-text')
  })

  it('T2 Out is filled red, not amber', () => {
    const { getByTestId } = render(<StatusChip status="Out" />)
    const cls = getByTestId('status-flag').className
    expect(cls).toContain('bg-dp-severe-bg')
    expect(cls).toContain('text-dp-severe-text')
    expect(cls).not.toContain('text-dp-caution-text')
    expect(cls).not.toContain('border-dp-caution-border')
  })

  it('T3 severe text is readable on the severe fill (>= 4.5:1)', () => {
    expect(contrast(token('dp-severe-text'), token('dp-severe-bg'))).toBeGreaterThanOrEqual(4.5)
  })

  it('T4 amber text is readable on the card (>= 4.5:1)', () => {
    expect(contrast(token('dp-caution-text'), token('dp-card'))).toBeGreaterThanOrEqual(4.5)
  })
})
