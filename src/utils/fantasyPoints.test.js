import { describe, it, expect } from 'vitest'
import {
  calculateFantasyPoints, getCategoryPoints,
  NON_ADDITIVE_KEYS, seasonEmitsFirstDownBonus, withFirstDownBonus, scoreSeasonStats,
} from './fantasyPoints.js'

describe('calculateFantasyPoints', () => {
  it('empty scoring → 0', () => {
    expect(calculateFantasyPoints({ pass_yd: 300 }, {})).toBe(0)
  })

  it('empty stats → 0', () => {
    expect(calculateFantasyPoints({}, { pass_yd: 0.04 })).toBe(0)
  })

  it('standard PPR sample — exact dot-product (byte-identical port claim)', () => {
    // 300 pass_yd × 0.04 = 12.00 + 3 pass_td × 4 = 12.00 → total 24.00
    const stats   = { pass_yd: 300, pass_td: 3 }
    const scoring = { pass_yd: 0.04, pass_td: 4 }
    expect(calculateFantasyPoints(stats, scoring)).toBe(24.00)
  })

  it('null multipliers in scoring are ignored — no throw', () => {
    const stats   = { pass_yd: 100, pass_td: 1 }
    const scoring = { pass_yd: null, pass_td: 4 }
    expect(calculateFantasyPoints(stats, scoring)).toBe(4)
  })

  it('key in stats absent from scoring — silently skipped', () => {
    const stats   = { rush_yd: 100, pass_td: 1 }
    const scoring = { pass_td: 4 }
    // rush_yd not in scoring → skipped; total = 1×4 = 4
    expect(calculateFantasyPoints(stats, scoring)).toBe(4)
  })

  it('2-decimal rounding — Math.round half-up', () => {
    // 1 rec × 0.345 = 0.345 → should round to 0.35 (but multiplied by 100 = 34.5 → round = 35)
    // Actually Math.round(0.345 * 100) / 100 = Math.round(34.5) / 100 = 35/100 = 0.35
    const stats   = { rec: 1 }
    const scoring = { rec: 0.345 }
    expect(calculateFantasyPoints(stats, scoring)).toBe(0.35)
  })
})

describe('getCategoryPoints', () => {
  it('null stats → all-zero buckets', () => {
    expect(getCategoryPoints(null, { pass_td: 4 })).toEqual({ pass: 0, rush: 0, rec: 0, other: 0 })
  })

  it('null scoring → all-zero buckets', () => {
    expect(getCategoryPoints({ pass_td: 1 }, null)).toEqual({ pass: 0, rush: 0, rec: 0, other: 0 })
  })

  it('categorisation correctness — prefix logic', () => {
    const stats = {
      pass_yd:   300,   // pass_
      rush_yd:   50,    // rush_
      rec_yd:    80,    // rec_
      rec:       5,     // bare 'rec'
      bonus_rec_te: 0.5, // bonus_ → other
      pass_int:  1,     // pass_ → pass
      fum_lost:  1,     // none of the above → other
    }
    const scoring = {
      pass_yd:   0.04,
      rush_yd:   0.1,
      rec_yd:    0.1,
      rec:       1,
      bonus_rec_te: 1,
      pass_int:  -2,
      fum_lost:  -2,
    }
    const r = getCategoryPoints(stats, scoring)
    // pass_yd: 300×0.04=12, pass_int: 1×-2=-2 → pass = 10
    expect(r.pass).toBeCloseTo(10, 5)
    // rush_yd: 50×0.1=5 → rush = 5
    expect(r.rush).toBeCloseTo(5, 5)
    // rec_yd: 80×0.1=8, rec: 5×1=5 → rec = 13
    expect(r.rec).toBeCloseTo(13, 5)
    // bonus_rec_te: 0.5×1=0.5, fum_lost: 1×-2=-2 → other = -1.5
    expect(r.other).toBeCloseTo(-1.5, 5)
  })

  it('exact arithmetic — known stat+scoring combo, per-bucket totals', () => {
    const stats   = { pass_td: 2, rush_td: 1, rec: 4 }
    const scoring = { pass_td: 4, rush_td: 6, rec: 1 }
    const r = getCategoryPoints(stats, scoring)
    expect(r.pass).toBe(8)
    expect(r.rush).toBe(6)
    expect(r.rec).toBe(4)
    expect(r.other).toBe(0)
  })

  it('output shape — always exactly 4 keys', () => {
    const r = getCategoryPoints({}, {})
    expect(Object.keys(r).sort()).toEqual(['other', 'pass', 'rec', 'rush'])
  })
})

// season-rescore.md §3.1/§4.1 — the season-total scoring seam's math.
const LEAGUE = {
  rec: 0.5, rec_yd: 0.1, rec_td: 6, rush_yd: 0.1, pass_yd: 0.04, pass_td: 5,
  bonus_rec_te: 0.5, bonus_fd_rb: 0.25, bonus_fd_wr: 0.25, bonus_fd_te: 0.25,
}

