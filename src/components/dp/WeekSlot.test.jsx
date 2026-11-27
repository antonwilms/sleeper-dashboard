// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { WeekSlot, weekSlotHeight } from './WeekSlot'

afterEach(cleanup)

const W = 5
const TRACK = 18

describe('WeekSlot — WSL-1 the week-slot vocabulary', () => {
  const CASES = [
    { name: 'played with a bar height', props: { kind: 'played', barHeight: 9, barClassName: 'bg-dp-chip' }, mark: 'bar', markH: 9, base: 'solid', area: 'bar' },
    { name: 'played with no value', props: { kind: 'played' }, mark: null, base: 'void' },
    { name: 'dnp', props: { kind: 'dnp' }, mark: 'dnp', markH: W, base: 'solid', area: 'below' },
    { name: 'bye', props: { kind: 'bye' }, mark: 'bye', markH: W, base: 'solid', area: 'below' },
    { name: 'unknown', props: { kind: 'unknown' }, mark: null, base: 'void' },
    { name: 'any other kind', props: { kind: 'future', barHeight: 9 }, mark: null, base: 'void' },
  ]

  it.each(CASES)('$name', ({ props, mark, markH, base, area }) => {
    const { container } = render(<WeekSlot width={W} trackH={TRACK} data-testid="slot" title="t" {...props} />)
    const slot = container.firstElementChild
    expect(slot.getAttribute('data-testid')).toBe('slot')
    expect(slot.getAttribute('title')).toBe('t')
    expect(slot.style.height).toBe(`${weekSlotHeight(TRACK, W)}px`)
    expect(weekSlotHeight(TRACK, W)).toBe(TRACK + 1 + 1 + W)
    expect(slot.style.width).toBe(`${W}px`)
    expect(slot.textContent).toBe('')

    const marks = [...slot.querySelectorAll('[data-slot-mark]')]
    expect(marks.map(m => m.getAttribute('data-slot-mark'))).toEqual(mark ? [mark] : [])
    const barArea = slot.querySelector('[data-slot-area="bar"]')
    const belowArea = slot.querySelector('[data-slot-area="below"]')
    expect(barArea.style.height).toBe(`${TRACK}px`)
    expect(belowArea.style.height).toBe(`${W}px`)
    // Only a played bar rises above the baseline; bye and dnp marks sit below it.
    expect(barArea.querySelectorAll('[data-slot-mark]')).toHaveLength(area === 'bar' ? 1 : 0)
    expect(belowArea.querySelectorAll('[data-slot-mark]')).toHaveLength(area === 'below' ? 1 : 0)
    if (mark === 'bye') {
      expect(belowArea.querySelector('svg[data-slot-mark="bye"] circle').getAttribute('fill')).toBe('none')
      expect(slot.innerHTML).not.toContain('bg-dp-bye-hatch')
    }
    if (mark === 'dnp') {
      expect(marks[0].tagName.toLowerCase()).toBe('svg')
      expect(marks[0].getAttribute('width')).toBe(String(W))
      expect(marks[0].getAttribute('height')).toBe(String(markH))
      expect(marks[0].querySelector('path').getAttribute('stroke')).toBe('var(--color-dp-missed)')
    } else if (mark === 'bye') {
      expect(marks[0].tagName.toLowerCase()).toBe('svg')
      expect(marks[0].getAttribute('height')).toBe(String(markH))
    } else if (mark) {
      expect(marks[0].style.height).toBe(`${markH}px`)
      expect(marks[0].className).toContain('bg-dp-chip')
    }

    const last = slot.querySelector('[data-slot-base]')
    expect(last.getAttribute('data-slot-base')).toBe(base)
    if (base === 'solid') {
      expect(last.style.height).toBe('1px')
      expect(last.className).toContain('bg-dp-border-row')
    } else {
      expect(last.firstElementChild.style.borderTop).toContain('1px dashed')
    }
  })
})
