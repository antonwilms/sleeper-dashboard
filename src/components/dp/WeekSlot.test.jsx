// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { WeekSlot } from './WeekSlot'

afterEach(cleanup)

const W = 5
const TRACK = 18

describe('WeekSlot — WSL-1 the week-slot vocabulary', () => {
  const CASES = [
    { name: 'played with a bar height', props: { kind: 'played', barHeight: 9, barClassName: 'bg-dp-chip' }, mark: 'bar', markH: 9, base: 'solid' },
    { name: 'played with no value', props: { kind: 'played' }, mark: null, base: 'void' },
    { name: 'dnp', props: { kind: 'dnp' }, mark: 'dnp', markH: W, base: 'solid' },
    { name: 'bye', props: { kind: 'bye' }, mark: 'bye', markH: W, base: 'solid' },
    { name: 'unknown', props: { kind: 'unknown' }, mark: null, base: 'void' },
    { name: 'any other kind', props: { kind: 'future', barHeight: 9 }, mark: null, base: 'void' },
  ]

  it.each(CASES)('$name', ({ props, mark, markH, base }) => {
    const { container } = render(<WeekSlot width={W} trackH={TRACK} data-testid="slot" title="t" {...props} />)
    const slot = container.firstElementChild
    expect(slot.getAttribute('data-testid')).toBe('slot')
    expect(slot.getAttribute('title')).toBe('t')
    expect(slot.style.height).toBe(`${TRACK + 1}px`)
    expect(slot.style.width).toBe(`${W}px`)
    expect(slot.textContent).toBe('')

    const marks = [...slot.querySelectorAll('[data-slot-mark]')]
    expect(marks.map(m => m.getAttribute('data-slot-mark'))).toEqual(mark ? [mark] : [])
    if (mark === 'dnp') {
      expect(marks[0].tagName.toLowerCase()).toBe('svg')
      expect(marks[0].getAttribute('width')).toBe(String(W))
      expect(marks[0].getAttribute('height')).toBe(String(markH))
      expect(marks[0].querySelector('path').getAttribute('stroke')).toBe('var(--color-dp-missed)')
    } else if (mark) {
      expect(marks[0].style.height).toBe(`${markH}px`)
      expect(marks[0].className).toContain(mark === 'bye' ? 'bg-dp-bye-hatch' : 'bg-dp-chip')
    }

    const last = slot.lastElementChild
    expect(last.getAttribute('data-slot-base')).toBe(base)
    if (base === 'solid') {
      expect(last.style.height).toBe('1px')
      expect(last.className).toContain('bg-dp-border-row')
    } else {
      expect(last.firstElementChild.style.borderTop).toContain('1px dashed')
    }
  })
})
