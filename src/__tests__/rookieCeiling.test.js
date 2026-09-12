/**
 * src/__tests__/rookieCeiling.test.js
 *
 * Provenance and out-of-sample gate for the rookie realisation ceiling
 * constants (calibration arc slice 3, .claude/tasks/rookie-ceiling.md
 * §5.3/§5.4). Mirrors slice 1's rookieCalibration.test.js structure.
 *
 * The fixture (src/__fixtures__/rookie-debut-panel-2026-09-11.json) is a
 * trimmed copy of sleeper-dashboard-data's
 * backtests/2026-09-11-rookie-panel.json debut.rows (2,071 debut-season rows,
 * entry classes 2013-2025). This file never reads the sibling repo — the
 * fixture is the sole source, same precedent as
 * src/__fixtures__/rookie-panel-2026-09-06.json.
 *
 * Quantile convention (pinned in the task file §1 Q3, repeated here so this
 * file is self-contained): zero-based index p·(n-1), linear interpolation,
 * rounded to 2 dp. Do not substitute a library or another convention — the
 * eight shipped constants were fitted under this one.
 *
 * Four concerns:
 *   1. Fixture integrity — row/position/outcome-class counts and the
 *      gp/outcomePPG consistency invariant.
 *   2. Provenance — the eight shipped ROOKIE_CEILING constants (read back
 *      through applyRookieCeiling, not the table) are re-derived from the
 *      fixture.
 *   3. Q2 survivorship — the gated quantiles sit above the full-population
 *      ones (permissive exclusion) and are insensitive to the exact games
 *      gate (not load-bearing).
 *   4. Q5 out-of-sample gate — a from-scratch leave-one-class-year-out
 *      reimplementation shows the shipped (p90, p99) pair generalises.
 *   5. Q3 hard-cap rejection — re-derived, not quoted: the [0.45, 1.85]
 *      product clamp already holds RB/WR/TE below their p99, so a hard cap
 *      would only ever bind at QB.
 *
 * Plus §5.4's five named live-row regression fixtures.
 */

import { describe, it, expect, vi } from 'vitest'

vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

import {
  computeNextSeasonProjection,
  applyRookieCeiling,
} from '../utils/seasonProjection.js'
import fixture from '../__fixtures__/rookie-debut-panel-2026-09-11.json'

const rows = fixture.rows
const POSITIONS = ['QB', 'RB', 'WR', 'TE']
const ROOKIE_BASELINE_PPG = { QB: 13, RB: 9, WR: 7, TE: 5 }

// Zero-based index p·(n-1), linear interpolation, rounded to 2 dp.
// §1 Q3 worked check: QB n=50, p=0.99 → 0.99×49 = 48.51, interpolating 49% of
// the way from the 49th to the 50th order statistic (21.4600 → 22.3227) gives
// 21.90.
function quantile(sortedVals, p) {
  const n = sortedVals.length
  const idx = p * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, n - 1)
  const frac = idx - lo
  const v = sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * frac
  return Math.round(v * 100) / 100
}

// Unrounded quantile — used only for the Q2 margins, which the task file
// computed from the raw quantiles and rounded once at the end (rounding each
// side to 2dp first before subtracting loses up to 0.01 to compounding).
function quantileRaw(sortedVals, p) {
  const n = sortedVals.length
  const idx = p * (n - 1)
  const lo = Math.floor(idx)
  const hi = Math.min(lo + 1, n - 1)
  const frac = idx - lo
  return sortedVals[lo] + (sortedVals[hi] - sortedVals[lo]) * frac
}

function gatedValues(position, minGames = 8) {
  return rows
    .filter(r => r.p === position && r.gp >= minGames && r.o != null)
    .map(r => r.o)
    .sort((a, b) => a - b)
}

// ─── §5.3.1 Fixture integrity ──────────────────────────────────────────────────

