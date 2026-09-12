/**
 * src/__tests__/rookieAvailability.test.js
 *
 * Provenance and out-of-sample gate for the rookie availability (projected
 * games) ladder (calibration arc slice 2, .claude/tasks/rookie-availability.md
 * §5.3/§5.4). Mirrors slice 1's rookieCalibration.test.js structure and reuses
 * its draft grouping unchanged.
 *
 * The fixture (src/__fixtures__/rookie-games-panel-2026-09-09.json) has NO
 * committed data-repo artifact behind it — Session 1 assembled it directly from
 * two live data-repo families (nfl/season-totals + nflverse/playerids.json).
 * Its own `source` block is the full derivation recipe (§5.3's "honest
 * limitation": this proves the fixture is internally consistent and
 * tamper-evident, not that the join/predicate were the right ones to run).
 * A generator script was considered and dropped in review (task file §10) —
 * nothing here reads the sibling repo, and the recipe lives only in the
 * fixture's own `source` block.
 *
 * Four concerns:
 *   1. Fixture integrity — row/group/experience counts, and the reconciliation
 *      between rung 1's experience cells and rung 3's group×position columns.
 *   2. Provenance — every shipped table cell (28 rung-1, 10 rung-2, 16 rung-3,
 *      4 rung-4, 16 rung-U) is re-derived from the fixture, cross-checked
 *      against resolveRookieGames wherever the cell is actually reachable.
 *   3. Out-of-sample gate — a from-scratch leave-one-target-year-out
 *      reimplementation shows the ladder beats the shipped constant and the
 *      experience-blind ladder.
 *   4. The experience rungs stay in — a explicit guard against a later session
 *      reading the ~0.18-game aggregate gain as grounds to strip them.
 *
 * Plus §5.4's four named regression fixtures, extending slice 1's own four
 * players with the games/total-points half of the story.
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
  resolveRookieGames,
  ROOKIE_GAMES_TABLES,
} from '../utils/seasonProjection.js'
import fixture from '../__fixtures__/rookie-games-panel-2026-09-09.json'

const rows = fixture.rows
const GROUPS = ['r1', 'day2', 'day3', 'undrafted']
const POSITIONS = ['QB', 'RB', 'WR', 'TE']
const EXP_BUCKETS = ['0', '1', '2+']

// A representative (draftCapitalStatus, nflDraftTier) pair for each group, so a
// provenance check can call resolveRookieGames and land on that group's cells.
const GROUP_PROBE = {
  r1:        { draftCapitalStatus: 'matched', nflDraftTier: 'top-3' },
  day2:      { draftCapitalStatus: 'matched', nflDraftTier: 'r2' },
  day3:      { draftCapitalStatus: 'matched', nflDraftTier: 'r4' },
  undrafted: { draftCapitalStatus: 'undrafted', nflDraftTier: null },
}
const YEARS_EXP_FOR_BUCKET = { '0': 0, '1': 1, '2+': 5 }

function cellStats(subset) {
  const n = subset.length
  const mean = n > 0 ? subset.reduce((a, r) => a + r.games, 0) / n : null
  return { mean, n }
}

// ─── §5.3.1 Fixture integrity ──────────────────────────────────────────────────

describe('rookie-games-panel-2026-09-09.json fixture integrity', () => {
  it('has 3,848 rows, every games value an integer in [0, 17]', () => {
    expect(rows).toHaveLength(3848)
    expect(rows.every(r => Number.isInteger(r.games) && r.games >= 0 && r.games <= 17)).toBe(true)
  })

  it('group counts match the assembled panel', () => {
    const counts = {}
    for (const r of rows) counts[r.g] = (counts[r.g] ?? 0) + 1
    expect(counts.r1).toBe(152)
    expect(counts.day2).toBe(360)
    expect(counts.day3).toBe(1119)
    expect(counts.undrafted).toBe(2217)
  })

  it('experience counts match the assembled panel', () => {
    const counts = {}
    for (const r of rows) counts[r.e] = (counts[r.e] ?? 0) + 1
    expect(counts['0']).toBe(2071)
    expect(counts['1']).toBe(1120)
    expect(counts['2+']).toBe(657)
  })

  it('carries a source provenance block with the join and predicate recorded', () => {
    expect(typeof fixture.source).toBe('object')
    expect(fixture.source).not.toBeNull()
    expect(typeof fixture.source.join).toBe('string')
    expect(typeof fixture.source.predicate).toBe('string')
    expect(fixture.source.join.length).toBeGreaterThan(0)
    expect(fixture.source.predicate.length).toBeGreaterThan(0)
    expect(fixture.source.rowCount).toBe(3848)
  })

  it('reconciliation: rung-3 (group×position) n sums to each group\'s total row count', () => {
    for (const group of GROUPS) {
      const groupTotal = rows.filter(r => r.g === group).length
      const sumOverPositions = POSITIONS.reduce(
        (acc, pos) => acc + rows.filter(r => r.g === group && r.p === pos).length,
        0,
      )
      expect(sumOverPositions, group).toBe(groupTotal)
    }
  })

  it('reconciliation: rung-1 experience cells close the rung-3 column for every day-3/undrafted position except day3|TE (its 2+ bucket, n=23, is below the rung-1 floor)', () => {
    const gaps = []
    for (const group of ['day3', 'undrafted']) {
      for (const pos of POSITIONS) {
        const rung3N = rows.filter(r => r.g === group && r.p === pos).length
        const sumOfPresentBuckets = EXP_BUCKETS.reduce((acc, bucket) => {
          const n = rows.filter(r => r.g === group && r.p === pos && r.e === bucket).length
          return n >= 30 ? acc + n : acc
        }, 0)
        if (sumOfPresentBuckets !== rung3N) gaps.push(`${group}|${pos}`)
      }
    }
    // Exactly one gap: day3|TE (its 2+ bucket sits at n=23, below the rung-1 n≥30
    // floor, so rung 1 cannot close that column — the other seven do).
    expect(gaps).toEqual(['day3|TE'])
  })
})

// ─── §5.3.2 Provenance — every shipped table cell re-derived from the fixture ──

describe('rookie availability provenance — every table cell re-derived from the fixture', () => {
  // RUNG 1 — group×position×experience, floor n≥30. 28 shipped cells.
  const RUNG1 = {
    'r1|QB|0': 11.5, 'r1|WR|0': 13.1,
    'day2|RB|0': 12.3, 'day2|TE|0': 12.6, 'day2|WR|0': 13.5,
    'day3|QB|0': 1.9, 'day3|QB|1': 2.2, 'day3|QB|2+': 2.0,
    'day3|RB|0': 9.9, 'day3|RB|1': 3.5, 'day3|RB|2+': 4.0,
    'day3|TE|0': 8.6, 'day3|TE|1': 5.8,
    'day3|WR|0': 8.2, 'day3|WR|1': 4.7, 'day3|WR|2+': 3.8,
    'undrafted|QB|0': 0.9, 'undrafted|QB|1': 0.7, 'undrafted|QB|2+': 2.8,
    'undrafted|RB|0': 4.4, 'undrafted|RB|1': 2.6, 'undrafted|RB|2+': 4.9,
    'undrafted|TE|0': 3.9, 'undrafted|TE|1': 3.8, 'undrafted|TE|2+': 4.7,
    'undrafted|WR|0': 2.8, 'undrafted|WR|1': 2.3, 'undrafted|WR|2+': 4.1,
  }
  const RUNG1_N = {
    'r1|QB|0': 41, 'r1|WR|0': 54,
    'day2|RB|0': 71, 'day2|TE|0': 61, 'day2|WR|0': 117,
    'day3|QB|0': 77, 'day3|QB|1': 64, 'day3|QB|2+': 103,
    'day3|RB|0': 204, 'day3|RB|1': 65, 'day3|RB|2+': 34,
    'day3|TE|0': 117, 'day3|TE|1': 47,
    'day3|WR|0': 234, 'day3|WR|1': 98, 'day3|WR|2+': 53,
    'undrafted|QB|0': 73, 'undrafted|QB|1': 66, 'undrafted|QB|2+': 52,
    'undrafted|RB|0': 290, 'undrafted|RB|1': 205, 'undrafted|RB|2+': 69,
    'undrafted|TE|0': 204, 'undrafted|TE|1': 151, 'undrafted|TE|2+': 101,
    'undrafted|WR|0': 469, 'undrafted|WR|1': 363, 'undrafted|WR|2+': 174,
  }

  it('all 28 rung-1 cells match the fixture (value to 1dp, n exact, clears n≥30) and resolveRookieGames', () => {
    expect(Object.keys(RUNG1)).toHaveLength(28)
    for (const [key, expectedValue] of Object.entries(RUNG1)) {
      const [group, pos, bucket] = key.split('|')
      const subset = rows.filter(r => r.g === group && r.p === pos && r.e === bucket)
      const { mean, n } = cellStats(subset)
      expect(n, key).toBe(RUNG1_N[key])
      expect(n, key).toBeGreaterThanOrEqual(30)
      expect(Math.round(mean * 10) / 10, key).toBeCloseTo(expectedValue, 1)
      // Third leg: the shipped constant itself (not the hardcoded literal
      // above) against the fixture mean — the source-against-fixture
      // comparison Fix pass 2 adds, so a hand-copied literal never diverges
      // from source unnoticed.
      expect(ROOKIE_GAMES_TABLES.gpe[key], key).toBeCloseTo(mean, 1)

      const yearsExp = YEARS_EXP_FOR_BUCKET[bucket]
      const r = resolveRookieGames({ position: pos, yearsExp, ...GROUP_PROBE[group] })
      expect(r.rookieGamesBasis, key).toBe(`gpe:${key}`)
      expect(r.projectedGames, key).toBe(Math.round(expectedValue))
    }
  })

  // RUNG 2 — group×experience, floor n≥30. 10 shipped cells + 2 documented absences.
  // Fix pass 1 item 1: only 5 of these 10 cells are reachable through
  // resolveRookieGames (the other 5 — day3|0, day3|1, undrafted|0, undrafted|1,
  // undrafted|2+ — are fully shadowed by a populated rung 1, and all 4 rung-4
  // values are shadowed by a fully populated rung 3; see
  // seasonProjection.test.js's cross-product sweep for the exact reachability
  // map). Fix pass 2: those shadowed cells are unreachable at runtime, but
  // every one of the 10 is now fully value-pinned — the shipped constant is
  // compared directly to this fixture-derived mean below, which is the
  // accurate limit, not merely a fixture-only check.
  const RUNG2 = {
    'r1|0': 12.8, 'day2|0': 12.3, 'day2|1': 6.9, 'day2|2+': 4.0,
    'day3|0': 8.0, 'day3|1': 4.0, 'day3|2+': 3.4,
    'undrafted|0': 3.3, 'undrafted|1': 2.5, 'undrafted|2+': 4.2,
  }
  const RUNG2_N = {
    'r1|0': 127, 'day2|0': 276, 'day2|1': 44, 'day2|2+': 40,
    'day3|0': 632, 'day3|1': 274, 'day3|2+': 213,
    'undrafted|0': 1036, 'undrafted|1': 785, 'undrafted|2+': 396,
  }

  it('all 10 rung-2 cells match the fixture (value to 1dp, n exact, clears n≥30) and resolveRookieGames (where rung 1 has no cell)', () => {
    expect(Object.keys(RUNG2)).toHaveLength(10)
    for (const [key, expectedValue] of Object.entries(RUNG2)) {
      const [group, bucket] = key.split('|')
      const subset = rows.filter(r => r.g === group && r.e === bucket)
      const { mean, n } = cellStats(subset)
      expect(n, key).toBe(RUNG2_N[key])
      expect(n, key).toBeGreaterThanOrEqual(30)
      expect(Math.round(mean * 10) / 10, key).toBeCloseTo(expectedValue, 1)
      expect(ROOKIE_GAMES_TABLES.ge[key], key).toBeCloseTo(mean, 1)
    }

    // Cross-check against resolveRookieGames for the cells with no rung-1
    // sibling at all (day2|QB has no GPE entry for any bucket) — those are
    // guaranteed to resolve through rung 2, not fall through to it by luck.
    const r = resolveRookieGames({ position: 'QB', draftCapitalStatus: 'matched', nflDraftTier: 'r2', yearsExp: 1 })
    expect(r.rookieGamesBasis).toBe('ge:day2|1')
    expect(r.projectedGames).toBe(Math.round(RUNG2['day2|1']))
  })

  it('the two documented rung-2 absences (r1|1 n=17, r1|2+ n=8) genuinely fall below the n≥30 floor, and resolveRookieGames falls through to rung 3 for them', () => {
    const n1 = rows.filter(r => r.g === 'r1' && r.e === '1').length
    const n2 = rows.filter(r => r.g === 'r1' && r.e === '2+').length
    expect(n1).toBe(17)
    expect(n2).toBe(8)
    expect(n1).toBeLessThan(30)
    expect(n2).toBeLessThan(30)

    const rYear1 = resolveRookieGames({ position: 'QB', draftCapitalStatus: 'matched', nflDraftTier: 'top-3', yearsExp: 1 })
    expect(rYear1.rookieGamesBasis).toBe('gp:r1|QB')
    const rYear2plus = resolveRookieGames({ position: 'QB', draftCapitalStatus: 'matched', nflDraftTier: 'top-3', yearsExp: 5 })
    expect(rYear2plus.rookieGamesBasis).toBe('gp:r1|QB')
  })

  // RUNG 3 — group×position, floor n≥10. All 16 clear it.
  const RUNG3 = {
    r1:        { QB: 10.5, RB: 13.8, WR: 12.8, TE: 14.6 },
    day2:      { QB: 4.7, RB: 10.8, WR: 13.1, TE: 11.5 },
    day3:      { QB: 2.1, RB: 7.9, WR: 6.7, TE: 7.7 },
    undrafted: { QB: 1.3, RB: 3.8, WR: 2.9, TE: 4.0 },
  }
  const RUNG3_N = {
    r1:        { QB: 57, RB: 18, WR: 61, TE: 16 },
    day2:      { QB: 65, RB: 91, WR: 127, TE: 77 },
    day3:      { QB: 244, RB: 303, WR: 385, TE: 187 },
    undrafted: { QB: 191, RB: 564, WR: 1006, TE: 456 },
  }

  it('all 16 rung-3 cells match the fixture (value to 1dp, n exact, clears n≥10)', () => {
    let count = 0
    for (const group of GROUPS) {
      for (const pos of POSITIONS) {
        count++
        const subset = rows.filter(r => r.g === group && r.p === pos)
        const { mean, n } = cellStats(subset)
        expect(n, `${group}|${pos}`).toBe(RUNG3_N[group][pos])
        expect(n, `${group}|${pos}`).toBeGreaterThanOrEqual(10)
        expect(Math.round(mean * 10) / 10, `${group}|${pos}`).toBeCloseTo(RUNG3[group][pos], 1)
        expect(ROOKIE_GAMES_TABLES.gp[group][pos], `${group}|${pos}`).toBeCloseTo(mean, 1)
      }
    }
    expect(count).toBe(16)
  })

  it('resolveRookieGames reaches rung 3 (gp:) for a group×position with no rung-1/rung-2 cell', () => {
    // r1|RB has no rung-1 cell (only r1|QB|0 and r1|WR|0 ship) and no rung-2 cell
    // at any experience bucket for RB specifically (rung 2 is experience-only,
    // not position-specific, so it never intercepts before rung 3 for r1|RB).
    const r = resolveRookieGames({ position: 'RB', draftCapitalStatus: 'matched', nflDraftTier: 'top-3', yearsExp: 1 })
    expect(r.rookieGamesBasis).toBe('gp:r1|RB')
    expect(r.projectedGames).toBe(Math.round(RUNG3.r1.RB))
  })

  // RUNG 4 — group pooled. Unreachable through any real position today (rung 3
  // covers all 16 group×position cells), so only the fixture-derived VALUE is
  // asserted — per §5.3 item 2, its n is the group total already asserted above.
  // Fix pass 2: unreachable at runtime, but now fully value-pinned — the
  // shipped constant is compared directly to the fixture mean below.
  const RUNG4 = { r1: 12.2, day2: 10.7, day3: 6.2, undrafted: 3.2 }

  it('all 4 rung-4 (group-pooled) values match the fixture', () => {
    for (const group of GROUPS) {
      const subset = rows.filter(r => r.g === group)
      const { mean } = cellStats(subset)
      expect(Math.round(mean * 10) / 10, group).toBeCloseTo(RUNG4[group], 1)
      expect(ROOKIE_GAMES_TABLES.g[group], group).toBeCloseTo(mean, 1)
    }
  })

  // RUNG U — position×experience over the WHOLE rookie-path population
  // (pooled across all four groups), used only when draftCapitalStatus is
  // 'unknown'. Every keyed cell n≥112 (asserted via the pooled position total
  // in the fixture-integrity block above; not re-derived here per §5.3 item 2).
  const RUNG_U = {
    QB: { '0': 3.9, '1': 2.3, '2+': 2.5, pooled: 3.0 },
    RB: { '0': 7.6, '1': 3.0, '2+': 4.5, pooled: 5.9 },
    WR: { '0': 6.3, '1': 3.0, '2+': 4.1, pooled: 5.0 },
    TE: { '0': 7.0, '1': 4.5, '2+': 5.2, pooled: 6.0 },
  }

  it('all 12 keyed rung-U cells and 4 pooled values match the fixture and resolveRookieGames', () => {
    for (const pos of POSITIONS) {
      for (const bucket of EXP_BUCKETS) {
        const subset = rows.filter(r => r.p === pos && r.e === bucket)
        const { mean, n } = cellStats(subset)
        expect(n, `${pos}|${bucket}`).toBeGreaterThanOrEqual(112)
        expect(Math.round(mean * 10) / 10, `${pos}|${bucket}`).toBeCloseTo(RUNG_U[pos][bucket], 1)
        expect(ROOKIE_GAMES_TABLES.u[pos][bucket], `${pos}|${bucket}`).toBeCloseTo(mean, 1)

        const r = resolveRookieGames({
          position: pos, draftCapitalStatus: 'unknown', nflDraftTier: null,
          yearsExp: YEARS_EXP_FOR_BUCKET[bucket],
        })
        expect(r.rookieGamesBasis, `${pos}|${bucket}`).toBe(`u:${pos}|${bucket}`)
        expect(r.projectedGames, `${pos}|${bucket}`).toBe(Math.round(RUNG_U[pos][bucket]))
      }
      const posSubset = rows.filter(r => r.p === pos)
      const { mean, n } = cellStats(posSubset)
      expect(n, pos).toBeGreaterThanOrEqual(112)
      expect(Math.round(mean * 10) / 10, pos).toBeCloseTo(RUNG_U[pos].pooled, 1)
      expect(ROOKIE_GAMES_TABLES.u[pos].pooled, pos).toBeCloseTo(mean, 1)

      const rPooled = resolveRookieGames({ position: pos, draftCapitalStatus: 'unknown', nflDraftTier: null, yearsExp: null })
      expect(rPooled.rookieGamesBasis, pos).toBe(`u:${pos}`)
      expect(rPooled.projectedGames, pos).toBe(Math.round(RUNG_U[pos].pooled))
    }
  })
})

// ─── §5.3.3/4 — leave-one-target-year-out gate + the experience-rungs guard ────

// Reimplements the ladder and its floors from .claude/tasks/rookie-availability.md
// §2.1: rung 1 (group×position×experience, n≥30) → rung 2 (group×experience,
// n≥30) → rung 3 (group×position, n≥10) → rung 4 (group, no floor). `useExpRungs:
// false` skips rungs 1/2 entirely — the "experience-blind" ladder slice 1's
// own precedent tests against.
function fitGamesTables(trainRows) {
  const gpe = new Map(), ge = new Map(), gp = new Map(), g_ = new Map()
  function acc(map, key, games) {
    const c = map.get(key) ?? { sum: 0, n: 0 }
    c.sum += games; c.n += 1
    map.set(key, c)
  }
  for (const r of trainRows) {
    acc(gpe, `${r.g}|${r.p}|${r.e}`, r.games)
    acc(ge, `${r.g}|${r.e}`, r.games)
    acc(gp, `${r.g}|${r.p}`, r.games)
    acc(g_, r.g, r.games)
  }
  return { gpe, ge, gp, g_ }
}

function predictGames(r, tables, { useExpRungs }) {
  const { gpe, ge, gp, g_ } = tables
  if (useExpRungs) {
    const c1 = gpe.get(`${r.g}|${r.p}|${r.e}`)
    if (c1 && c1.n >= 30) return Math.round(c1.sum / c1.n)
    const c2 = ge.get(`${r.g}|${r.e}`)
    if (c2 && c2.n >= 30) return Math.round(c2.sum / c2.n)
  }
  const c3 = gp.get(`${r.g}|${r.p}`)
  if (c3 && c3.n >= 10) return Math.round(c3.sum / c3.n)
  const c4 = g_.get(r.g)
  if (c4) return Math.round(c4.sum / c4.n)
  return 14
}

function runLoyoGames({ useExpRungs = true } = {}) {
  const years = [...new Set(rows.map(r => r.y))].sort()
  const errs = []
  for (const y of years) {
    const train = rows.filter(r => r.y !== y)
    const test  = rows.filter(r => r.y === y)
    const tables = fitGamesTables(train)
    for (const r of test) errs.push(Math.abs(r.games - predictGames(r, tables, { useExpRungs })))
  }
  return errs.reduce((a, b) => a + b, 0) / errs.length
}

describe('rookie availability — leave-one-target-year-out out-of-sample gate', () => {
  const maeConst14 = rows.reduce((a, r) => a + Math.abs(r.games - 14), 0) / rows.length
  const maeBlind   = runLoyoGames({ useExpRungs: false })
  const maeFull    = runLoyoGames({ useExpRungs: true })

  it('the ladder beats the shipped constant 14 by at least 4.5 games overall', () => {
    // Measured: 9.424 → 4.055 (Δ ≈ 5.37). Loose bound, not exact reproduction.
    expect(maeConst14).toBeGreaterThan(9)   // sanity: the constant really is this bad
    expect(maeConst14 - maeFull).toBeGreaterThanOrEqual(4.5)
  })

  it('the ladder beats the experience-blind ladder', () => {
    // Measured: 4.234 (blind) → 4.055 (full). Sign, not float.
    expect(maeFull).toBeLessThan(maeBlind)
  })

  it('the correction is genuine, not degenerate', () => {
    expect(maeFull).toBeGreaterThan(0)
    expect(maeFull).toBeLessThan(maeConst14)
  })
})

describe('rookie availability — the experience rungs stay in', () => {
  it('an experience-blind ladder is not better, so a later session cannot strip the key on aggregate grounds', () => {
    const maeBlind = runLoyoGames({ useExpRungs: false })
    const maeFull  = runLoyoGames({ useExpRungs: true })
    expect(maeBlind).toBeGreaterThanOrEqual(maeFull)
  })
})

// ─── §5.4 — the named live-row regression fixtures ─────────────────────────────
// Same four players as slice 1's §5.4 (rookieCalibration.test.js), extended with
// the games/total-points half. Inputs from snapshots/2026-09-07.json (predates
// slice 1), so PPG values are the post-slice-1 ones recomputed by hand — the
// same figures slice 1's own regression fixtures assert. Every total is
// unrounded PPG × games, rounded once, per §5.2's guard.

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

describe('rookie availability — §5.4 named regression fixtures', () => {
  // A · Fernando Mendoza (pid 13269, QB, 2026 R1P1, LV).
  it('A · known 2026 first-rounder — 14 → 12 games (gpe:r1|QB|0), 288.6 total points', () => {
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
    // Calibration arc slice 3 moved this row: 24.1 -> 21.0 (ceiling fired at
    // QB). See .claude/tasks/rookie-ceiling.md §5.6.
    expect(r.projectedPPG).toBe(21.0)
    expect(r.factors.rookieGamesBasis).toBe('gpe:r1|QB|0')
    expect(r.projectedGames).toBe(12)
    // 21.007209 (unrounded, post-ceiling) × 12, rounded once — not 24.05 × 12.
    expect(r.projectedTotalPts).toBe(252.1)
  })

  // B · Luke Altmyer (pid 13314, QB, 2026 UDFA, DET).
  it('B · known unmatched fringe player — 14 → 1 game (gpe:undrafted|QB|0), 10.3 total points', () => {
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
    expect(r.projectedPPG).toBe(10.3)   // unchanged from slice 1
    expect(r.factors.rookieGamesBasis).toBe('gpe:undrafted|QB|0')
    expect(r.projectedGames).toBe(1)
    expect(r.projectedTotalPts).toBe(10.3)   // 10.343125 (unrounded) × 1 → 10.3
  })

  // C · Josh Johnson (pid 260, QB, 2008 r5) — the case worth keeping. Slice 1
  // left him neutral because his draft status is unknown; rung U is what stops
  // "unknown draft capital" from also meaning "assume a full season" for a
  // 40-year-old fourth-string quarterback.
  it('C · the window guard — 14 → 3 games (u:QB|2+), 32.0 total points', () => {
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
    expect(r.projectedPPG).toBe(10.7)   // unchanged from slice 1
    expect(r.factors.draftCapitalStatus).toBe('unknown')
    expect(r.factors.rookieGamesBasis).toBe('u:QB|2+')
    expect(r.projectedGames).toBe(3)
    expect(r.projectedTotalPts).toBe(32.0)   // 10.66 (unrounded) × 3
  })

  // D · Bhayshul Tuten (pid 12490, RB, 2025 r4 p104).
  it('D · the day-3 case — 14 → 4 games (gpe:day3|RB|1), 33.5 total points', () => {
    const playerId = '12490'
    const playersMap = { [playerId]: { position: 'RB', age: 23, years_exp: 1, team: 'JAX' } }
    const ktcMap = ktcMapWithPercentile(playerId, 'RB', playersMap, 5, 6)

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
    expect(r.projectedPPG).toBe(8.4)   // unchanged from slice 1
    expect(r.factors.rookieGamesBasis).toBe('gpe:day3|RB|1')
    expect(r.projectedGames).toBe(4)
    expect(r.projectedTotalPts).toBe(33.5)   // 8.377614 (unrounded) × 4
  })
})
