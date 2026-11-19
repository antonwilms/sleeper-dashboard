// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { FrozenScroll } from './FrozenScroll'

afterEach(cleanup)

describe('FrozenScroll', () => {
  it('T7 data-scrolled follows scrollLeft', () => {
    const { getByTestId } = render(<FrozenScroll><table /></FrozenScroll>)
    const el = getByTestId('frozen-scroll')
    expect(el.className).toContain('group/scroll')
    expect(el.getAttribute('data-scrolled')).toBe('false')
    el.scrollLeft = 40
    fireEvent.scroll(el)
    expect(el.getAttribute('data-scrolled')).toBe('true')
    el.scrollLeft = 0
    fireEvent.scroll(el)
    expect(el.getAttribute('data-scrolled')).toBe('false')
  })
})
