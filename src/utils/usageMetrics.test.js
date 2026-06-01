/**
 * src/utils/usageMetrics.test.js
 *
 * Unit tests for computeUsageFactors — the D2 snap-share and own-rate red-zone
 * usage factors. Pure (node env), no mocks.
 *
 * COHORT ISOLATION
 * ----------------
 * usageMetrics.js memoises the cohort table by careerStats object identity.
 * Each test builds its own careerStats object (via makeCohort), so the cohort
 * is always rebuilt fresh and no state bleeds between tests.
 */

import { describe, it, expect } from 'vitest'
import { computeUsageFactors } from './usageMetrics.js'

// ─── Cohort builder ───────────────────────────────────────────────────────────

// Per-position opportunity / RZ stat keys. opp = 100 clears every MIN gate
// (rush 30 · rec 20 · pass 50).
const POS_KEYS = {
  RB: { opp: 'rush_att', rz: 'rush_rz_att' },
  WR: { opp: 'rec_tgt',  rz: 'rec_rz_tgt'  },
  TE: { opp: 'rec_tgt',  rz: 'rec_rz_tgt'  },
  QB: { opp: 'pass_att', rz: 'pass_rz_att' },
}

/**
 * Build a single-season ({ 2024 }) cohort for one position.
 * Each element index i becomes one cohort player with the given snap share
 * (off_snp = share × 1000, tm_off_snp = 1000) and/or RZ own-rate (opp = 100).
 * Returns a fresh { careerStats, playersMap } so the module cohort cache rebuilds.
 */
function makeCohort(prefix, position, { snapShares = [], rzRates = [] } = {}) {
  const keys = POS_KEYS[position]
  const playersMap = {}
  const season = {}
  const n = Math.max(snapShares.length, rzRates.length)
  for (let i = 0; i < n; i++) {
    const id = `${prefix}_${i}`
    playersMap[id] = { position }
    const stats = {}
    if (snapShares[i] != null) {
      stats.off_snp = Math.round(snapShares[i] * 1000)
      stats.tm_off_snp = 1000
    }
    if (rzRates[i] != null) {
      stats[keys.opp] = 100
      stats[keys.rz]  = Math.round(rzRates[i] * 100)
    }
    season[id] = { stats }
  }
  return { playersMap, careerStats: { 2024: season } }
}

