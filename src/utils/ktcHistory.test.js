import { describe, it, expect, vi, beforeEach } from 'vitest'
import { computeKtcSignals, loadKtcHistory } from './ktcHistory.js'
import { matchKTCToSleeper } from './ktcMatch'
import { setCacheWithMeta } from './cache'

vi.mock('../api/dataStore', () => ({
  isDataStoreReady: vi.fn().mockResolvedValue(true),
  tryDataStore: vi.fn(),
}))
vi.mock('./ktcMatch', () => ({ matchKTCToSleeper: vi.fn(() => new Map([['1', { value: 5000, confidence: 'high' }]])) }))
vi.mock('./cache', () => ({
  getCache: vi.fn(async key => (key === 'data-store/manifest'
    ? { files: { 'ktc/snapshot-2026-10-12.json': { lastModified: 'lm1' } } }
    : null)),
  setCacheWithMeta: vi.fn().mockResolvedValue(undefined),
}))

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

describe('loadKtcHistory — playerIds (CR-31)', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { tryDataStore } = await import('../api/dataStore')
    tryDataStore.mockResolvedValue([{ name: 'A', team: 'KC', value: 5000, position: 'WR' }])
  })

  it('forwards playerIds to matchKTCToSleeper for every snapshot', async () => {
    const playerIds = { version: 1, bySleeper: {} }
    await loadKtcHistory({ playersMap: { 1: { position: 'WR' } }, playerIds })
    expect(matchKTCToSleeper).toHaveBeenCalledTimes(1)
    expect(matchKTCToSleeper.mock.calls[0][2]).toBe(playerIds)
  })

  it('defaults playerIds to null and keeps the ktc-history/v1 cache key', async () => {
    await loadKtcHistory({ playersMap: { 1: { position: 'WR' } } })
    expect(matchKTCToSleeper.mock.calls[0][2]).toBeNull()
    expect(setCacheWithMeta.mock.calls[0][0]).toBe('ktc-history/v1')
  })
})
