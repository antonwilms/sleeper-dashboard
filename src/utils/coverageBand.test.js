import { describe, it, expect } from 'vitest'
import { COVERAGE_BANDS, coverageBand, pipCount } from './coverageBand'

describe('coverageBand', () => {
  it.each([
    [0, 'none'],
    [1, 'low'],
    [3, 'low'],
    [4, 'medium'],
    [6, 'medium'],
    [7, 'high'],
    [12, 'high'],
  ])('coverageBand(%i) === %s', (n, expected) => {
    expect(coverageBand(n)).toBe(expected)
  })

  it.each([
    [null], [undefined], [NaN], [-1], ['4'], [{}],
  ])('coverageBand(%o) is "none" for junk input', (n) => {
    expect(coverageBand(n)).toBe('none')
  })

  it('does not throw on any junk input', () => {
    expect(() => coverageBand(null)).not.toThrow()
    expect(() => coverageBand({})).not.toThrow()
  })
})

describe('pipCount', () => {
  it.each([
    ['none', 0],
    ['low', 1],
    ['medium', 2],
    ['high', 3],
  ])('pipCount(%s) === %i', (band, expected) => {
    expect(pipCount(band)).toBe(expected)
  })

  it('returns 0, not undefined, for an unrecognised band', () => {
    expect(pipCount('bogus')).toBe(0)
    expect(pipCount(undefined)).toBe(0)
  })
})

describe('COVERAGE_BANDS', () => {
  it('is ascending', () => {
    expect(COVERAGE_BANDS).toEqual(['none', 'low', 'medium', 'high'])
  })
})
