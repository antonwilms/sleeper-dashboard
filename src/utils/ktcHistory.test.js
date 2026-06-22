import { describe, it, expect } from 'vitest'
import { computeKtcSignals, computeKtcRecentDelta } from './ktcHistory.js'

const ALL_KEYS = [
  'ktcHistDelta', 'ktcHistDeltaPct', 'ktcHistVolatility', 'ktcHistVolatilityPct',
  'ktcHistTrajectorySlope', 'ktcHistTrajectoryNormalized', 'ktcHistTrajectoryLabel',
  'ktcHistRankVsMedianTrend', 'ktcHistRankVsMedianLabel', 'ktcHistValueVsPosMedian',
  'ktcHistSampleSize', 'ktcHistWindowSpanDays', 'ktcHistConfidence',
]

function makePoint(date, value, positionRank = 5, valueVsPosMedian = 1.0) {
  return { date, value, positionRank, valueVsPosMedian }
}

describe('computeKtcSignals', () => {
  it('null series → all 13 keys, signal values null, sampleSize 0, confidence none', () => {
    const r = computeKtcSignals(null)
    expect(Object.keys(r).sort()).toEqual(ALL_KEYS.sort())
    expect(r.ktcHistSampleSize).toBe(0)
    expect(r.ktcHistConfidence).toBe('none')
    expect(r.ktcHistDelta).toBeNull()
    expect(r.ktcHistDeltaPct).toBeNull()
    expect(r.ktcHistVolatility).toBeNull()
    expect(r.ktcHistVolatilityPct).toBeNull()
    expect(r.ktcHistTrajectorySlope).toBeNull()
    expect(r.ktcHistTrajectoryNormalized).toBeNull()
    expect(r.ktcHistTrajectoryLabel).toBeNull()
    expect(r.ktcHistRankVsMedianTrend).toBeNull()
    expect(r.ktcHistRankVsMedianLabel).toBeNull()
    expect(r.ktcHistValueVsPosMedian).toBeNull()
    expect(r.ktcHistWindowSpanDays).toBeNull()
  })

  it('1-point series → same all-null shape, sampleSize 1', () => {
    const r = computeKtcSignals([makePoint('2026-01-01', 5000)])
    expect(Object.keys(r).sort()).toEqual(ALL_KEYS.sort())
    expect(r.ktcHistSampleSize).toBe(1)
    expect(r.ktcHistConfidence).toBe('none')
    expect(r.ktcHistDelta).toBeNull()
  })

  it('2-point rising series → correct delta, pct, label, confidence low', () => {
    const series = [
      makePoint('2026-01-01', 5000, 5, 1.2),
      makePoint('2026-01-08', 5500, 4, 1.3),
    ]
    const r = computeKtcSignals(series)
    expect(r.ktcHistSampleSize).toBe(2)
    expect(r.ktcHistDelta).toBe(500)      // 5500 - 5000
    expect(r.ktcHistDeltaPct).toBe(0.1)   // 500/5000=0.1 (rounded to 3dp)
    expect(r.ktcHistConfidence).toBe('low')
    expect(r.ktcHistTrajectoryLabel).toBe('rising')
    // windowSpanDays: (Jan 8 - Jan 1) = 7 days
    expect(r.ktcHistWindowSpanDays).toBe(7)
  })

  it('8-point series → confidence high, all signals populated', () => {
    // Manually build dates
    const dates8 = ['2026-01-01','2026-02-01','2026-03-01','2026-04-01',
                    '2026-05-01','2026-06-01','2026-07-01','2026-08-01']
    const series8 = dates8.map((d, i) => makePoint(d, 5000 + i * 100, 5 - Math.floor(i / 2), 1 + i * 0.05))

    const r = computeKtcSignals(series8)
    expect(r.ktcHistSampleSize).toBe(8)
    expect(r.ktcHistConfidence).toBe('high')
    expect(r.ktcHistTrajectorySlope).not.toBeNull()
    expect(r.ktcHistVolatility).not.toBeNull()
    expect(r.ktcHistValueVsPosMedian).not.toBeNull()
  })

  it('flat series → trajectory label flat', () => {
    // All same values → slope = 0 → normSlope = 0 → label flat
    const series = [
      makePoint('2026-01-01', 5000, 5, 1.0),
      makePoint('2026-01-08', 5000, 5, 1.0),
      makePoint('2026-01-15', 5000, 5, 1.0),
      makePoint('2026-01-22', 5000, 5, 1.0),
    ]
    const r = computeKtcSignals(series)
    expect(r.ktcHistTrajectoryLabel).toBe('flat')
    expect(r.ktcHistRankVsMedianLabel).toBe('flat')
  })

  it('falling series → trajectory label falling, rvm label losing', () => {
    const series = [
      makePoint('2026-01-01', 6000, 3, 1.5),
      makePoint('2026-01-08', 5500, 4, 1.3),
      makePoint('2026-01-15', 5000, 5, 1.0),
      makePoint('2026-01-22', 4500, 6, 0.8),
    ]
    const r = computeKtcSignals(series)
    expect(r.ktcHistTrajectoryLabel).toBe('falling')
    expect(r.ktcHistRankVsMedianLabel).toBe('losing')
  })

  it('windowSpanDays calculation — known 7-day span', () => {
    const series = [
      makePoint('2026-01-01', 5000),
      makePoint('2026-01-08', 5100),
    ]
    const r = computeKtcSignals(series)
    expect(r.ktcHistWindowSpanDays).toBe(7)
  })

  it('output shape contract — exactly 13 keys on every call', () => {
    const cases = [null, [], [makePoint('2026-01-01', 5000)],
      [makePoint('2026-01-01', 5000), makePoint('2026-01-08', 5100)]]
    for (const series of cases) {
      const r = computeKtcSignals(series)
      expect(Object.keys(r)).toHaveLength(13)
      expect(Object.keys(r).sort()).toEqual(ALL_KEYS.sort())
    }
  })
})

