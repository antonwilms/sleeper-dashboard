import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import file from '../__fixtures__/inseason-constants-2026-10-07.json'
import * as C from '../utils/inSeasonConstants'

// in-season-evidence-2b-1-constants-snapshot.md §2.3 — provenance oracle: every pinned K_* re-derives
// from the fixture's sufficient statistics by the file's own fit rule. The fixture is a byte-for-byte
// copy of the data repo's file at f2c3b83; this test never reads the sibling.

const FIXTURE_PATH = 'src/__fixtures__/inseason-constants-2026-10-07.json'
const FIXTURE_SHA1 = 'f2e2f41e5752cbc9f7084307cbf37fa83d5fa29a'

// grid k = t/10, loss = Σ over seasons (minus the excluded one) and n-keys of Saa + 2w·Sab + w²·Sbb,
// w = n/(n+k), sufficient stats [count, Saa, Sab, Sbb]; first strict improvement wins (tie → smaller k).
function refit(cell, excludeSeason) {
  const [lo, hi] = file.fit.kTenths
  let bestK = null
  let best = Infinity
  for (let t = lo; t <= hi; t++) {
    const k = t / 10
    let L = 0
    for (const [season, byN] of Object.entries(cell)) {
      if (excludeSeason != null && String(season) === String(excludeSeason)) continue
      for (const [n, [, Saa, Sab, Sbb]] of Object.entries(byN)) {
        const w = Number(n) / (Number(n) + k)
        L += Saa + 2 * w * Sab + w * w * Sbb
      }
    }
    if (L < best - 1e-9) { best = L; bestK = k }
  }
  return bestK
}
const pin = k => Math.round(k * 2) / 2

// The verdict's Constants table, comparator column — the only four `basis: 'study'` entries (the same four as at 2026-09-26; values from the 2026-10-07 verdict's comparator column).
const STUDY_COMPARATOR = {
  'K_DYN_POINTS|RB': 4.5,
  'K_DYN_POINTS_HISTORY|QB': 7.5,
  'K_DYN_OPP|TE': 4.0,
  'K_ROS_POINTS_SHORT|TE': 4.0,   // the 'WORSE vs Phase 1' note
}

const KEEP_OWN = 'NO-GAIN vs Phase 1; own k BEATS the pooled k out of sample → own k pinned'
const POOLED_NOTE = /does not beat the pooled k out of sample → pooled value pinned/

// Which fixture cell a pinned k must re-derive from, given the branch the file records.
// Scope: the *decision* (does own k BEAT pooled — a paired bootstrap) happens in the data repo's
// buildConstants. The app checks only the outcome contract; the decision-level test is owed data-side
// (D-49).
function expectedK(name, pos, entry, fx = file.fixture) {
  const own = `${name}|${pos}`
  const pooled = `${name}|ALL`
  if (entry.note === KEEP_OWN) {
    if (entry.fixtureKey !== undefined) throw new Error(`${own}: keep-own entry must not carry fixtureKey`)
    if (entry.basis !== 'fitted') throw new Error(`${own}: keep-own entry must be basis 'fitted'`)
    return pin(refit(fx[own]))
  }
  if (POOLED_NOTE.test(entry.note ?? '')) {
    if (entry.fixtureKey !== pooled) throw new Error(`${own}: pooled-pin entry must carry fixtureKey ${pooled}`)
    if (entry.basis !== 'pooled') throw new Error(`${own}: pooled-pin entry must be basis 'pooled'`)
    return pin(refit(fx[pooled]))
  }
  if (entry.basis === 'fitted') {
    if (entry.fixtureKey !== undefined) throw new Error(`${own}: fitted entry must not carry fixtureKey`)
    return pin(refit(fx[own]))
  }
  if (entry.basis === 'pooled') {
    if (entry.fixtureKey !== pooled) throw new Error(`${own}: pooled entry must carry fixtureKey ${pooled}`)
    return pin(refit(fx[pooled]))
  }
  if (entry.basis === 'study') return STUDY_COMPARATOR[own]
  throw new Error(`${own}: unknown basis ${entry.basis}`)
}

describe('fixture integrity', () => {
  it('is the byte-identical copy of the data file at f2c3b83', () => {
    const text = readFileSync(FIXTURE_PATH)
    expect(createHash('sha1').update(text).digest('hex')).toBe(FIXTURE_SHA1)
    expect(text.length).toBe(174880)
  })

  it('carries the fields the app relies on', () => {
    expect(file.source).toContain('backtests/2026-10-07-inseason-constants.json')
    expect(file.fit.qbPrior.model).toBe('starter')
    expect(file.generatedAt).toBe(C.IN_SEASON_CONSTANTS_SOURCE.generatedAt)
    expect(file.basis).toBe('half_ppr')
    expect(file.combination).toBeNull()
    expect(file.sortMeasure.name).toBe('relative')
    expect(file.fit.prior).toBe('frozen')
    expect(file.fit.opportunityBaseline).toBe('B')
    expect(file.fit.priorOptimism).toContain('MUST be re-fitted')
  })
})