describe('rookie-debut-panel-2026-09-11.json fixture integrity', () => {
  it('has 2,071 rows', () => {
    expect(rows).toHaveLength(2071)
  })

  it('position counts match the panel', () => {
    const counts = {}
    for (const r of rows) counts[r.p] = (counts[r.p] ?? 0) + 1
    expect(counts.QB).toBe(218)
    expect(counts.RB).toBe(582)
    expect(counts.WR).toBe(874)
    expect(counts.TE).toBe(397)
  })

  it('six-state outcome-class counts sum to 2,071', () => {
    const counts = {}
    for (const r of rows) counts[r.c] = (counts[r.c] ?? 0) + 1
    expect(counts.played6plus).toBe(992)
    expect(counts.played1to5).toBe(373)
    expect(counts.rosteredZero).toBe(271)
    expect(counts.absentOnRoster).toBe(215)
    expect(counts.absentNoRosterFile).toBe(115)
    expect(counts.absentOffRoster).toBe(105)
    const total = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(total).toBe(2071)
  })

  it('target seasons are exactly 2013-2025, 13 distinct values', () => {
    const seasons = [...new Set(rows.map(r => r.y))].sort((a, b) => a - b)
    expect(seasons).toEqual([2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025])
  })

  it('gp/o consistency: zero rows with gp>0 and o===null, zero rows with gp===0 and o!==null', () => {
    const bad1 = rows.filter(r => r.gp > 0 && r.o === null)
    const bad2 = rows.filter(r => r.gp === 0 && r.o !== null)
    expect(bad1).toHaveLength(0)
    expect(bad2).toHaveLength(0)
  })

  it('carries a source provenance string naming the artifact and a 40-char data-repo SHA', () => {
    expect(typeof fixture.source).toBe('string')
    expect(fixture.source.length).toBeGreaterThan(0)
    expect(fixture.source).toMatch(/[0-9a-f]{40}/)
    expect(fixture.source).toContain('rookie-panel')
  })
})

// ─── §5.3.2 Provenance — the eight constants re-derived ────────────────────────

describe('ROOKIE_CEILING provenance — re-derived from the fixture, read back through applyRookieCeiling', () => {
  const EXPECTED = {
    QB: { n: 50,  knee: 17.80, asymptote: 21.90 },
    RB: { n: 281, knee: 12.11, asymptote: 16.87 },
    WR: { n: 366, knee: 9.87,  asymptote: 14.38 },
    TE: { n: 176, knee: 6.21,  asymptote: 11.60 },
  }

  for (const position of POSITIONS) {
    it(`${position}: n and (p90, p99) match the shipped knee/asymptote`, () => {
      const vals = gatedValues(position)
      expect(vals).toHaveLength(EXPECTED[position].n)

      const p90 = quantile(vals, 0.90)
      const p99 = quantile(vals, 0.99)
      expect(p90).toBe(EXPECTED[position].knee)
      expect(p99).toBe(EXPECTED[position].asymptote)

      // Read back through the resolver, not the table — a table edit that
      // bypasses applyRookieCeiling still fails this.
      const probe = applyRookieCeiling({ position, projectedPPG: 0 })
      expect(probe.rookieCeilingKnee).toBe(EXPECTED[position].knee)
      expect(probe.rookieCeilingAsymptote).toBe(EXPECTED[position].asymptote)
    })
  }
})

// ─── §5.3.3 Q2 survivorship — the exclusion is permissive ──────────────────────