// ---------------------------------------------------------------------------
// computeKtcRecentDelta
// ---------------------------------------------------------------------------
describe('computeKtcRecentDelta', () => {
  // Helper: produce a date string N days before a fixed anchor (2026-03-01)
  function daysBefore(n) {
    const d = new Date('2026-03-01')
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }

  it('series spanning >30d → uses the point on-or-before (latest-30d) as ref', () => {
    // Points at day 45, 25, 10, 0 before anchor
    const series = [
      makePoint(daysBefore(45), 4000),
      makePoint(daysBefore(25), 4200),  // ← on-or-before cutoff (latest−30d = 30d ago → ≤ 30d ago)
      makePoint(daysBefore(10), 4400),
      makePoint(daysBefore(0),  4600),  // latest
    ]
    const r = computeKtcRecentDelta(series)
    // cutoff = latest − 30d; latest point on-or-before cutoff is the 25d-before point (≤ 30d before latest)
    // Wait: latest is day 0, cutoff = day -30 (i.e., daysBefore(30)).
    // day 45 = too old (> 30d before latest)
    // day 25 = on-or-before cutoff (25 < 30, so date >= cutoff)...
    // Actually let me re-think: cutoff = new Date(latest.date).getTime() - 30 * 86400000
    // latest = daysBefore(0) = 2026-03-01
    // cutoff = 2026-02-01 (30 days before latest)
    // series[i].date <= cutoff means the date is on-or-before 2026-02-01
    // daysBefore(25) = 2026-02-04 (25 days before 2026-03-01) -- AFTER cutoff
    // daysBefore(45) = 2026-01-15 (45 days before) -- BEFORE cutoff ✓
    // So ref = daysBefore(45) = 4000, and delta = 4600 - 4000 = 600
    expect(r).not.toBeNull()
    expect(r.delta).toBe(4600 - 4000)
    expect(r.delta).toBeGreaterThan(0)
    expect(r.spanDays).toBe(45)
    expect(r.toDate).toBe(daysBefore(0))
    expect(r.fromDate).toBe(daysBefore(45))
  })

  it('series spanning <30d → falls back to oldest; spanDays reflects actual span', () => {
    const series = [
      makePoint(daysBefore(10), 5000),
      makePoint(daysBefore(0),  4800),
    ]
    const r = computeKtcRecentDelta(series)
    expect(r).not.toBeNull()
    expect(r.delta).toBe(4800 - 5000)  // -200
    expect(r.spanDays).toBe(10)
    expect(r.fromDate).toBe(daysBefore(10))
  })

  it('1-point series → returns null', () => {
    expect(computeKtcRecentDelta([makePoint('2026-01-01', 5000)])).toBeNull()
  })

  it('null series → returns null', () => {
    expect(computeKtcRecentDelta(null)).toBeNull()
  })

  it('undefined series → returns null', () => {
    expect(computeKtcRecentDelta(undefined)).toBeNull()
  })

  it('rising values → positive delta', () => {
    const series = [makePoint(daysBefore(10), 3000), makePoint(daysBefore(0), 3500)]
    expect(computeKtcRecentDelta(series).delta).toBeGreaterThan(0)
  })

  it('falling values → negative delta', () => {
    const series = [makePoint(daysBefore(10), 3500), makePoint(daysBefore(0), 3000)]
    expect(computeKtcRecentDelta(series).delta).toBeLessThan(0)
  })
})
