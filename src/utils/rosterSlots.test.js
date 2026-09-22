import { describe, it, expect } from 'vitest'
import { isFilledSlotId, alignStarterSlots, EMPTY_SLOT_ID } from './rosterSlots'

describe('isFilledSlotId', () => {
  it('rejects the empty-slot sentinel, null and empty string; accepts a real id', () => {
    expect(isFilledSlotId(EMPTY_SLOT_ID)).toBe(false)
    expect(isFilledSlotId('0')).toBe(false)
    expect(isFilledSlotId(null)).toBe(false)
    expect(isFilledSlotId('')).toBe(false)
    expect(isFilledSlotId('4046')).toBe(true)
  })
})

describe('alignStarterSlots', () => {
  it('has the same length as the input, with nulls at every empty-slot index (never filtered)', () => {
    const aligned = alignStarterSlots(['a', null, '', '0', 'b'])
    expect(aligned).toHaveLength(5)
    expect(aligned[1]).toBeNull()
    expect(aligned[2]).toBeNull()
    expect(aligned[3]).toBeNull()
    expect(aligned[0]).toBe('a')
    expect(aligned[4]).toBe('b')
  })

  it('never re-sorts — filled ids keep their original index', () => {
    const aligned = alignStarterSlots(['qb1', '0', 'wr1'])
    expect(aligned).toEqual(['qb1', null, 'wr1'])
  })

  it('an absent input returns an empty array, not a throw', () => {
    expect(alignStarterSlots(undefined)).toEqual([])
    expect(alignStarterSlots(null)).toEqual([])
  })
})