describe('Q2 survivorship — full-population quantiles sit strictly below the gated ones', () => {
  const EXPECTED = {
    QB: { fullP90: 14.08, fullP99: 21.10, marginP90: 3.72, marginP99: 0.80 },
    RB: { fullP90: 9.05,  fullP99: 16.12, marginP90: 3.07, marginP99: 0.75 },
    WR: { fullP90: 7.03,  fullP99: 12.87, marginP90: 2.84, marginP99: 1.51 },
    TE: { fullP90: 4.61,  fullP99: 10.26, marginP90: 1.61, marginP99: 1.35 },
  }
  const GATED = { QB: 17.80, RB: 12.11, WR: 9.87, TE: 6.21 }
  const GATED_P99 = { QB: 21.90, RB: 16.87, WR: 14.38, TE: 11.60 }

  for (const position of POSITIONS) {
    it(`${position}: reading absence as 0 lowers both quantiles by the expected margin`, () => {
      const fullVals = rows
        .filter(r => r.p === position)
        .map(r => (r.o != null ? r.o : 0))
        .sort((a, b) => a - b)

      const fullP90 = quantile(fullVals, 0.90)
      const fullP99 = quantile(fullVals, 0.99)

      expect(fullP90).toBe(EXPECTED[position].fullP90)
      expect(fullP99).toBe(EXPECTED[position].fullP99)
      expect(fullP90).toBeLessThan(GATED[position])
      expect(fullP99).toBeLessThan(GATED_P99[position])

      // Margins from the raw (unrounded) quantiles, rounded once at the end —
      // matches how the task file computed them; rounding each side to 2dp
      // first and then subtracting loses up to 0.01 to compounding.
      const gatedValsRaw = gatedValues(position).sort((a, b) => a - b)
      const gatedP90Raw = quantileRaw(gatedValsRaw, 0.90)
      const gatedP99Raw = quantileRaw(gatedValsRaw, 0.99)
      const fullP90Raw = quantileRaw(fullVals, 0.90)
      const fullP99Raw = quantileRaw(fullVals, 0.99)
      expect(Math.round((gatedP90Raw - fullP90Raw) * 100) / 100).toBe(EXPECTED[position].marginP90)
      expect(Math.round((gatedP99Raw - fullP99Raw) * 100) / 100).toBe(EXPECTED[position].marginP99)
    })
  }
})

describe('Q2 gate insensitivity — p90 barely moves across gp>=6 / >=8 / >=10', () => {
  const EXPECTED_P90 = {
    QB: { g6: 17.75, g8: 17.80, g10: 18.27 },
    RB: { g6: 11.99, g8: 12.11, g10: 12.13 },
    WR: { g6: 9.59,  g8: 9.87,  g10: 10.34 },
    TE: { g6: 5.65,  g8: 6.21,  g10: 6.40 },
  }

  for (const position of POSITIONS) {
    it(`${position}: p90 at gp>=6/8/10 all within 0.75 of the shipped gp>=8 value`, () => {
      const p90at = gate => quantile(gatedValues(position, gate), 0.90)
      const g6  = p90at(6)
      const g8  = p90at(8)
      const g10 = p90at(10)

      expect(g6).toBe(EXPECTED_P90[position].g6)
      expect(g8).toBe(EXPECTED_P90[position].g8)
      expect(g10).toBe(EXPECTED_P90[position].g10)

      expect(Math.abs(g6 - g8)).toBeLessThanOrEqual(0.75)
      expect(Math.abs(g10 - g8)).toBeLessThanOrEqual(0.75)
    })
  }
})

// ─── §5.3.4 Q5 out-of-sample gate — leave-one-class-year-out ───────────────────

describe('Q5 leave-one-class-year-out — the shipped (p90, p99) pair generalises', () => {
  const gated = rows.filter(r => r.gp >= 8 && r.o != null)
  const seasons = [...new Set(gated.map(r => r.y))].sort((a, b) => a - b)

  it('has 13 target seasons in the gated population', () => {
    expect(seasons).toHaveLength(13)
  })

  it('every fold produces a finite knee and asymptote at every position, asymptote > knee in all 52 pairs', () => {
    let pairs = 0
    for (const heldOutSeason of seasons) {
      for (const position of POSITIONS) {
        const train = gated
          .filter(r => r.y !== heldOutSeason && r.p === position)
          .map(r => r.o)
          .sort((a, b) => a - b)
        const knee = quantile(train, 0.90)
        const asymptote = quantile(train, 0.99)
        expect(Number.isFinite(knee)).toBe(true)
        expect(Number.isFinite(asymptote)).toBe(true)
        expect(asymptote).toBeGreaterThan(knee)
        pairs++
      }
    }
    expect(pairs).toBe(52)
  })

  it('held-out exceedance rates track nominal: above-knee in [0.085, 0.120], above-asymptote in [0.005, 0.030]', () => {
    let totalN = 0
    let aboveKnee = 0
    let aboveAsymptote = 0

    for (const heldOutSeason of seasons) {
      for (const position of POSITIONS) {
        const train = gated
          .filter(r => r.y !== heldOutSeason && r.p === position)
          .map(r => r.o)
          .sort((a, b) => a - b)
        if (train.length === 0) continue
        const knee = quantile(train, 0.90)
        const asymptote = quantile(train, 0.99)

        const test = gated.filter(r => r.y === heldOutSeason && r.p === position).map(r => r.o)
        totalN += test.length
        aboveKnee += test.filter(v => v > knee).length
        aboveAsymptote += test.filter(v => v > asymptote).length
      }
    }

    expect(totalN).toBe(873)
    const kneeRate = aboveKnee / totalN
    const asymRate = aboveAsymptote / totalN
    expect(kneeRate).toBeGreaterThanOrEqual(0.085)
    expect(kneeRate).toBeLessThanOrEqual(0.120)
    expect(asymRate).toBeGreaterThanOrEqual(0.005)
    expect(asymRate).toBeLessThanOrEqual(0.030)
    // Observed: 10.19% above-knee (nominal 10%), 1.60% above-asymptote (nominal 1%) — disclosed in docs/projection.md.
  })
})

