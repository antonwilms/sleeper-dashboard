import { describe, it, expect } from 'vitest'
import { DISTRIBUTION_BUCKETS, bucketPoints, bucketAxisPercent } from './distribution'

describe('bucketPoints', () => {
  it('buckets sum to the pooled count', () => {
    const points = [-4, -0.1, 0, 3, 5, 9.9, 12, 20, 24.9, 25, 34.9, 35, 40, 60]
    const buckets = bucketPoints(points)
    const total = buckets.reduce((s, b) => s + b.count, 0)
    expect(total).toBe(points.length)
  })

  it('negative points land in the "<0" bucket, not "0-5" and not dropped', () => {
    const buckets = bucketPoints([-6, -0.01, 0])
    const neg = buckets.find(b => b.id === 'neg')
    const zeroFive = buckets.find(b => b.id === '0-5')
    expect(neg.count).toBe(2)
    expect(zeroFive.count).toBe(1) // the literal 0 belongs in 0-5, not <0
  })

  it('every bucket is present even when empty (a void slot, not omitted)', () => {
    const buckets = bucketPoints([12])
    expect(buckets).toHaveLength(DISTRIBUTION_BUCKETS.length)
    expect(buckets.filter(b => b.count === 0).length).toBe(DISTRIBUTION_BUCKETS.length - 1)
  })

  it('35+ is open-ended', () => {
    const buckets = bucketPoints([35, 60, 200])
    expect(buckets.find(b => b.id === '35+').count).toBe(3)
  })

  it('empty input: every bucket count 0, sums to 0', () => {
    const buckets = bucketPoints([])
    expect(buckets.every(b => b.count === 0)).toBe(true)
  })
})

describe('bucketAxisPercent', () => {
  it('clamps to [0, 100]', () => {
    expect(bucketAxisPercent(-100)).toBe(0)
    expect(bucketAxisPercent(1000)).toBe(100)
  })
  it('monotonic — a higher value never maps to a lower percent', () => {
    expect(bucketAxisPercent(10)).toBeGreaterThan(bucketAxisPercent(5))
  })
})
