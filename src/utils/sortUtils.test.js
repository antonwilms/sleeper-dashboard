import { describe, it, expect } from 'vitest'
import { compareNullsLast } from './sortUtils'

describe('compareNullsLast', () => {
  // null/undefined nullish detection
  it('null vs null → 0', () => expect(compareNullsLast(null, null, 1)).toBe(0))
  it('undefined vs undefined → 0', () => expect(compareNullsLast(undefined, undefined, 1)).toBe(0))
  it('null vs null desc → 0', () => expect(compareNullsLast(null, null, -1)).toBe(0))

  // NaN nullish detection
  it('NaN vs NaN → 0', () => expect(compareNullsLast(NaN, NaN, 1)).toBe(0))
  it('NaN vs number → sinks (> 0) asc', () => expect(compareNullsLast(NaN, 5, 1)).toBeGreaterThan(0))
  it('NaN vs number → sinks (> 0) desc (key test — fails without NaN guard)', () => {
    expect(compareNullsLast(NaN, 5, -1)).toBeGreaterThan(0)
  })
  it('number vs NaN → -1', () => expect(compareNullsLast(5, NaN, 1)).toBeLessThan(0))

  // THE CORE BUG TEST: null must sink in both directions
  it('null vs number → sinks (> 0) ascending', () => {
    expect(compareNullsLast(null, 5, 1)).toBeGreaterThan(0)
  })
  it('null vs number → sinks (> 0) descending — would fail with `return dir` bug', () => {
    expect(compareNullsLast(null, 5, -1)).toBeGreaterThan(0)
  })
  it('number vs null → rises (< 0) ascending', () => {
    expect(compareNullsLast(5, null, 1)).toBeLessThan(0)
  })
  it('number vs null → rises (< 0) descending — would fail with `return -dir` bug', () => {
    expect(compareNullsLast(5, null, -1)).toBeLessThan(0)
  })
  it('undefined vs number → sinks (> 0) descending', () => {
    expect(compareNullsLast(undefined, 3, -1)).toBeGreaterThan(0)
  })

  // Numeric non-null comparison is direction-sensitive
  it('1 vs 2 ascending → negative (1 before 2)', () => {
    expect(compareNullsLast(1, 2, 1)).toBeLessThan(0)
  })
  it('1 vs 2 descending → positive (2 before 1)', () => {
    expect(compareNullsLast(1, 2, -1)).toBeGreaterThan(0)
  })
  it('equal numbers → 0', () => expect(compareNullsLast(5, 5, 1)).toBe(0))

  // String comparison is direction-sensitive
  it('string "a" vs "b" ascending → negative', () => {
    expect(compareNullsLast('a', 'b', 1)).toBeLessThan(0)
  })
  it('string "a" vs "b" descending → positive', () => {
    expect(compareNullsLast('a', 'b', -1)).toBeGreaterThan(0)
  })
  it('null vs string → sinks (> 0) descending', () => {
    expect(compareNullsLast(null, 'Mahomes', -1)).toBeGreaterThan(0)
  })
})