describe('every file entry re-derives from the fixture', () => {
  const entries = Object.entries(file.constants).flatMap(([name, byPos]) =>
    Object.entries(byPos).map(([pos, entry]) => [name, pos, entry]))

  it('covers all 46 entries', () => {
    expect(entries.length).toBe(46)
  })

  it('kFit, every foldK, and the pinned k', () => {
    for (const [name, pos, entry] of entries) {
      const cell = file.fixture[entry.fixtureKey ?? `${name}|${pos}`]
      expect(refit(cell), `${name}|${pos} kFit`).toBe(entry.kFit)
      for (const [s, k] of Object.entries(entry.foldK ?? {})) {
        expect(refit(cell, s), `${name}|${pos} foldK ${s}`).toBe(k)
      }
      expect(entry.k, `${name}|${pos} k`).toBe(expectedK(name, pos, entry))
    }
  })
})

describe('the app module equals the file', () => {
  const NINE = ['K_ROS_POINTS', 'K_ROS_POINTS_ROOKIE0', 'K_ROS_POINTS_ROOKIE1P', 'K_ROS_POINTS_SHORT',
    'K_DYN_POINTS_HISTORY', 'K_DYN_POINTS_ROOKIE0', 'K_DYN_POINTS_ROOKIE1P', 'K_DYN_POINTS_SHORT', 'K_ROS_OPP']
  for (const name of NINE) {
    it(`${name} deep-equals the file's pinned k`, () => {
      const fromFile = Object.fromEntries(Object.entries(file.constants[name]).map(([p, e]) => [p, e.k]))
      expect(C[name]).toEqual(fromFile)
    })
  }
  it('SORT_MEASURE and the source record', () => {
    expect(C.SORT_MEASURE).toBe(file.sortMeasure.name)
    expect(C.IN_SEASON_CONSTANTS_SOURCE.fixture).toBe(FIXTURE_PATH)
  })
})

// Q4 NO-GAIN pooled-pin rule, both branches. No real cell carries the keep-own note in the 2026-10-07 file, so that
// entry is synthetic, built from a real fitted own cell whose own pin differs from its ALL pin (ROOKIE1P WR).
describe('the Q4 NO-GAIN pooled-pin outcome contract (two branches)', () => {
  it('keep-own: own cell, not the pooled one', () => {
    const real = file.constants.K_ROS_POINTS_ROOKIE1P.WR
    expect(real.k).toBe(3)
    expect(pin(refit(file.fixture['K_ROS_POINTS_ROOKIE1P|ALL']))).toBe(2.5)   // own pin ≠ ALL pin
    const synth = { ...real, note: KEEP_OWN }
    expect(expectedK('K_ROS_POINTS_ROOKIE1P', 'WR', synth)).toBe(3)
    expect(() => expectedK('K_ROS_POINTS_ROOKIE1P', 'WR', { ...synth, fixtureKey: 'K_ROS_POINTS_ROOKIE1P|ALL' }))
      .toThrow(/keep-own entry must not carry fixtureKey/)
  })

  it('pooled: the ALL cell; dropping fixtureKey throws', () => {
    const real = file.constants.K_ROS_POINTS_ROOKIE0.RB
    expect(real.note).toMatch(POOLED_NOTE)
    expect(expectedK('K_ROS_POINTS_ROOKIE0', 'RB', real)).toBe(2.5)
    const noKey = { ...real }
    delete noKey.fixtureKey
    expect(() => expectedK('K_ROS_POINTS_ROOKIE0', 'RB', noKey))
      .toThrow(/pooled-pin entry must carry fixtureKey/)
  })
})

// in-season-evidence-2c-wiring §3.6 — the arm-A prospect k are pinned from the 2c panel fixture (a byte copy of
// the data file at 5c4b6c7), not from a constants file.
describe('2c dynasty-side pins (panel fixture)', () => {
  const PANEL_PATH = 'src/__fixtures__/inseason-dyn-panel-2026-09-27.json'

  it('the panel fixture is the byte-identical copy of the data file at 5c4b6c7', () => {
    const text = readFileSync(PANEL_PATH)
    expect(createHash('sha1').update(text).digest('hex')).toBe('0f2195ec1f04bef27bcaaf2dd2fc259b4ba5179d')
    expect(C.IN_SEASON_DYN_PANEL_SOURCE.fixture).toBe(PANEL_PATH)
    expect(C.IN_SEASON_DYN_PANEL_SOURCE.commit.startsWith('5c4b6c7')).toBe(true)
  })

  it('K_DYN_PROSPECT_A_YE1 equals Math.round(kFit*2)/2 of the YE1 pooled arm-A fit, in every cell', () => {
    const panel = JSON.parse(readFileSync(PANEL_PATH, 'utf8'))
    const k = pin(panel.q1.subgroups.YE1.pooled.A.kFit)
    for (const pos of ['QB', 'RB', 'WR', 'TE']) expect(C.K_DYN_PROSPECT_A_YE1[pos]).toBe(k)
  })

  it('PROSPECT_PRIOR_KIND: keys 0 and 1, four skill keys each, only [1].WR is position', () => {
    expect(Object.keys(C.PROSPECT_PRIOR_KIND).sort()).toEqual(['0', '1'])
    const positions = []
    for (const [ye, byPos] of Object.entries(C.PROSPECT_PRIOR_KIND)) {
      expect(Object.keys(byPos).sort()).toEqual(['QB', 'RB', 'TE', 'WR'])
      for (const [pos, kind] of Object.entries(byPos)) if (kind === 'position') positions.push(`${ye}.${pos}`)
    }
    expect(positions).toEqual(['1.WR'])
  })
})
