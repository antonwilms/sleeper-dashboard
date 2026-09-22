import { describe, it, expect } from 'vitest'
import { isFilledSlotId, alignStarterSlots, EMPTY_SLOT_ID, splitRosterIds, rosteredPlayers } from './rosterSlots'

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

describe('splitRosterIds', () => {
  it('live-shaped roster splits into four disjoint id lists, bench excluding reserve and taxi', () => {
    const roster = {
      players: ['s1', 's2', 'b1', 'ir1', 'tx1', 'tx2'],
      starters: ['s1', '0', 's2'],
      reserve: ['ir1'],
      taxi: ['tx1', 'tx2'],
    }
    expect(splitRosterIds(roster)).toEqual({
      starters: ['s1', 's2'],
      bench: ['b1'],
      reserve: ['ir1'],
      taxi: ['tx1', 'tx2'],
    })
  })

  it('null reserve/taxi -> [], bench = players − starters; {} -> four empty arrays', () => {
    const roster = { players: ['s1', 'b1'], starters: ['s1'], reserve: null, taxi: null }
    expect(splitRosterIds(roster)).toEqual({ starters: ['s1'], bench: ['b1'], reserve: [], taxi: [] })
    expect(splitRosterIds({})).toEqual({ starters: [], bench: [], reserve: [], taxi: [] })
  })
})

describe('rosteredPlayers', () => {
  it('includes taxi, orders starters -> bench -> reserve -> taxi, dedupes an id in both bench and taxi', () => {
    const team = {
      starters: [{ id: 's1', slot: 'Starter' }],
      bench: [{ id: 'b1', slot: 'Bench' }, { id: 'dup', slot: 'Bench' }],
      reserve: [{ id: 'ir1', slot: 'IR' }],
      taxi: [{ id: 'dup', slot: 'Taxi' }, { id: 'tx1', slot: 'Taxi' }],
    }
    const result = rosteredPlayers(team)
    expect(result.map(p => p.id)).toEqual(['s1', 'b1', 'dup', 'ir1', 'tx1'])
    expect(result.find(p => p.id === 'dup').slot).toBe('Bench')
  })

  it('an entry with no taxi key still works', () => {
    const team = { starters: [{ id: 's1' }], bench: [{ id: 'b1' }], reserve: [] }
    expect(rosteredPlayers(team).map(p => p.id)).toEqual(['s1', 'b1'])
  })
})