const RB_SNAP = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70]
const RZ_RATES = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL A — SNAP SHARE
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeUsageFactors — snap share', () => {
  it('high snap share within cohort → snapShareFactor > 1', () => {
    const { careerStats, playersMap } = makeCohort('snhi', 'RB', { snapShares: RB_SNAP })
    const stats = { off_snp: 700, tm_off_snp: 1000, rush_att: 100, rush_rz_att: 15 }
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.snapShare).toBe(0.7)
    expect(r.snapShareFactor).toBeGreaterThan(1)
    expect(r.snapShareFactor).toBeLessThanOrEqual(1.06)
  })

  it('low snap share within cohort → snapShareFactor < 1', () => {
    const { careerStats, playersMap } = makeCohort('snlo', 'RB', { snapShares: RB_SNAP })
    const stats = { off_snp: 200, tm_off_snp: 1000, rush_att: 100, rush_rz_att: 15 }
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.snapShare).toBe(0.2)
    expect(r.snapShareFactor).toBeLessThan(1)
    expect(r.snapShareFactor).toBeGreaterThanOrEqual(0.94)
  })

  it('missing off_snp → neutral snap factor, null share', () => {
    const { careerStats, playersMap } = makeCohort('snmiss', 'RB', { snapShares: RB_SNAP })
    const stats = { tm_off_snp: 1000, rush_att: 100, rush_rz_att: 15 }
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.snapShare).toBeNull()
    expect(r.snapShareFactor).toBe(1.0)
  })

  it('missing tm_off_snp → neutral snap factor, null share', () => {
    const { careerStats, playersMap } = makeCohort('sntmmiss', 'RB', { snapShares: RB_SNAP })
    const stats = { off_snp: 500, rush_att: 100, rush_rz_att: 15 }
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.snapShare).toBeNull()
    expect(r.snapShareFactor).toBe(1.0)
  })

  it('tm_off_snp = 0 → neutral snap factor, null share', () => {
    const { careerStats, playersMap } = makeCohort('sntmzero', 'RB', { snapShares: RB_SNAP })
    const stats = { off_snp: 500, tm_off_snp: 0, rush_att: 100, rush_rz_att: 15 }
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.snapShare).toBeNull()
    expect(r.snapShareFactor).toBe(1.0)
  })

  it('QB is gated out of snap share entirely (null/neutral despite full data)', () => {
    // Build a QB cohort with snap data present — QB snap is still gated.
    const { careerStats, playersMap } = makeCohort('qbsnap', 'QB', {
      snapShares: [0.90, 0.92, 0.94, 0.96, 0.98],
      rzRates:    RZ_RATES.slice(0, 5),
    })
    const stats = { off_snp: 950, tm_off_snp: 1000, pass_att: 100, pass_rz_att: 14 }
    const r = computeUsageFactors('QB', stats, careerStats, playersMap)

    expect(r.snapShare).toBeNull()
    expect(r.snapShareFactor).toBe(1.0)
    // QB RZ pass-rate still fires (not gated).
    expect(r.rzUsageCategory).toBe('pass')
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// SIGNAL B — OWN-RATE RED-ZONE USAGE
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeUsageFactors — red-zone usage', () => {
  it('RB high rush RZ rate → rzUsageFactor > 1, category rush', () => {
    const { careerStats, playersMap } = makeCohort('rzrbhi', 'RB', { rzRates: RZ_RATES })
    const stats = { rush_att: 100, rush_rz_att: 30 }   // rate 0.30 (cohort top)
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.rzUsageRate).toBe(0.3)
    expect(r.rzUsageCategory).toBe('rush')
    expect(r.rzUsageFactor).toBeGreaterThan(1)
    expect(r.rzUsageFactor).toBeLessThanOrEqual(1.05)
  })

  it('RB low rush RZ rate → rzUsageFactor < 1', () => {
    const { careerStats, playersMap } = makeCohort('rzrblo', 'RB', { rzRates: RZ_RATES })
    const stats = { rush_att: 100, rush_rz_att: 5 }    // rate 0.05 (cohort bottom)
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.rzUsageRate).toBe(0.05)
    expect(r.rzUsageCategory).toBe('rush')
    expect(r.rzUsageFactor).toBeLessThan(1)
    expect(r.rzUsageFactor).toBeGreaterThanOrEqual(0.95)
  })

  it('WR uses rec category (rec_rz_tgt / rec_tgt)', () => {
    const { careerStats, playersMap } = makeCohort('rzwr', 'WR', { rzRates: RZ_RATES })
    const stats = { rec_tgt: 100, rec_rz_tgt: 25 }
    const r = computeUsageFactors('WR', stats, careerStats, playersMap)

    expect(r.rzUsageRate).toBe(0.25)
    expect(r.rzUsageCategory).toBe('rec')
    expect(r.rzUsageFactor).toBeGreaterThan(1)
  })

  it('QB uses pass category (pass_rz_att / pass_att)', () => {
    const { careerStats, playersMap } = makeCohort('rzqb', 'QB', { rzRates: RZ_RATES })
    const stats = { pass_att: 100, pass_rz_att: 28 }
    const r = computeUsageFactors('QB', stats, careerStats, playersMap)

    expect(r.rzUsageRate).toBe(0.28)
    expect(r.rzUsageCategory).toBe('pass')
    expect(r.rzUsageFactor).toBeGreaterThan(1)
  })

  it('below-MIN-opportunity sample shrinks hard toward neutral', () => {
    const { careerStats, playersMap } = makeCohort('rzsmall', 'RB', { rzRates: RZ_RATES })
    // Extreme rate (1.0) but only 5 rush_att — shrinkK=40 pulls the factor near 1.0.
    const stats = { rush_att: 5, rush_rz_att: 5 }
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.rzUsageRate).toBe(1.0)            // rate itself is extreme
    expect(r.rzUsageFactor).toBeLessThan(1.02) // but the factor is shrunk to near-neutral
    expect(r.rzUsageFactor).toBeGreaterThan(0.99)
  })

  it('zero denominator → neutral RZ factor, null rate & category', () => {
    const { careerStats, playersMap } = makeCohort('rzzero', 'RB', { rzRates: RZ_RATES })
    const stats = { rush_att: 0, rush_rz_att: 0 }
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.rzUsageRate).toBeNull()
    expect(r.rzUsageFactor).toBe(1.0)
    expect(r.rzUsageCategory).toBeNull()
  })

  it('absent denominator → neutral RZ factor, null rate & category', () => {
    const { careerStats, playersMap } = makeCohort('rzabsent', 'RB', { rzRates: RZ_RATES })
    const stats = { rush_rz_att: 10 }   // no rush_att
    const r = computeUsageFactors('RB', stats, careerStats, playersMap)

    expect(r.rzUsageRate).toBeNull()
    expect(r.rzUsageFactor).toBe(1.0)
    expect(r.rzUsageCategory).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════════
// NEUTRAL GUARDS & COHORT CACHE
// ═══════════════════════════════════════════════════════════════════════════════

describe('computeUsageFactors — neutral guards & cache', () => {
  it('missing lastSeasonStats → full NEUTRAL sentinel', () => {
    const { careerStats, playersMap } = makeCohort('neutral', 'RB', { snapShares: RB_SNAP })
    const r = computeUsageFactors('RB', null, careerStats, playersMap)

    expect(r).toEqual({
      snapShare: null, snapShareFactor: 1.0,
      rzUsageRate: null, rzUsageFactor: 1.0, rzUsageCategory: null,
    })
  })

  it('missing careerStats → full NEUTRAL sentinel', () => {
    const r = computeUsageFactors('RB', { off_snp: 500, tm_off_snp: 1000 }, null, {})
    expect(r.snapShareFactor).toBe(1.0)
    expect(r.rzUsageFactor).toBe(1.0)
    expect(r.snapShare).toBeNull()
    expect(r.rzUsageRate).toBeNull()
  })

  it('cohort cache: same careerStats identity reused; new identity rebuilds', () => {
    const a = makeCohort('cacheA', 'RB', { snapShares: RB_SNAP })
    const stats = { off_snp: 700, tm_off_snp: 1000, rush_att: 100, rush_rz_att: 15 }

    const r1 = computeUsageFactors('RB', stats, a.careerStats, a.playersMap)
    const r2 = computeUsageFactors('RB', stats, a.careerStats, a.playersMap)
    expect(r2).toEqual(r1)   // same object identity → memoised cohort, identical result

    // New identity with a cohort shifted high → the same 0.7 player now ranks at
    // the bottom → a strictly lower snapShareFactor. Proves the cache rebuilt.
    const b = makeCohort('cacheB', 'RB', {
      snapShares: [0.70, 0.75, 0.80, 0.85, 0.90, 0.95],
    })
    const r3 = computeUsageFactors('RB', stats, b.careerStats, b.playersMap)
    expect(r3.snapShareFactor).toBeLessThan(r1.snapShareFactor)
  })
})
