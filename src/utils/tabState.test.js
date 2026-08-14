import { describe, it, expect } from 'vitest'
import { addTab, removeTab } from './tabState'

describe('addTab', () => {
  it('appends a new id to an empty array', () => {
    expect(addTab([], 'a', 4)).toEqual(['a'])
  })

  it('appends a new id below the cap', () => {
    expect(addTab(['a', 'b'], 'c', 4)).toEqual(['a', 'b', 'c'])
  })

  it('returns the same array (no duplicate) when the id is already open', () => {
    const tabs = ['a', 'b', 'c']
    expect(addTab(tabs, 'b', 4)).toBe(tabs)
  })

  it('at the cap, evicts the OLDEST tab (FIFO) and appends the new one', () => {
    expect(addTab(['a', 'b', 'c', 'd'], 'e', 4)).toEqual(['b', 'c', 'd', 'e'])
  })

  it('does not evict when the id being opened is already the oldest tab at cap (no-op, already open)', () => {
    const tabs = ['a', 'b', 'c', 'd']
    expect(addTab(tabs, 'a', 4)).toBe(tabs)
  })
})

describe('removeTab', () => {
  it('removing a non-active tab leaves activeTab unchanged', () => {
    expect(removeTab(['a', 'b', 'c'], 'c', 'a')).toEqual({ tabs: ['b', 'c'], activeTab: 'c' })
  })

  it('removing the active tab activates its LEFT neighbour', () => {
    expect(removeTab(['a', 'b', 'c'], 'b', 'b')).toEqual({ tabs: ['a', 'c'], activeTab: 'a' })
  })

  it('removing the active FIRST tab activates the new first tab (clamped, no negative index)', () => {
    expect(removeTab(['a', 'b', 'c'], 'a', 'a')).toEqual({ tabs: ['b', 'c'], activeTab: 'b' })
  })

  it('removing the last remaining tab returns activeTab: null (closes the whole pop-up)', () => {
    expect(removeTab(['a'], 'a', 'a')).toEqual({ tabs: [], activeTab: null })
  })

  it('removing an id not present in tabs is a no-op', () => {
    expect(removeTab(['a', 'b'], 'a', 'z')).toEqual({ tabs: ['a', 'b'], activeTab: 'a' })
  })
})
