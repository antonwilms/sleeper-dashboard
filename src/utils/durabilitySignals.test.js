/**
 * src/utils/durabilitySignals.test.js
 *
 * Unit tests for wasContributorSeason and classifyInjurySeason.
 * Snap-share values use the canonical formula: off_snp / tm_off_snp
 * (Correction 1 — presence-invariant season snap share, SNAP_CONTRIB_FLOOR = 0.40).
 */

import { describe, it, expect } from 'vitest'
import { wasContributorSeason, classifyInjurySeason } from './durabilitySignals.js'

// ---------------------------------------------------------------------------
// wasContributorSeason tests
// ---------------------------------------------------------------------------

describe('wasContributorSeason', () => {
  // 1. Snap contributor (2021+): 450/900 = 0.50 ≥ 0.40 → true
  it('snap share ≥ SNAP_CONTRIB_FLOOR (0.50 ≥ 0.40) → true', () => {
    const sd = {
      gamesPlayed: 8, gamesStarted: 0,
      stats: { off_snp: 450, tm_off_snp: 900 },
    }
    expect(wasContributorSeason(sd, 'WR')).toBe(true)
  })

  // 2. Snap backup (Levis case): 30/900 = 0.033 < 0.40; gs=0; pass_att/gp≈3.3 < 15 → false
  it('snap backup QB: 30/900 = 0.033 (snap), 0 starts, pass_att/gp<15 → false', () => {
    const sd = {
      gamesPlayed: 6, gamesStarted: 0,
      stats: { off_snp: 30, tm_off_snp: 900, pass_att: 20 },
    }
    expect(wasContributorSeason(sd, 'QB')).toBe(false)
  })

  // 3. Started role (all eras), no snap data: gs=7, gp=7 → startRate 1.0 → true
  it('high start rate (no snap data) → true', () => {
    const sd = { gamesPlayed: 7, gamesStarted: 7, stats: {} }
    expect(wasContributorSeason(sd, 'RB')).toBe(true)
  })

  // 4. Few absolute starts but 100% of active games: gs=2, gp=2 → startRate 1.0 → true
  it('2 starts out of 2 games → startRate 1.0 → true', () => {
    const sd = { gamesPlayed: 2, gamesStarted: 2, stats: {} }
    expect(wasContributorSeason(sd, 'QB')).toBe(true)
  })

  // 5. Volume fallback (pre-2021, no snap, low starts): rush_att/gp = 90/8 = 11.25 ≥ 8 → true
  it('RB volume fallback: rush_att/gp = 11.25 ≥ 8 → true', () => {
    const sd = {
      gamesPlayed: 8, gamesStarted: 0,
      stats: { rush_att: 90 },
    }
    expect(wasContributorSeason(sd, 'RB')).toBe(true)
  })

  // 6. Thin volume backup: rush_att/gp = 20/8 = 2.5 < 8; no snap; no starts → false
  it('thin RB volume: rush_att/gp = 2.5 < 8; no snap; 0 starts → false', () => {
    const sd = {
      gamesPlayed: 8, gamesStarted: 0,
      stats: { rush_att: 20 },
    }
    expect(wasContributorSeason(sd, 'RB')).toBe(false)
  })

  // 7. No positive evidence at all: gp=5, gs=null, empty stats → false
  it('no evidence: gp=5, gs=null, empty stats → false', () => {
    const sd = { gamesPlayed: 5, gamesStarted: null, stats: {} }
    expect(wasContributorSeason(sd, 'WR')).toBe(false)
  })

  // 8. gp=0 / null season → false
  it('null seasonData → false', () => {
    expect(wasContributorSeason(null, 'RB')).toBe(false)
  })
  it('gp=0 → false', () => {
    const sd = { gamesPlayed: 0, gamesStarted: 0, stats: { off_snp: 100, tm_off_snp: 100 } }
    expect(wasContributorSeason(sd, 'RB')).toBe(false)
  })

  // 9. Snap below floor (100/900 = 0.111 < 0.40) but starts rescue same season:
  //    gs=6 ≥ MIN_STARTS(4) → true; no false short-circuit on low snap.
  it('snap below floor (0.111) but gs=6 ≥ MIN_STARTS rescues → true (no false short-circuit)', () => {
    const sd = {
      gamesPlayed: 8, gamesStarted: 6,
      stats: { off_snp: 100, tm_off_snp: 900 },
    }
    expect(wasContributorSeason(sd, 'WR')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// classifyInjurySeason tests
// ---------------------------------------------------------------------------

// Helper to build a minimal starter season entry
function starterSeason(gp, dnp = 0, gs = null, stats = {}) {
  return { gamesPlayed: gp, dnpWeeks: dnp, gamesStarted: gs ?? gp, stats }
}
// Helper for a backup season: gs=0, thin WR stats (rec_tgt/gp << 4)
function backupSeason(gp, dnp = 0) {
  return { gamesPlayed: gp, dnpWeeks: dnp, gamesStarted: 0, stats: { rec_tgt: 5 } }
}

describe('classifyInjurySeason', () => {
  // 10. Base trigger off (gp≥10): gp=12, dnp=5 → false regardless of evidence
  it('base trigger off (gp=12 ≥ 10) → false', () => {
    const cs = { 2024: { P: starterSeason(12, 5) } }
    expect(classifyInjurySeason(cs, 'P', 'RB', 2024)).toBe(false)
  })

  // 11. Base trigger off (dnp<3): gp=6, dnp=1 → false
  it('base trigger off (dnp=1 < 3) → false', () => {
    const cs = { 2024: { P: starterSeason(6, 1) } }
    expect(classifyInjurySeason(cs, 'P', 'RB', 2024)).toBe(false)
  })

  // 12. Injury contributor: gp=7, dnp=5, gs=7 → startRate 1.0 → true
  it('injury contributor: gp=7, dnp=5, gs=7 → true', () => {
    const cs = { 2024: { P: starterSeason(7, 5) } }
    expect(classifyInjurySeason(cs, 'P', 'RB', 2024)).toBe(true)
  })

  // 13. Backup, all seasons backup: target gp=6/dnp=3/gs=0/thin, neighbours likewise → false
  it('career backup: all seasons backup, no rescue → false', () => {
    const cs = {
      2023: { P: backupSeason(8, 4) },
      2024: { P: backupSeason(6, 3) },
      2025: { P: backupSeason(7, 4) },
    }
    expect(classifyInjurySeason(cs, 'P', 'WR', 2024)).toBe(false)
  })

  // 14. Adjacent rescue (prev): target gp=8/dnp=4/gs=1/thin (self ✗), season-1 a full starter → true
  it('adjacent rescue (prev season is starter) → true', () => {
    const cs = {
      2023: { P: starterSeason(14, 0, 14) },   // prior season: full starter
      2024: { P: backupSeason(8, 4) },           // target: backup (self ✗)
      // 2025 absent
    }
    expect(classifyInjurySeason(cs, 'P', 'WR', 2024)).toBe(true)
  })

  // 15. Adjacent rescue (next): season+1 is the contributor → true
  it('adjacent rescue (next season is starter) → true', () => {
    const cs = {
      // 2023 absent
      2024: { P: backupSeason(8, 4) },           // target: backup (self ✗)
      2025: { P: starterSeason(14, 0, 14) },      // next season: full starter
    }
    expect(classifyInjurySeason(cs, 'P', 'WR', 2024)).toBe(true)
  })

  // 16. Missing season / missing player → false
  it('unknown player → false', () => {
    const cs = { 2024: { OTHER: starterSeason(14) } }
    expect(classifyInjurySeason(cs, 'nobody', 'RB', 2024)).toBe(false)
  })
  it('null careerStats → false', () => {
    expect(classifyInjurySeason(null, 'P', 'RB', 2024)).toBe(false)
  })
})
