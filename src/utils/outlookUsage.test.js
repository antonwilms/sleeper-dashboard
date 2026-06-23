import { describe, it, expect } from 'vitest'
import { buildUsageHistory, computeUsageTrend, buildRoleCohort, classifyRole } from './outlookUsage.js'

// ---------------------------------------------------------------------------
// buildUsageHistory
// ---------------------------------------------------------------------------
describe('buildUsageHistory', () => {
  const careerStats = {
    2020: {
      p1: { gamesPlayed: 12, fantasyPoints: 180, stats: { off_snp: 600, tm_off_snp: 1000 } }
    },
    2021: {
      p1: { gamesPlayed: 14, fantasyPoints: 210, stats: { off_snp: 735, tm_off_snp: 1050 } }
    }
  }
  const historicalShares = {
    p1: [
      { season: 2020, share: 0.22, gamesPlayed: 12 },
      { season: 2021, share: 0.25, gamesPlayed: 14 }
    ]
  }

  it('WR — 2 rows oldest→newest; correct ppg/snapPct/share/shareMetric', () => {
    const result = buildUsageHistory('p1', 'WR', careerStats, historicalShares)
    expect(result).toHaveLength(2)
    expect(result[0].season).toBe(2020)
    expect(result[0].ppg).toBe(15)         // r2(180/12) = 15.00
    expect(result[0].snapPct).toBe(0.6)    // r3(600/1000) = 0.600
    expect(result[0].share).toBe(0.22)     // from historicalShares, NOT recomputed
    expect(result[0].shareMetric).toBe('target')
    expect(result[1].season).toBe(2021)
    expect(result[1].ppg).toBe(15)         // r2(210/14) = 15.00
    expect(result[1].snapPct).toBe(0.7)    // r3(735/1050) = 0.700
    expect(result[1].share).toBe(0.25)
  })

  it('RB — shareMetric=carry', () => {
    const result = buildUsageHistory('p1', 'RB', careerStats, historicalShares)
    expect(result[0].shareMetric).toBe('carry')
  })

  it('QB — all snapPct and share are null', () => {
    const result = buildUsageHistory('p1', 'QB', careerStats, historicalShares)
    expect(result.every(r => r.snapPct === null)).toBe(true)
    expect(result.every(r => r.share === null)).toBe(true)
  })

  it('season with gamesPlayed:0 is omitted', () => {
    const cs = { 2020: { p1: { gamesPlayed: 0, fantasyPoints: 0, stats: {} } } }
    expect(buildUsageHistory('p1', 'WR', cs, {})).toHaveLength(0)
  })

  it('tm_off_snp:0 → snapPct:null (no NaN)', () => {
    const cs = { 2020: { p1: { gamesPlayed: 10, fantasyPoints: 100, stats: { off_snp: 500, tm_off_snp: 0 } } } }
    const result = buildUsageHistory('p1', 'WR', cs, {})
    expect(result[0].snapPct).toBeNull()
  })

  it('missing tm_off_snp → snapPct:null', () => {
    const cs = { 2020: { p1: { gamesPlayed: 10, fantasyPoints: 100, stats: { off_snp: 500 } } } }
    const result = buildUsageHistory('p1', 'WR', cs, {})
    expect(result[0].snapPct).toBeNull()
  })

  it('player absent from historicalShares → share:null, no throw', () => {
    const result = buildUsageHistory('p99', 'WR', careerStats, historicalShares)
    expect(result.every(r => r.share === null)).toBe(true)
  })

  it('null careerStats → []', () => {
    expect(buildUsageHistory('p1', 'WR', null, historicalShares)).toEqual([])
  })

  it('empty careerStats → []', () => {
    expect(buildUsageHistory('p1', 'WR', {}, historicalShares)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// computeUsageTrend
// ---------------------------------------------------------------------------
describe('computeUsageTrend', () => {
  it('2+ snap seasons → correct delta/direction/latestSeason/priorSeason', () => {
    const h = [
      { season: 2020, snapPct: 0.50 },
      { season: 2021, snapPct: 0.62 },
    ]
    const t = computeUsageTrend(h, 'snapPct')
    expect(t.delta).toBeCloseTo(0.12)
    expect(t.direction).toBe('up')
    expect(t.latestSeason).toBe(2021)
    expect(t.priorSeason).toBe(2020)
    expect(t.latest).toBe(0.62)
    expect(t.prior).toBe(0.50)
  })

  it('dead-band: |delta| < 0.01 → flat; delta > 0.01 → up; delta < -0.01 → down', () => {
    // Use deltas well inside/outside the ±0.01 dead-band to avoid float precision issues
    const flat = computeUsageTrend([{ season: 2020, snapPct: 0.50 }, { season: 2021, snapPct: 0.506 }], 'snapPct')
    expect(flat.direction).toBe('flat')     // delta ≈ 0.006 < TREND_EPS
    const up = computeUsageTrend([{ season: 2020, snapPct: 0.50 }, { season: 2021, snapPct: 0.515 }], 'snapPct')
    expect(up.direction).toBe('up')         // delta ≈ 0.015 > TREND_EPS
    const down = computeUsageTrend([{ season: 2020, snapPct: 0.50 }, { season: 2021, snapPct: 0.485 }], 'snapPct')
    expect(down.direction).toBe('down')     // delta ≈ -0.015 < -TREND_EPS
  })

  it('1 metric season → null', () => {
    const h = [{ season: 2020, snapPct: 0.50 }]
    expect(computeUsageTrend(h, 'snapPct')).toBeNull()
  })

  it('0 metric seasons → null', () => {
    expect(computeUsageTrend([], 'snapPct')).toBeNull()
  })

  it('gap season: uses last two WITH the metric; latestSeason/priorSeason reflect the gap', () => {
    const h = [
      { season: 2020, snapPct: 0.50 },
      { season: 2021, snapPct: null },
      { season: 2022, snapPct: 0.60 },
    ]
    const t = computeUsageTrend(h, 'snapPct')
    expect(t.latestSeason).toBe(2022)
    expect(t.priorSeason).toBe(2020)
    expect(t.direction).toBe('up')
  })

  it('same fn drives share key', () => {
    const h = [{ season: 2020, share: 0.20 }, { season: 2021, share: 0.15 }]
    const t = computeUsageTrend(h, 'share')
    expect(t.direction).toBe('down')
    expect(t.latestSeason).toBe(2021)
  })
})

// ---------------------------------------------------------------------------
// buildRoleCohort / classifyRole
// ---------------------------------------------------------------------------
describe('buildRoleCohort / classifyRole', () => {
  // 6 RBs: share=[0.10,0.20,0.25,0.30,0.35,0.40], snap=[0.40,0.50,0.55,0.60,0.65,0.75]
  // t33(share) ≈ 0.2325,  t67(share) ≈ 0.3175
  // s67(snap)  ≈ 0.6175
  const rbData = [
    { share: 0.10, snap: 0.40 },
    { share: 0.20, snap: 0.50 },
    { share: 0.25, snap: 0.55 },
    { share: 0.30, snap: 0.60 },
    { share: 0.35, snap: 0.65 },
    { share: 0.40, snap: 0.75 },
  ]
  const rbRows = rbData.map((_, i) => ({ player_id: `RB${i}`, position: 'RB' }))
  const rbUsage = new Map(rbData.map((d, i) => [
    `RB${i}`,
    [{ season: 2024, games: 15, ppg: 10, snapPct: d.snap, share: d.share, shareMetric: 'carry' }]
  ]))

  it('≥6 RBs → cohort has non-null share and snap tertiles', () => {
    const cohort = buildRoleCohort(rbRows, rbUsage)
    expect(cohort.RB.share).not.toBeNull()
    expect(cohort.RB.snap).not.toBeNull()
  })

  it('Every-down back: top share + top snap', () => {
    const cohort = buildRoleCohort(rbRows, rbUsage)
    expect(classifyRole({ position: 'RB', share: 0.40, snapPct: 0.75 }, cohort)).toBe('Every-down back')
  })

  it('Lead back: top share, below-s67 snap', () => {
    const cohort = buildRoleCohort(rbRows, rbUsage)
    // share=0.35 ≥ c67≈0.3175; snap=0.55 < s67≈0.6175
    expect(classifyRole({ position: 'RB', share: 0.35, snapPct: 0.55 }, cohort)).toBe('Lead back')
  })

  it('Committee back: mid share', () => {
    const cohort = buildRoleCohort(rbRows, rbUsage)
    // share=0.25 ≥ c33≈0.2325 but < c67≈0.3175
    expect(classifyRole({ position: 'RB', share: 0.25, snapPct: 0.60 }, cohort)).toBe('Committee back')
  })

  it('Rotational back: low share', () => {
    const cohort = buildRoleCohort(rbRows, rbUsage)
    // share=0.10 < c33≈0.2325
    expect(classifyRole({ position: 'RB', share: 0.10, snapPct: 0.40 }, cohort)).toBe('Rotational back')
  })

  it('WR: Every-down / Primary target / Secondary target / Rotational', () => {
    const wrRows = rbData.map((_, i) => ({ player_id: `WR${i}`, position: 'WR' }))
    const wrUsage = new Map(rbData.map((d, i) => [
      `WR${i}`,
      [{ season: 2024, games: 15, ppg: 10, snapPct: d.snap, share: d.share, shareMetric: 'target' }]
    ]))
    const cohort = buildRoleCohort(wrRows, wrUsage)
    expect(classifyRole({ position: 'WR', share: 0.40, snapPct: 0.75 }, cohort)).toBe('Every-down')
    expect(classifyRole({ position: 'WR', share: 0.35, snapPct: 0.55 }, cohort)).toBe('Primary target')
    expect(classifyRole({ position: 'WR', share: 0.25, snapPct: 0.60 }, cohort)).toBe('Secondary target')
    expect(classifyRole({ position: 'WR', share: 0.10, snapPct: 0.40 }, cohort)).toBe('Rotational')
  })

  it('snap=null at top share → qualifier dropped (Lead back, not Every-down back)', () => {
    const cohort = buildRoleCohort(rbRows, rbUsage)
    expect(classifyRole({ position: 'RB', share: 0.40, snapPct: null }, cohort)).toBe('Lead back')
  })

  it('QB → null', () => {
    const cohort = buildRoleCohort(rbRows, rbUsage)
    expect(classifyRole({ position: 'QB', share: 0.5, snapPct: 0.95 }, cohort)).toBeNull()
  })

  it('missing share → null', () => {
    const cohort = buildRoleCohort(rbRows, rbUsage)
    expect(classifyRole({ position: 'RB', share: null, snapPct: 0.6 }, cohort)).toBeNull()
  })

  it('pool <6 → share cohort null → classifyRole returns null', () => {
    const smallRows = [{ player_id: 'RBa', position: 'RB' }]
    const smallUsage = new Map([
      ['RBa', [{ season: 2024, games: 15, ppg: 10, snapPct: 0.6, share: 0.3, shareMetric: 'carry' }]]
    ])
    const cohort = buildRoleCohort(smallRows, smallUsage)
    expect(cohort.RB.share).toBeNull()
    expect(classifyRole({ position: 'RB', share: 0.3, snapPct: 0.6 }, cohort)).toBeNull()
  })
})
