import { describe, it, expect } from 'vitest'
import { depthLabel } from './depthLabel'

describe('depthLabel', () => {
  it('DL-1 is fantasy position + order, never the slot code; null when a field is missing; order 0 is a value', () => {
    expect(depthLabel('WR', 'LWR', 2)).toBe('WR2')
    expect(depthLabel('QB', 'QB', 1)).toBe('QB1')
    expect(depthLabel(null, 'LWR', 2)).toBeNull()
    expect(depthLabel('WR', null, 2)).toBeNull()
    expect(depthLabel('WR', 'LWR', null)).toBeNull()
    expect(depthLabel('WR', 'LWR', 0)).toBe('WR0')
  })
})