// ─── §5.3.5 Q3 hard-cap rejection — re-derived, not quoted ─────────────────────

describe('Q3 hard-cap rejection — a hard cap at p99 would only ever bind at QB', () => {
  const CLAMP_MAX = {
    QB: ROOKIE_BASELINE_PPG.QB * 1.85,
    RB: ROOKIE_BASELINE_PPG.RB * 1.85,
    WR: ROOKIE_BASELINE_PPG.WR * 1.85,
    TE: ROOKIE_BASELINE_PPG.TE * 1.85,
  }

  it('the pre-ceiling clamp maximum is ABOVE the fitted p99 at QB', () => {
    const p99 = quantile(gatedValues('QB'), 0.99)
    expect(CLAMP_MAX.QB).toBeGreaterThan(p99)
  })

  for (const position of ['RB', 'WR', 'TE']) {
    it(`the pre-ceiling clamp maximum is BELOW the fitted p99 at ${position} — a hard cap there is a no-op`, () => {
      const p99 = quantile(gatedValues(position), 0.99)
      expect(CLAMP_MAX[position]).toBeLessThan(p99)
    })
  }
})

// ─── §5.4 — named live-row regression fixtures ─────────────────────────────────

const WINDOW_2017_2026 = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

function ktcMapWithPercentile(playerId, position, playersMap, belowCount, poolSize) {
  const map = new Map()
  map.set(playerId, { value: 9000, confidence: 'high' })
  for (let i = 1; i < poolSize; i++) {
    const padId = `ktc_pad_${position}_${i}`
    const value = i <= belowCount ? 9000 - i * 500 : 9000 + i * 500
    map.set(padId, { value, confidence: 'low' })
    playersMap[padId] = { position, age: 25, years_exp: 3, team: 'SF' }
  }
  return map
}

