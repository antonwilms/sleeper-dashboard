import { describe, it, expect } from 'vitest'
import { alignToAxis, buildMetricRow, METRIC_META } from './usageEfficiency'

describe('alignToAxis', () => {
  it('projects a sparse series onto the axis; gap seasons become null, not omitted', () => {
    const series = [{ season: 2021, value: 10 }, { season: 2023, value: 12 }]
    expect(alignToAxis(series, [2021, 2022, 2023, 2024], 'value')).toEqual([10, null, 12, null])
  })

  it('a season present but non-finite becomes null', () => {
    const series = [{ season: 2021, value: NaN }, { season: 2022, value: 5 }]
    expect(alignToAxis(series, [2021, 2022], 'value')).toEqual([null, 5])
  })

  it('reads an arbitrary value key (e.g. snapPct from buildUsageHistory rows)', () => {
    const history = [{ season: 2021, snapPct: 0.4 }, { season: 2022, snapPct: null }]
    expect(alignToAxis(history, [2021, 2022], 'snapPct')).toEqual([0.4, null])
  })

  it('empty/undefined series → all null, never throws', () => {
    expect(alignToAxis(undefined, [2021, 2022], 'value')).toEqual([null, null])
    expect(alignToAxis([], [2021, 2022], 'value')).toEqual([null, null])
  })
})

describe('buildMetricRow', () => {
  const axis = [2021, 2022, 2023, 2024, 2025]

  it('latest is the most recent non-null entry, not necessarily axis[-1]', () => {
    const values = [10, 12, 14, null, null] // player didn't qualify the last two seasons shown
    const row = buildMetricRow('cmpPct', values, axis)
    expect(row.latest).toEqual({ value: 14, season: 2023 })
  })

  it('delta is latest vs axis[0] specifically — not latest vs prior', () => {
    const values = [10, 99, 99, 99, 20] // a middle spike that a "vs prior" comparison would catch instead
    const row = buildMetricRow('cmpPct', values, axis)
    expect(row.delta).toBeCloseTo(10) // 20 - 10, not 20 - 99
  })

  it('delta is null when the first season shown has no value — never substitutes a later baseline', () => {
    const values = [null, 12, 14, 16, 18]
    const row = buildMetricRow('cmpPct', values, axis)
    expect(row.latest.value).toBe(18)
    expect(row.delta).toBeNull()
  })

  it('coverageCount is the count of real (non-null) values on the axis', () => {
    const values = [10, null, 14, null, 18]
    const row = buildMetricRow('cmpPct', values, axis)
    expect(row.coverageCount).toBe(3)
  })

  it('all-null series: latest and delta both null, coverage 0', () => {
    const row = buildMetricRow('sacks', [null, null, null, null, null], axis)
    expect(row.latest).toBeNull()
    expect(row.delta).toBeNull()
    expect(row.coverageCount).toBe(0)
  })

  it('meta is attached and formatting matches the metric id', () => {
    const row = buildMetricRow('rushShare', [0.42], [2025])
    expect(row.meta).toBe(METRIC_META.rushShare)
    expect(row.meta.format(0.42)).toBe('42.0%')
  })
})

describe('METRIC_META — domain and formatting', () => {
  it('bounded fraction metrics carry an explicit [0,1] domain (share series unreadable auto-scaled)', () => {
    for (const id of ['rushShare', 'rbTargetShare', 'targetShare', 'airYardsShare', 'snapShare']) {
      expect(METRIC_META[id].domain).toEqual([0, 1])
    }
  })

  it('cmpPct is on a 0-100 scale, not 0-1 (computeSeasonAverages.compPct convention)', () => {
    expect(METRIC_META.cmpPct.domain).toEqual([0, 100])
    expect(METRIC_META.cmpPct.format(63.4)).toBe('63.4%')
  })

  it('unbounded count/ratio metrics have no fixed domain — a guessed ceiling risks clipping', () => {
    expect(METRIC_META.sacks.domain).toBeNull()
    expect(METRIC_META.yardsPerCarry.domain).toBeNull()
    expect(METRIC_META.aDOT.domain).toBeNull()
  })

  it('deltaFormat signs positive and negative correctly', () => {
    expect(METRIC_META.rushShare.deltaFormat(0.05)).toBe('+5.0pp')
    expect(METRIC_META.rushShare.deltaFormat(-0.05)).toBe('-5.0pp')
    expect(METRIC_META.sacks.deltaFormat(3)).toBe('+3')
    expect(METRIC_META.sacks.deltaFormat(-3)).toBe('-3')
  })
})