describe('seasonEmitsFirstDownBonus', () => {
  it('true when any one row carries a bonus_fd_* key', () => {
    expect(seasonEmitsFirstDownBonus({
      a: { stats: { rec: 3 } },
      b: { stats: { rec: 4, bonus_fd_te: 2 } },
    })).toBe(true)
  })
  it('false when no row carries one (or rows lack stats)', () => {
    expect(seasonEmitsFirstDownBonus({ a: { stats: { rec: 3 } }, b: {}, c: null })).toBe(false)
    expect(seasonEmitsFirstDownBonus(null)).toBe(false)
  })
})

describe('withFirstDownBonus', () => {
  it('WR: bonus_fd_wr = pass_fd + rec_fd + rush_fd (absent keys are zero) — 36 + 1 = 37', () => {
    const out = withFirstDownBonus({ pass_fd: 1, rec_fd: 36 }, 'WR')
    expect(out.bonus_fd_wr).toBe(37)
    expect(withFirstDownBonus({ rec_fd: 2, rush_fd: 3 }, 'WR').bonus_fd_wr).toBe(5)
  })
  it('QB gets bonus_fd_qb', () => {
    expect(withFirstDownBonus({ pass_fd: 20, rush_fd: 4 }, 'QB').bonus_fd_qb).toBe(24)
  })
  it('K / null position → the same reference', () => {
    const stats = { rec_fd: 1 }
    expect(withFirstDownBonus(stats, 'K')).toBe(stats)
    expect(withFirstDownBonus(stats, null)).toBe(stats)
  })
  it('stats already carrying a bonus_fd_* key → the same reference', () => {
    const stats = { rush_fd: 5, bonus_fd_rb: 5 }
    expect(withFirstDownBonus(stats, 'RB')).toBe(stats)
  })
  it('never mutates its input', () => {
    const stats = Object.freeze({ pass_fd: 1, rec_fd: 36 })
    const out = withFirstDownBonus(stats, 'WR')
    expect(out).not.toBe(stats)
    expect(Object.keys(stats)).toEqual(['pass_fd', 'rec_fd'])
  })
})

describe('scoreSeasonStats', () => {
  it('invariance: a pre-2022 row (derived first-down bonus) scores identically to a 2022+ row carrying the emitted bonus', () => {
    const base = { rec: 5, rec_yd: 60, rec_fd: 4, rush_fd: 1, pass_fd: 1 }
    const pre = scoreSeasonStats(base, LEAGUE, { position: 'WR', deriveFirstDowns: true })
    const post = scoreSeasonStats({ ...base, bonus_fd_wr: 6 }, LEAGUE, { position: 'WR', deriveFirstDowns: false })
    // rec 5 × 0.5 = 2.5 · rec_yd 60 × 0.1 = 6 · bonus_fd_wr (4 + 1 + 1) × 0.25 = 1.5
    expect(pre).toBe(10)
    expect(post).toBe(10)
  })

  it('without deriveFirstDowns a pre-2022 row gets no bonus (10 − 1.5 = 8.5)', () => {
    expect(scoreSeasonStats({ rec: 5, rec_yd: 60, rec_fd: 4, rush_fd: 1, pass_fd: 1 }, LEAGUE, { position: 'WR' })).toBe(8.5)
  })

  it('NON_ADDITIVE_KEYS: a rate key in the settings scores 0 and the settings object is not mutated', () => {
    const settings = Object.freeze({ ...LEAGUE, pass_ypa: 1 })
    expect(scoreSeasonStats({ pass_ypa: 40, rec: 2 }, settings)).toBe(1)
    expect(calculateFantasyPoints({ pass_ypa: 40, rec: 2 }, settings)).toBe(41) // weekly stays unguarded
    expect(settings.pass_ypa).toBe(1)
  })

  it('NON_ADDITIVE_KEYS has exactly the 29 keys of the data repo\'s RATE_KEYS', () => {
    expect(NON_ADDITIVE_KEYS.size).toBe(29)
    expect([...NON_ADDITIVE_KEYS].sort()).toEqual([
      'cmp_pct', 'def_kr_lng', 'def_kr_ypa', 'def_pr_lng', 'def_pr_ypa', 'down_3_pct', 'down_4_pct',
      'fgm_lng', 'fgm_pct', 'g2g_pct', 'kr_lng', 'kr_ypa', 'pass_lng', 'pass_rtg', 'pass_td_lng',
      'pass_ypa', 'pass_ypc', 'pos_rank_half_ppr', 'pos_rank_ppr', 'pos_rank_std', 'pr_lng', 'pr_ypa',
      'rec_lng', 'rec_td_lng', 'rec_ypr', 'rush_lng', 'rush_td_lng', 'rush_ypa', 'rz_pct',
    ])
  })
})