describe('rookie ceiling — §5.4 named regression fixtures', () => {
  // A · Fernando Mendoza (pid 13269, QB, 2026 R1P1, LV). Snapshot 2026-09-10.
  // The founding case: pre-ceiling this row is 24.1 — the #1 projected QB of
  // 105. The ceiling moves it to 21.0.
  it('A · 13269, the founding case — 24.1 -> 21.0, slices 1/2 unmoved', () => {
    const playerId = '13269'
    const playersMap = { [playerId]: { position: 'QB', age: 22, years_exp: 0, team: 'LV' } }
    const ktcMap = ktcMapWithPercentile(playerId, 'QB', playersMap, 4, 5)

    const r = computeNextSeasonProjection({
      playerId,
      playersMap,
      careerStats:      {},
      empiricalCurves:  {},
      positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
      historicalShares: {},
      depthMap:         {},
      teamContext:      {},
      scoringSettings:  null,
      ktcMap,
      collegeStats: {
        [playerId]: { peakDominator: 32, productionTrend: 'improving', seasonsPlayed: 1 },
      },
      currentSeason:    2025,
      qbQualityByTeam:  null,
      ktcHistory:       null,
      nflDraftMatches:  { [playerId]: { year: 2026, round: 1, pick: 1 } },
      nflDraftYears:    WINDOW_2017_2026,
    })

    expect(r).not.toBeNull()
    expect(r.projectedPPG).toBe(21.0)
    expect(r.factors.rookieCeilingPPGPre).toBe(24.05)
    expect(r.factors.rookieCeilingBasis).toBe('ceiling:QB')
    expect(r.factors.rookieCeilingKnee).toBe(17.8)
    expect(r.factors.rookieCeilingAsymptote).toBe(21.9)
    expect(r.factors.rookieCalibrationMult).toBe(1)
    expect(r.factors.rookieCalibrationBasis).toBe('none')
    expect(r.projectedGames).toBe(12)
    // round(21.007209 × 12 × 10) / 10 — from the UNROUNDED ceiled PPG, not 21.0 × 12.
    expect(r.projectedTotalPts).toBe(252.1)
  })

  // B · ordering among the top five at a position survives.
  describe('B · ordering among the top five at a position survives', () => {
    it('constructed half — pinned inputs, strictly increasing outputs at all four positions', () => {
      const CASES = {
        QB: { inputs: [16.80, 17.80, 19.86, 21.93, 24.05], expected: [16.8, 17.8, 19.4, 20.4, 21.0] },
        RB: { inputs: [11.11, 12.11, 13.61, 15.11, 16.65], expected: [11.1, 12.1, 13.4, 14.3, 15.0] },
        WR: { inputs: [8.87, 9.87, 10.89, 11.90, 12.95],   expected: [8.9, 9.9, 10.8, 11.5, 12.1] },
        TE: { inputs: [5.21, 6.21, 7.21, 8.22, 9.25],      expected: [5.2, 6.2, 7.1, 7.9, 8.5] },
      }
      for (const position of POSITIONS) {
        const { inputs, expected } = CASES[position]
        const outputs = inputs.map(x => {
          const r = applyRookieCeiling({ position, projectedPPG: x })
          return Math.round(r.ceiledPPG * 10) / 10
        })
        expect(outputs).toEqual(expected)
        for (let i = 1; i < outputs.length; i++) {
          expect(outputs[i]).toBeGreaterThan(outputs[i - 1])
        }
      }
    })

    it('live half — top five pre-values per position on 2026-09-10, no strict order becomes tied or inverted', () => {
      const CASES = {
        QB: { pre: [24.1, 20.6, 17.9, 17.6, 14.0], post: [21.0, 19.8, 17.9, 17.6, 14.0] },
        RB: { pre: [16.7, 16.7, 15.4, 14.0, 13.7], post: [15.1, 15.1, 14.5, 13.7, 13.5] },
        WR: { pre: [13.0, 13.0, 12.5, 11.2, 11.0], post: [12.1, 12.1, 11.9, 11.0, 10.9] },
        TE: { pre: [9.3, 8.3, 7.3, 7.2, 5.7],       post: [8.6, 7.9, 7.2, 7.1, 5.7] },
      }
      for (const position of POSITIONS) {
        const { pre, post } = CASES[position]
        const outputs = pre.map(x => {
          const r = applyRookieCeiling({ position, projectedPPG: x })
          return Math.round(r.ceiledPPG * 10) / 10
        })
        expect(outputs).toEqual(post)
        // No pair that was strictly ordered before becomes tied or inverted after.
        for (let i = 0; i < pre.length; i++) {
          for (let j = i + 1; j < pre.length; j++) {
            if (pre[i] > pre[j]) expect(outputs[i]).toBeGreaterThan(outputs[j])
            else if (pre[i] < pre[j]) expect(outputs[i]).toBeLessThan(outputs[j])
          }
        }
      }
    })
  })

  // C · the bottom of the board is untouched — the Q4 double-count guard.
  describe('C · the bottom of the board is untouched (Q4 double-count guard)', () => {
    it('undrafted WR — ceiling does not fire, slice-1 discount unchanged', () => {
      const playerId = 'P_CEILING_UNDRAFTED_WR'
      const playersMap = { [playerId]: { position: 'WR', age: 23, years_exp: 0, team: 'NYJ' } }

      const r = computeNextSeasonProjection({
        playerId,
        playersMap,
        careerStats:      {},
        empiricalCurves:  {},
        positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
        historicalShares: {},
        depthMap:         {},
        teamContext:      {},
        scoringSettings:  null,
        ktcMap:           null,
        collegeStats:     {},
        currentSeason:    2025,
        nflDraftMatches:  {},
        nflDraftYears:    WINDOW_2017_2026,
      })

      expect(r).not.toBeNull()
      expect(r.factors.draftCapitalStatus).toBe('undrafted')
      expect(r.factors.rookieCalibrationBasis).toBe('undrafted:WR')
      expect(r.factors.rookieCalibrationMult).toBe(0.36)
      expect(r.factors.rookieCeilingBasis).toBe('none')
      expect(Math.round(r.factors.rookieCeilingPPGPre * 10) / 10).toBe(r.projectedPPG)
    })

    it('day-3 RB — ceiling does not fire, slice-1 discount unchanged', () => {
      const playerId = 'P_CEILING_DAY3_RB'
      const playersMap = { [playerId]: { position: 'RB', age: 22, years_exp: 0, team: 'CHI' } }

      const r = computeNextSeasonProjection({
        playerId,
        playersMap,
        careerStats:      {},
        empiricalCurves:  {},
        positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
        historicalShares: {},
        depthMap:         {},
        teamContext:      {},
        scoringSettings:  null,
        ktcMap:           null,
        collegeStats:     {},
        currentSeason:    2025,
        nflDraftMatches:  { [playerId]: { year: 2026, round: 5, pick: 150 } },
        nflDraftYears:    WINDOW_2017_2026,
      })

      expect(r).not.toBeNull()
      expect(r.factors.draftCapitalStatus).toBe('matched')
      expect(r.factors.rookieCalibrationBasis).toBe('day3:RB')
      expect(r.factors.rookieCalibrationMult).toBe(0.80)
      expect(r.factors.rookieCeilingBasis).toBe('none')
      expect(Math.round(r.factors.rookieCeilingPPGPre * 10) / 10).toBe(r.projectedPPG)
    })
  })

  // D · a fired ceiling below the emission grain — through the real projection
  // path, not a direct applyRookieCeiling call (Fix pass 1 item 4). Case D
  // exists to pin Q4(d) on a REAL projection row: that rookieCeilingBasis, not
  // the difference between the two PPG numbers, is the firing signal, and that
  // adjustmentSummary still carries the line even when the visible PPG does
  // not move. Inputs: age <=21 (ageMult 1.15), a KTC map putting the player at
  // the 41st percentile at WR (ktcMult 0.946), no college stats (mult 1.0),
  // and a top-3 NFL draft slot (mult 1.30, no slice-1 discount) — product =
  // 1.15 x 0.946 x 1.30 = 1.41439, pre-ceiling PPG = 7 x 1.41439 = 9.90,
  // 0.03 above the WR knee (9.87), so the compression is far below the 1dp
  // emission grain and projectedPPG rounds back to the same value. Cite
  // 12501 on 2026-09-10 as the live instance of this same sub-grain firing.
  it('D · a fired ceiling below the emission grain (cf. 12501, WR, 2026-09-10)', () => {
    const playerId = 'P_CEILING_D_SUBGRAIN'
    const playersMap = { [playerId]: { position: 'WR', age: 21, years_exp: 0, team: 'NYJ' } }
    const ktcMap = ktcMapWithPercentile(playerId, 'WR', playersMap, 41, 100)

    const r = computeNextSeasonProjection({
      playerId,
      playersMap,
      careerStats:      {},
      empiricalCurves:  {},
      positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
      historicalShares: {},
      depthMap:         {},
      teamContext:      {},
      scoringSettings:  null,
      ktcMap,
      collegeStats:     {},
      currentSeason:    2025,
      nflDraftMatches:  { [playerId]: { year: 2026, round: 1, pick: 1 } },
      nflDraftYears:    WINDOW_2017_2026,
    })

    expect(r).not.toBeNull()
    expect(r.factors.rookieCeilingBasis).toBe('ceiling:WR')
    expect(r.factors.rookieCeilingPPGPre).toBeGreaterThan(r.factors.rookieCeilingKnee)
    // Sub-grain: the fired, compressed value still rounds to the same 1dp figure as the pre-ceiling value.
    expect(Math.round(r.factors.rookieCeilingPPGPre * 10) / 10).toBe(r.projectedPPG)
    expect(r.adjustmentSummary).toContain('Above the historical rookie ceiling ↓')
  })

  // E · draft-group invariance — the test that witnesses the Q4(a) boundary.
  //
  // Case C cannot do this job: both its rows sit below their knees, so it would
  // pass unchanged even if ROOKIE_CEILING grew a draft-group dimension.
  //
  // Fix pass 1 item 3 — corrected reason this case cannot force every combo to
  // the exact same pre-ceiling PPG: it is NOT that the KTC percentile is
  // integer-quantized (a finer lever would not fix it — the assertions below
  // are on the 1dp projectedPPG plus exactly-comparable knee/asymptote, which
  // integer quantization does not threaten). The real blocker is reachability:
  // at the low draft tiers and undrafted, the pre-ceiling maximum sits
  // STRUCTURALLY below the knee at every position (see the table below, derived
  // from max(ageMult x ktcMult x collegeContribution) = 1.86875, the 1.85
  // clamp, and slice 1's ROOKIE_CALIBRATION.day3 multipliers) — no choice of
  // inputs, however fine-grained, crosses it. So instead this drives every
  // input to (or arbitrarily close to) its own maximum — age <=21 (ageMult
  // 1.15), a KTC map putting the player at the top of a 200-player pool
  // (ktcMult rounds to 1.30), college stats giving collegeContribution 1.25 —
  // and sweeps every reachable (draftCapitalStatus, nflDraftTier) pair through
  // the full computeNextSeasonProjection call. For each row it takes the
  // naturally-produced factors.rookieCeilingPPGPre and independently re-derives
  // the ceiling from ONLY (position, that PPG) via applyRookieCeiling — if
  // ROOKIE_CEILING ever grew a draft-group term, applyRookieCeiling would need
  // that term to reproduce the shipped output and this recompute (which
  // supplies only position and the pre-value) would stop matching. On top of
  // that reconstruction check, it asserts the fired branch is exercised at
  // every combination the table below marks reachable, and that firing is
  // impossible at every combination it marks unreachable — even at these
  // maximal inputs.
  //
  // Reachability table (Fix pass 1 item 2, exact, at maximal ageMult/ktcMult/
  // collegeContribution):
  //   QB (knee 17.80): fires top-3..r4, cannot fire r5/r6/r7; undrafted max
  //     16.11 cannot fire; unknown max 24.05 fires.
  //   RB (knee 12.11): fires top-3..r3, cannot fire r4..r7; undrafted max 5.49
  //     cannot fire; unknown max 16.65 fires.
  //   WR (knee 9.87): fires top-3..r3, cannot fire r4..r7; undrafted max 4.66
  //     cannot fire; unknown max 12.95 fires.
  //   TE (knee 6.21): fires top-3..r3, cannot fire r4..r7; undrafted max 2.59
  //     cannot fire; unknown max 9.25 fires.
  it('E · draft-group invariance — reconstructable from (position, pre-value) alone, and fires/does-not-fire exactly per the reachability table', () => {
    const TIERS = ['top-3', 'top-8', 'r1-mid', 'r1-late', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7']

    // Combos where the ceiling is reachable at maximal inputs (Fix pass 1 item 2).
    const FIRE_TIERS = {
      QB: new Set(['top-3', 'top-8', 'r1-mid', 'r1-late', 'r2', 'r3', 'r4']),
      RB: new Set(['top-3', 'top-8', 'r1-mid', 'r1-late', 'r2', 'r3']),
      WR: new Set(['top-3', 'top-8', 'r1-mid', 'r1-late', 'r2', 'r3']),
      TE: new Set(['top-3', 'top-8', 'r1-mid', 'r1-late', 'r2', 'r3']),
    }

    function projectWith(position, playersMap, extra) {
      const playerId = 'P_CEILING_E_SWEEP'
      // Maximal inputs at every combo: ageMult 1.15 (age <=21), ktcMult ~1.30
      // (a 200-player pool with the player strictly above all 199 pads —
      // below/length = 199/200 = 99.5%, which Math.round takes to 100),
      // collegeContribution 1.25 (peakDominator >=30 + productionTrend improving).
      const ktcMap = ktcMapWithPercentile(playerId, position, playersMap, 199, 200)
      return computeNextSeasonProjection({
        playerId,
        playersMap,
        careerStats:      {},
        empiricalCurves:  {},
        positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
        historicalShares: {},
        depthMap:         {},
        teamContext:      {},
        scoringSettings:  null,
        ktcMap,
        collegeStats: {
          P_CEILING_E_SWEEP: { peakDominator: 32, productionTrend: 'improving', seasonsPlayed: 1 },
        },
        currentSeason:    2025,
        nflDraftYears:    WINDOW_2017_2026,
        ...extra,
      })
    }

    const combos = []
    for (const tier of TIERS) {
      const round = { 'top-3': 1, 'top-8': 1, 'r1-mid': 1, 'r1-late': 1, r2: 2, r3: 3, r4: 4, r5: 5, r6: 6, r7: 7 }[tier]
      const pick  = { 'top-3': 1, 'top-8': 5, 'r1-mid': 12, 'r1-late': 25, r2: 40, r3: 70, r4: 100, r5: 140, r6: 180, r7: 220 }[tier]
      combos.push({ label: `matched:${tier}`, tier, extra: { nflDraftMatches: { P_CEILING_E_SWEEP: { year: 2026, round, pick } } } })
    }
    combos.push({ label: 'undrafted', tier: null, extra: { nflDraftMatches: {} } })
    combos.push({ label: 'unknown', tier: null, extra: { nflDraftMatches: {}, nflDraftYears: null } })

    for (const position of POSITIONS) {
      let knee = null, asymptote = null
      for (const { label, tier, extra } of combos) {
        const playersMap = { P_CEILING_E_SWEEP: { position, age: 21, years_exp: 0, team: 'SF' } }
        const r = projectWith(position, playersMap, extra)
        expect(r, `${position} ${label}`).not.toBeNull()

        const pre = r.factors.rookieCeilingPPGPre
        const recomputed = applyRookieCeiling({ position, projectedPPG: pre })

        expect(recomputed.rookieCeilingKnee, `${position} ${label} knee`).toBe(r.factors.rookieCeilingKnee)
        expect(recomputed.rookieCeilingAsymptote, `${position} ${label} asymptote`).toBe(r.factors.rookieCeilingAsymptote)
        expect(Math.round(recomputed.ceiledPPG * 10) / 10, `${position} ${label} ceiledPPG`).toBe(r.projectedPPG)
        expect(recomputed.rookieCeilingBasis, `${position} ${label} basis`).toBe(r.factors.rookieCeilingBasis)

        // The knee/asymptote pair itself must be position-only: identical
        // across every combo regardless of what status/tier produced this row.
        if (knee == null) { knee = r.factors.rookieCeilingKnee; asymptote = r.factors.rookieCeilingAsymptote }
        else {
          expect(r.factors.rookieCeilingKnee, `${position} ${label} knee stays position-only`).toBe(knee)
          expect(r.factors.rookieCeilingAsymptote, `${position} ${label} asymptote stays position-only`).toBe(asymptote)
        }

        // The reachability table itself: fires where marked reachable, cannot
        // fire where marked unreachable — even at these maximal inputs.
        const shouldFire =
          label === 'unknown' ? true :
          label === 'undrafted' ? false :
          FIRE_TIERS[position].has(tier)

        if (shouldFire) {
          expect(r.factors.rookieCeilingBasis, `${position} ${label} must fire`).toBe(`ceiling:${position}`)
        } else {
          expect(r.factors.rookieCeilingBasis, `${position} ${label} must not fire`).toBe('none')
        }
      }
    }
  })
})
