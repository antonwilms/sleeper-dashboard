/**
 * src/__tests__/rookieCalibration.test.js
 *
 * Provenance and out-of-sample gate for the rookie realisation calibration
 * constants (calibration arc slice 1, .claude/tasks/rookie-calibration.md §5.3/§5.4).
 *
 * The fixture (src/__fixtures__/rookie-panel-2026-09-06.json) is a trimmed copy of
 * sleeper-dashboard-data's backtests/2026-09-06-fullpipeline-panel.json
 * rookiePanel.rows (1,056 graded rookie-path seasons, predictor years 2013-2024).
 * This file never reads the sibling repo — the fixture is the sole source, same
 * precedent as src/__fixtures__/season-totals-2025.json.
 *
 * Three concerns:
 *   1. Fixture integrity — the trimmed copy still matches the verdict file's own counts.
 *   2. Provenance — the shipped ROOKIE_CALIBRATION constants (read indirectly via
 *      resolveRookieCalibration) are re-derived from the fixture, not just asserted.
 *   3. Out-of-sample gate — a from-scratch LOYO reimplementation over the fixture
 *      shows the correction generalises, and that the rejected upward half does not.
 *
 * Plus §5.4's four named regression fixtures, built from the factor values actually
 * observed for those players (cited pid + snapshot date in each case's comment).
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
  resolveRookieCalibration,
} from '../utils/seasonProjection.js'
import fixture from '../__fixtures__/rookie-panel-2026-09-06.json'

const rows = fixture.rows

// ─── §5.3.1 Fixture integrity ──────────────────────────────────────────────────

describe('rookie-panel-2026-09-06.json fixture integrity', () => {
  it('has 1,056 rows, all with a positive projectedPPG', () => {
    expect(rows).toHaveLength(1056)
    expect(rows.every(r => r.pr > 0)).toBe(true)
  })

  it('has 366 unmatched rows', () => {
    expect(rows.filter(r => r.t === 'unmatched')).toHaveLength(366)
  })

  it('tier counts match the verdict file table', () => {
    const counts = {}
    for (const r of rows) counts[r.t] = (counts[r.t] ?? 0) + 1
    expect(counts['top-3']).toBe(18)
    expect(counts['top-8']).toBe(23)
    expect(counts['r1-mid']).toBe(24)
    expect(counts['r1-late']).toBe(47)
    expect(counts['r2']).toBe(107)
    expect(counts['r3']).toBe(113)
    expect(counts['r4']).toBe(116)
    expect(counts['r5']).toBe(98)
    expect(counts['r6']).toBe(88)
    expect(counts['r7']).toBe(56)
    expect(counts['unmatched']).toBe(366)
  })

  it('carries a source provenance string', () => {
    expect(typeof fixture.source).toBe('string')
    expect(fixture.source.length).toBeGreaterThan(0)
  })
})

// ─── Shared group/cell helpers (test-only reimplementation of the fit protocol) ─

const DAY3 = new Set(['r4', 'r5', 'r6', 'r7'])
const DAY2 = new Set(['r2', 'r3'])
const R1   = new Set(['top-3', 'top-8', 'r1-mid', 'r1-late'])

function tierGroup(t) {
  if (t === 'unmatched') return 'undrafted'
  if (DAY3.has(t)) return 'day3'
  if (DAY2.has(t)) return 'day2'
  if (R1.has(t))   return 'r1'
  return null
}

// Ratio of means (Σ realised ÷ Σ projected) over an arbitrary row subset.
function ratioOfMeans(subset) {
  let o = 0, pr = 0
  for (const r of subset) { o += r.o; pr += r.pr }
  return { ratio: pr > 0 ? o / pr : 1, n: subset.length }
}

// ─── §5.3.2 Provenance — each shipped constant is re-derived from the fixture ──

describe('rookie calibration provenance — constants re-derived from the fixture', () => {
  const undraftedRows = rows.filter(r => tierGroup(r.t) === 'undrafted')
  const day3Rows      = rows.filter(r => tierGroup(r.t) === 'day3')

  it.each([
    ['QB', 14],
    ['RB', 101],
    ['WR', 150],
    ['TE', 101],
  ])('undrafted:%s — n=%i matches docs/projection.md and re-derives the shipped constant', (pos, expectedN) => {
    const subset = undraftedRows.filter(r => r.p === pos)
    const { ratio, n } = ratioOfMeans(subset)
    expect(n).toBe(expectedN)
    const shipped = resolveRookieCalibration({
      position: pos, draftCapitalStatus: 'undrafted', nflDraftTier: null,
    }).rookieCalibrationMult
    expect(Math.round(ratio * 100) / 100).toBeCloseTo(shipped, 2)
  })

  it.each([
    ['RB', 116, 0.80],
    ['WR', 128, 0.79],
    ['TE', 83,  0.71],
  ])('day3:%s — n=%i matches docs/projection.md and re-derives the shipped constant', (pos, expectedN, expectedConst) => {
    const subset = day3Rows.filter(r => r.p === pos)
    const { ratio, n } = ratioOfMeans(subset)
    expect(n).toBe(expectedN)
    const rounded = Math.round(ratio * 100) / 100
    expect(rounded).toBeCloseTo(expectedConst, 2)
    const shipped = resolveRookieCalibration({
      position: pos, draftCapitalStatus: 'matched', nflDraftTier: 'r4', // any DAY3 tier
    }).rookieCalibrationMult
    expect(shipped).toBeCloseTo(expectedConst, 2)
  })

  it('day3:QB — raw ratio 1.10 at n=31, shipped as the no-op 1.00 by the ≤1.00 clamp', () => {
    const subset = day3Rows.filter(r => r.p === 'QB')
    const { ratio, n } = ratioOfMeans(subset)
    expect(n).toBe(31)
    expect(Math.round(ratio * 100) / 100).toBeCloseTo(1.10, 2)

    // The raw ratio (1.10) is NOT what ships — the clamp holds it at 1.00, and the
    // basis is still recorded so the cell stays visible for a future revisit.
    const shipped = resolveRookieCalibration({
      position: 'QB', draftCapitalStatus: 'matched', nflDraftTier: 'r5', // any DAY3 tier
    })
    expect(shipped.rookieCalibrationMult).toBe(1.00)
    expect(shipped.rookieCalibrationBasis).toBe('day3:QB')
  })
})

// ─── §5.3.3/4 — LOYO out-of-sample gate + the upward-half rejection ────────────

// Reimplements the fitting protocol from .claude/tasks/rookie-calibration.md §3(c):
// 12 folds by predictor year; cells refit on the other 11 years; the minimum-n rule
// (n<10 → 1.00; 10≤n<30 → own ratio floored at the group-pooled ratio; n≥30 → own
// ratio); every constant ≤1.00 UNLESS `liftGroups` allows a named group to lift.
function fitCellConstants(trainRows, { liftGroups = new Set() } = {}) {
  const cellStats = new Map()   // `${group}:${pos}` -> { o, pr, n }
  const poolStats = new Map()   // group -> { o, pr, n }

  for (const r of trainRows) {
    const g = tierGroup(r.t)
    if (g == null) continue
    const cellKey = `${g}:${r.p}`
    const cell = cellStats.get(cellKey) ?? { o: 0, pr: 0, n: 0 }
    cell.o += r.o; cell.pr += r.pr; cell.n += 1
    cellStats.set(cellKey, cell)

    const pool = poolStats.get(g) ?? { o: 0, pr: 0, n: 0 }
    pool.o += r.o; pool.pr += r.pr; pool.n += 1
    poolStats.set(g, pool)
  }

  const constants = new Map()
  for (const [cellKey, { o, pr, n }] of cellStats) {
    const [g] = cellKey.split(':')
    const allowLift = liftGroups.has(g)
    if (!allowLift && (g === 'r1' || g === 'day2')) {
      constants.set(cellKey, 1.00)
      continue
    }
    const pool = poolStats.get(g)
    const pooledRatio = pool.pr > 0 ? pool.o / pool.pr : 1.00
    let c
    if (n < 10) {
      c = 1.00
    } else if (n < 30) {
      const cellRatio = pr > 0 ? o / pr : 1.00
      c = Math.max(cellRatio, pooledRatio)
    } else {
      c = pr > 0 ? o / pr : 1.00
    }
    if (!allowLift) c = Math.min(c, 1.00)
    constants.set(cellKey, c)
  }
  return constants
}

function runLoyo({ liftGroups = new Set() } = {}) {
  const years = [...new Set(rows.map(r => r.y))].sort()
  const errCorrected = []
  const errUncorrected = []
  const byPosCorrected = { QB: [], RB: [], WR: [], TE: [] }
  // Signed error, prediction minus outcome — the opposite order from the Math.abs
  // lines above, which are outcome minus prediction. Positive bias = over-projection.
  const biasCorrectedArr = []
  const biasUncorrectedArr = []

  for (const y of years) {
    const train = rows.filter(r => r.y !== y)
    const test  = rows.filter(r => r.y === y)
    const constants = fitCellConstants(train, { liftGroups })

    for (const r of test) {
      const g = tierGroup(r.t)
      const c = g != null ? (constants.get(`${g}:${r.p}`) ?? 1.00) : 1.00
      const predCorrected = r.pr * c
      errCorrected.push(Math.abs(r.o - predCorrected))
      errUncorrected.push(Math.abs(r.o - r.pr))
      biasCorrectedArr.push(predCorrected - r.o)
      biasUncorrectedArr.push(r.pr - r.o)
      if (byPosCorrected[r.p]) byPosCorrected[r.p].push(Math.abs(r.o - predCorrected))
    }
  }

  const mean = arr => arr.reduce((a, b) => a + b, 0) / arr.length
  return {
    maeCorrected:   mean(errCorrected),
    maeUncorrected: mean(errUncorrected),
    maeByPosition: Object.fromEntries(
      Object.entries(byPosCorrected).map(([p, v]) => [p, mean(v)])
    ),
    biasCorrected:   mean(biasCorrectedArr),
    biasUncorrected: mean(biasUncorrectedArr),
  }
}

describe('rookie calibration — LOYO out-of-sample gate (shipped, downward-only)', () => {
  const { maeCorrected, maeUncorrected, maeByPosition, biasCorrected, biasUncorrected } = runLoyo()

  it('corrected MAE beats uncorrected MAE by at least 0.75 PPG overall', () => {
    // Measured: 3.788 → 2.716 (Δ ≈ 1.07). Loose bound, not exact reproduction.
    expect(maeUncorrected - maeCorrected).toBeGreaterThanOrEqual(0.75)
  })

  it.each(['QB', 'RB', 'WR', 'TE'])('corrected MAE ≤ uncorrected MAE for %s', pos => {
    const uncorrectedForPos = rows
      .filter(r => r.p === pos)
      .map(r => Math.abs(r.o - r.pr))
    const meanUncorrected = uncorrectedForPos.reduce((a, b) => a + b, 0) / uncorrectedForPos.length
    expect(maeByPosition[pos]).toBeLessThanOrEqual(meanUncorrected)
  })

  it('the correction is genuine, not degenerate (positive overall improvement)', () => {
    expect(maeCorrected).toBeGreaterThan(0)
    expect(maeCorrected).toBeLessThan(maeUncorrected)
  })

  it('mean bias flips from systematic over-projection to near-zero-or-negative', () => {
    // MAE alone cannot distinguish a correction that removes systematic
    // over-projection from one that merely shrinks spread. Measured: +1.490 → −0.358.
    // Loose bounds, not exact floats.
    expect(biasUncorrected).toBeGreaterThan(1.0)
    expect(biasCorrected).toBeLessThan(0.2)
    expect(biasCorrected).toBeGreaterThan(-1.0)
  })
})

describe('rookie calibration — the upward half stays out (§3(b))', () => {
  it('adding r1/day-2 lift cells does not improve overall LOYO MAE', () => {
    const downwardOnly = runLoyo()
    const withLift = runLoyo({ liftGroups: new Set(['r1', 'day2']) })

    // Measured on the shipped protocol: 2.7155 downward-only vs 2.7228 with the
    // r1/day2 lift — i.e. the lift is worse, not better. Assert the sign, not the
    // margin; the wider r1/day2/day3 variant below measures 2.7276.
    expect(withLift.maeCorrected).toBeGreaterThanOrEqual(downwardOnly.maeCorrected)
  })

  it('adding r1/day2/day3 lift cells (day3:QB included) also does not improve overall LOYO MAE', () => {
    const downwardOnly = runLoyo()
    const withLiftAllGroups = runLoyo({ liftGroups: new Set(['r1', 'day2', 'day3']) })

    // This variant additionally un-pins day3:QB (n=31, raw ratio 1.10), guarding
    // against a later session reading that raw ratio as an opportunity to lift it
    // off 1.00. Assert the sign, not the margin — see docs/projection.md for the
    // measured figure.
    expect(withLiftAllGroups.maeCorrected).toBeGreaterThanOrEqual(downwardOnly.maeCorrected)
  })
})

// ─── §5.4 — the named live-row regression fixtures ─────────────────────────────
// All four cases use currentSeason: 2025 and the draft-year window [2017..2026],
// matching what App.jsx would derive from nflDraftCoverage on 2026-09-07.

const WINDOW_2017_2026 = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]

// Builds a KTC pool of `poolSize` entries (the target plus poolSize-1 lower-valued
// pads) so computeKTCPositionPercentile resolves to a specific, exact percentile —
// `belowCount` of the pool must sit below the target's value.
function ktcMapWithPercentile(playerId, position, playersMap, belowCount, poolSize) {
  const map = new Map()
  map.set(playerId, { value: 9000, confidence: 'high' })
  for (let i = 1; i < poolSize; i++) {
    const padId = `ktc_pad_${position}_${i}`
    // First `belowCount` pads sit below the target; the rest sit above.
    const value = i <= belowCount ? 9000 - i * 500 : 9000 + i * 500
    map.set(padId, { value, confidence: 'low' })
    playersMap[padId] = { position, age: 25, years_exp: 3, team: 'SF' }
  }
  return map
}

describe('rookie calibration — §5.4 named regression fixtures', () => {
  // A · Fernando Mendoza (pid 13269, QB, 2026 R1P1, LV). Snapshot 2026-09-07.
  // The panel's early-capital cells are not shipped — the top of the rookie
  // board must not move.
  it('A · known 2026 first-rounder — unchanged from the shipped (pre-calibration) model', () => {
    const playerId = '13269'
    const playersMap = { [playerId]: { position: 'QB', age: 22, years_exp: 0, team: 'LV' } }
    const ktcMap = ktcMapWithPercentile(playerId, 'QB', playersMap, 4, 5)   // 4/5 below → 80th pct

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
    expect(r.factors.ktcPct).toBe(80)
    expect(r.factors.nflDraftTier).toBe('top-3')
    expect(r.factors.rookieMultiplierProduct).toBe(1.85)
    expect(r.factors.draftCapitalStatus).toBe('matched')
    expect(r.factors.rookieCalibrationMult).toBe(1)
    expect(r.factors.rookieCalibrationBasis).toBe('none')
    // Calibration arc slice 3 moved this row: 24.1 -> 21.0. Slice 1 still does
    // NOT touch it (rookieCalibrationMult/Basis above are unchanged) — the
    // ceiling above is what fired. See .claude/tasks/rookie-ceiling.md §5.6.
    expect(r.projectedPPG).toBe(21.0)
  })

  // B · Luke Altmyer (pid 13314, QB, 2026 UDFA, DET). Snapshot 2026-09-07.
  // No `age` on the real Sleeper record → exercises the `age ?? 23` default.
  it('B · known unmatched fringe player — takes the undrafted:QB discount', () => {
    const playerId = '13314'
    const playersMap = { [playerId]: { position: 'QB', age: null, years_exp: 0, team: 'DET' } }

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
      collegeStats: {
        [playerId]: {
          peakDominator: 32, productionTrend: 'improving',
          finalYearDominator: 30, seasonsPlayed: 2,
        },
      },
      currentSeason:    2025,
      qbQualityByTeam:  null,
      ktcHistory:       null,
      nflDraftMatches:  {},
      nflDraftYears:    WINDOW_2017_2026,
    })

    expect(r).not.toBeNull()
    expect(r.factors.nflDraftMatchSource).toBe('unmatched')
    expect(r.factors.nflDraftTier).toBeNull()
    expect(r.factors.ageDelta).toBe(0.95)              // age ?? 23 → rookieAgeAtDraft 23 → ageMult 0.95
    expect(r.factors.collegeContribution).toBe(1.25)   // collegeMult 1.26 clamped to 1.25
    expect(r.factors.rookieMultiplierProduct).toBe(1.188)
    expect(r.factors.draftCapitalStatus).toBe('undrafted')
    expect(r.factors.rookieCalibrationMult).toBe(0.67)
    expect(r.factors.rookieCalibrationBasis).toBe('undrafted:QB')
    expect(r.projectedPPG).toBe(10.3)
    expect(r.adjustmentSummary).toContain('Undrafted — realisation discount ↓↓')
  })

  // C · Josh Johnson (pid 260, QB, 2008 r5). Unmatched because the app only loads
  // 2017+ draft years — a real drafted player outside the window must not take
  // the UDFA discount.
  it('C · the window guard — a real drafted player outside [2017..2026] stays neutral', () => {
    const playerId = '260'
    const playersMap = { [playerId]: { position: 'QB', age: 40, years_exp: 18, team: 'FA' } }

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
      collegeStats:     null,
      currentSeason:    2025,
      qbQualityByTeam:  null,
      ktcHistory:       null,
      nflDraftMatches:  {},
      nflDraftYears:    WINDOW_2017_2026,
    })

    expect(r).not.toBeNull()
    expect(r.factors.ageDelta).toBe(0.82)
    expect(r.factors.rookieMultiplierProduct).toBe(0.82)
    expect(r.factors.draftCapitalStatus).toBe('unknown')
    expect(r.factors.rookieCalibrationMult).toBe(1)
    expect(r.factors.rookieCalibrationBasis).toBe('none')
    expect(r.projectedPPG).toBe(10.7)
  })

  // D · Bhayshul Tuten (pid 12490, RB, 2025 r4 p104). Snapshot 2026-09-07.
  it('D · the day-3 case — day3:RB discount applies', () => {
    const playerId = '12490'
    const playersMap = { [playerId]: { position: 'RB', age: 23, years_exp: 1, team: 'JAX' } }
    const ktcMap = ktcMapWithPercentile(playerId, 'RB', playersMap, 5, 6)   // 5/6 below → 83rd pct

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
      nflDraftMatches:  { [playerId]: { year: 2025, round: 4, pick: 104 } },
      nflDraftYears:    WINDOW_2017_2026,
    })

    expect(r).not.toBeNull()
    expect(r.factors.ktcPct).toBe(83)
    expect(r.factors.nflDraftTier).toBe('r4')
    expect(r.factors.rookieCalibrationBasis).toBe('day3:RB')
    expect(r.factors.rookieCalibrationMult).toBe(0.80)
    expect(r.projectedPPG).toBe(8.4)
  })
})
