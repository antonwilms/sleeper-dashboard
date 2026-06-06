/**
 * src/utils/teamRzShare.test.js
 *
 * Unit tests for computeTeamRzShareFactor (D3).
 *
 * Constructs minimal careerStats + historicalTeamTotals by hand, avoiding
 * the full computeNextSeasonProjection pipeline. Each test resets the module's
 * cohort cache by passing a fresh careerStats object.
 */

import { describe, it, expect } from 'vitest'
import { computeTeamRzShareFactor } from './teamRzShare.js'

// ---------------------------------------------------------------------------
// Minimal fixture helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal careerStats for cache-keying (the cohort is built from the
 * reference season = max key). Pass `extra2024Entries` to populate the cohort
 * pool with additional qualifying players.
 */
function makeCareerStats(playerId, lastStats, extra2024Entries = {}) {
  return {
    2020: { [playerId]: { gamesPlayed: 14, stats: {} } },
    2021: { [playerId]: { gamesPlayed: 14, stats: {} } },
    2022: { [playerId]: { gamesPlayed: 14, stats: {} } },
    2023: { [playerId]: { gamesPlayed: 14, stats: {} } },
    2024: {
      [playerId]: { gamesPlayed: 14, stats: { ...lastStats } },
      ...extra2024Entries,
    },
  }
}

function makePlayersMap(playerId, position = 'RB', team = 'KC', extra = {}) {
  return {
    [playerId]: { position, age: 26, years_exp: 5, team },
    ...extra,
  }
}

function makeHistoricalTeamTotals(season, team, rushRz, recRz) {
  return {
    [season]: {
      [team]: { rushAtt: 300, rec: 200, recTgt: 250, rushRz, recRz },
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeTeamRzShareFactor', () => {

  // ── High share → factor > 1 ───────────────────────────────────────────────
  it('RB with high team-RZ-share → factor > 1', () => {
    const id = 'T_HI_RB'
    // rush_rz_att=40, team rushRz=50 → share=0.80; opp=100 ≥ 30 gate; denom=50 ≥ 20 gate.
    // Only player in cohort → pct=0 for percentileRank (nothing below them)
    // Wait: this player IS the cohort — they are at rank=0 (0 players below in pool of 1).
    // shrunkPct = (100*0 + 40*50) / (100+40) = 2000/140 ≈ 14.3
    // factor = clamp(1 + (14.3-50)/50 * 0.05) = clamp(1 - 0.036) = 0.964
    // Hmm — that's LOW. The only-player-in-pool case gives pct=0 because no one is BELOW them.
    // This is correct: with a single player, they are at the 0th percentile (no one below).
    // To get factor > 1 we need OTHER players below the target. Let's add a cohort spread.
    // Add 5 lower-sharing cohort players.
    const cohortEntries = {}
    const cohortPlayers = {}
    ;[0.10, 0.15, 0.20, 0.25, 0.30].forEach((rate, i) => {
      const cid = `T_HI_C_${i}`
      cohortEntries[cid] = { gamesPlayed: 14, stats: { rush_att: 100, rush_rz_att: Math.round(rate * 50) } }
      cohortPlayers[cid] = { position: 'RB', age: 25, years_exp: 3, team: 'KC' }
    })

    const cs  = makeCareerStats(id, { rush_att: 100, rush_rz_att: 40 }, cohortEntries)
    const pm  = makePlayersMap(id, 'RB', 'KC', cohortPlayers)
    const htt = makeHistoricalTeamTotals(2024, 'KC', 50, 80)

    // share = 40/50 = 0.80; cohort pool = [0.10, 0.15, 0.20, 0.25, 0.30, 0.80] (target + 5 lower)
    // Actually pool is built BEFORE scoring, from ALL qualifying players including the target:
    // target: rush_att=100 ≥ 30 ✓, team denom 50 ≥ 20 ✓ → share=40/50=0.80 added
    // C_0: rz=10/50=0.20 (rush_att=100 ≥ 30), C_1: 15/50=0.30, C_2: 20/50=0.40, C_3: 25/50=0.50, C_4: 30/50=0.60
    // sorted pool = [0.20, 0.30, 0.40, 0.50, 0.60, 0.80]
    // percentileRank([...], 0.80) → 5 below → 5/6 ≈ 83
    // shrunkPct = (100*83 + 40*50)/(140) = (8300+2000)/140 = 10300/140 ≈ 73.6
    // index = (73.6-50)/50 = 0.472 → factor = clamp(1 + 0.472*0.05) = clamp(1.0236) = 1.024
    const result = computeTeamRzShareFactor('RB', cs[2024][id].stats, 2024, 'KC', htt, cs, pm)

    expect(result.teamRzShare).toBe(0.8)           // 40/50 = 0.800
    expect(result.teamRzShareFactor).toBeGreaterThan(1)
    expect(result.teamRzShareCategory).toBe('rush')
  })

  // ── Low share → factor < 1 ────────────────────────────────────────────────
  it('RB with low team-RZ-share → factor < 1', () => {
    const id = 'T_LO_RB'
    // rush_rz_att=3, team rushRz=50 → share=0.06; others are higher.
    const cohortEntries = {}
    const cohortPlayers = {}
    ;[0.30, 0.40, 0.50, 0.60, 0.70].forEach((rate, i) => {
      const cid = `T_LO_C_${i}`
      cohortEntries[cid] = { gamesPlayed: 14, stats: { rush_att: 100, rush_rz_att: Math.round(rate * 50) } }
      cohortPlayers[cid] = { position: 'RB', age: 25, years_exp: 3, team: 'KC' }
    })

    const cs  = makeCareerStats(id, { rush_att: 100, rush_rz_att: 3 }, cohortEntries)
    const pm  = makePlayersMap(id, 'RB', 'KC', cohortPlayers)
    const htt = makeHistoricalTeamTotals(2024, 'KC', 50, 80)

    const result = computeTeamRzShareFactor('RB', cs[2024][id].stats, 2024, 'KC', htt, cs, pm)

    expect(result.teamRzShareFactor).toBeLessThan(1)
    expect(result.teamRzShareCategory).toBe('rush')
  })

  // ── QB → neutral 1.0 ──────────────────────────────────────────────────────
  it('QB → neutral 1.0 (gated out — structural: one passer owns ~100% of team RZ)', () => {
    const id = 'T_QB'
    const cs  = makeCareerStats(id, { pass_att: 500, pass_rz_att: 60 })
    const pm  = makePlayersMap(id, 'QB', 'KC')
    const htt = makeHistoricalTeamTotals(2024, 'KC', 50, 80)

    const result = computeTeamRzShareFactor('QB', cs[2024][id].stats, 2024, 'KC', htt, cs, pm)

    expect(result.teamRzShare).toBeNull()
    expect(result.teamRzShareFactor).toBe(1.0)
    expect(result.teamRzShareCategory).toBeNull()
  })

  // ── Missing team in historicalTeamTotals → neutral ───────────────────────
  it('team not in historicalTeamTotals → neutral 1.0', () => {
    const id = 'T_NOTEAM'
    const cs  = makeCareerStats(id, { rush_att: 100, rush_rz_att: 30 })
    const pm  = makePlayersMap(id, 'RB', 'DAL')
    // historicalTeamTotals only has 'KC', not 'DAL'
    const htt = makeHistoricalTeamTotals(2024, 'KC', 50, 80)

    const result = computeTeamRzShareFactor('RB', cs[2024][id].stats, 2024, 'DAL', htt, cs, pm)

    expect(result.teamRzShare).toBeNull()
    expect(result.teamRzShareFactor).toBe(1.0)
  })

  // ── Team denominator < 20 → neutral ──────────────────────────────────────
  it('team rushRz denominator < 20 → neutral 1.0 (guards undercounted teams)', () => {
    const id = 'T_SMALLDENOM'
    const cs  = makeCareerStats(id, { rush_att: 100, rush_rz_att: 10 })
    const pm  = makePlayersMap(id, 'RB', 'KC')
    const htt = makeHistoricalTeamTotals(2024, 'KC', 15, 80)  // rushRz=15 < 20

    const result = computeTeamRzShareFactor('RB', cs[2024][id].stats, 2024, 'KC', htt, cs, pm)

    expect(result.teamRzShare).toBeNull()
    expect(result.teamRzShareFactor).toBe(1.0)
  })

  // ── Player below opportunity gate → neutral ───────────────────────────────
  it('player rush_att < 30 (below opp gate) → neutral 1.0', () => {
    const id = 'T_LOWOPP'
    const cs  = makeCareerStats(id, { rush_att: 20, rush_rz_att: 5 })  // 20 < 30
    const pm  = makePlayersMap(id, 'RB', 'KC')
    const htt = makeHistoricalTeamTotals(2024, 'KC', 50, 80)

    const result = computeTeamRzShareFactor('RB', cs[2024][id].stats, 2024, 'KC', htt, cs, pm)

    expect(result.teamRzShare).toBeNull()
    expect(result.teamRzShareFactor).toBe(1.0)
  })

  // ── Shrinkage pulls low-opp player toward neutral ─────────────────────────
  it('shrinkage: low opp (barely above gate) player pulled toward 1.0 vs high opp player', () => {
    // Two RBs with the SAME raw share (0.60) but different rush_att samples.
    // Low-opp: rush_att=31 (barely above gate=30); high-opp: rush_att=200.
    // Cohort pool has lower-sharing players so both get high pct (>50).
    // Low-opp factor should be CLOSER to 1.0 due to heavier shrinkage.
    const cohortEntries = {}
    const cohortPlayers = {}
    ;[0.10, 0.20, 0.30, 0.40, 0.50].forEach((rate, i) => {
      const cid = `T_SHR_C_${i}`
      cohortEntries[cid] = { gamesPlayed: 14, stats: { rush_att: 100, rush_rz_att: Math.round(rate * 50) } }
      cohortPlayers[cid] = { position: 'RB', age: 25, years_exp: 3, team: 'KC' }
    })

    const htt = makeHistoricalTeamTotals(2024, 'KC', 50, 80)

    // Low-opp player (share = 30/50 = 0.60)
    const idLo = 'T_SHR_LO'
    const csLo = makeCareerStats(idLo, { rush_att: 31, rush_rz_att: 30 }, cohortEntries)
    const pmLo = makePlayersMap(idLo, 'RB', 'KC', cohortPlayers)
    const rLo  = computeTeamRzShareFactor('RB', csLo[2024][idLo].stats, 2024, 'KC', htt, csLo, pmLo)

    // High-opp player (same share = 30/50 = 0.60 but rush_att=200)
    // Note: need a fresh careerStats to force cohort cache rebuild
    const idHi = 'T_SHR_HI'
    const csHi = makeCareerStats(idHi, { rush_att: 200, rush_rz_att: 30 }, {
      ...cohortEntries,
      // override T_SHR_LO entry so the low-opp player doesn't contaminate this pool
    })
    const pmHi = makePlayersMap(idHi, 'RB', 'KC', cohortPlayers)
    const rHi  = computeTeamRzShareFactor('RB', csHi[2024][idHi].stats, 2024, 'KC', htt, csHi, pmHi)

    // Both should have factor > 1 (high share), but low-opp closer to 1.0
    expect(rLo.teamRzShareFactor).toBeGreaterThan(1)
    expect(rHi.teamRzShareFactor).toBeGreaterThan(1)
    expect(
      Math.abs(rLo.teamRzShareFactor - 1),
      'low-opp player should be closer to neutral due to shrinkage'
    ).toBeLessThan(Math.abs(rHi.teamRzShareFactor - 1))
  })

  // ── Cohort built from reference (max) season ─────────────────────────────
  it('cohort is built from the reference (max) season, not the scored season', () => {
    // Two seasons: 2023 and 2024. Target scored in 2024.
    // If cohort uses 2024 (max season), the high-share target is in the pool.
    // Add 3 low-sharing cohort players in 2024 so the target is above 50th pct.
    // Pool = [0.06, 0.10, 0.20, 0.80] → target at rank 3/4 = 75th pct.
    // With opp=100, shrinkK=40: shrunkPct = (100*75 + 40*50)/140 ≈ 67.9 > 50 → factor > 1.
    const id = 'T_REF_SEASON'
    const cs = {
      2023: { [id]: { gamesPlayed: 14, stats: {} } },
      2024: {
        [id]:        { gamesPlayed: 14, stats: { rush_att: 100, rush_rz_att: 40 } },
        T_REF_C1:    { gamesPlayed: 14, stats: { rush_att: 100, rush_rz_att: 3 } },  // 3/50=0.06
        T_REF_C2:    { gamesPlayed: 14, stats: { rush_att: 100, rush_rz_att: 5 } },  // 5/50=0.10
        T_REF_C3:    { gamesPlayed: 14, stats: { rush_att: 100, rush_rz_att: 10 } }, // 10/50=0.20
      },
    }
    const pm = {
      [id]:     { position: 'RB', age: 26, years_exp: 5, team: 'KC' },
      T_REF_C1: { position: 'RB', age: 25, years_exp: 3, team: 'KC' },
      T_REF_C2: { position: 'RB', age: 25, years_exp: 3, team: 'KC' },
      T_REF_C3: { position: 'RB', age: 25, years_exp: 3, team: 'KC' },
    }
    const htt = makeHistoricalTeamTotals(2024, 'KC', 50, 80)

    const result = computeTeamRzShareFactor('RB', cs[2024][id].stats, 2024, 'KC', htt, cs, pm)

    // Target (share 0.80) is above all 3 cohort players → factor > 1
    expect(result.teamRzShareFactor).toBeGreaterThan(1)
    expect(result.teamRzShare).toBe(0.8)  // 40/50
  })

  // ── WR/TE path: rec_rz_tgt / team recRz ─────────────────────────────────
  it('WR uses rec_rz_tgt / recRz denominator, category = rec', () => {
    const id = 'T_WR'
    // Add 3 low-sharing cohort WRs so target (25/60 ≈ 0.417) is above 50th pct.
    // Pool: [0.033, 0.083, 0.133, 0.417] → target at rank 3/4=75th pct.
    const cs = {
      2024: {
        [id]:     { gamesPlayed: 14, stats: { rec_tgt: 100, rec_rz_tgt: 25 } },
        T_WR_C1:  { gamesPlayed: 14, stats: { rec_tgt: 50,  rec_rz_tgt: 2 } },  // 2/60≈0.033
        T_WR_C2:  { gamesPlayed: 14, stats: { rec_tgt: 50,  rec_rz_tgt: 5 } },  // 5/60≈0.083
        T_WR_C3:  { gamesPlayed: 14, stats: { rec_tgt: 50,  rec_rz_tgt: 8 } },  // 8/60≈0.133
      },
    }
    const pm = {
      [id]:    { position: 'WR', age: 26, years_exp: 5, team: 'KC' },
      T_WR_C1: { position: 'WR', age: 25, years_exp: 3, team: 'KC' },
      T_WR_C2: { position: 'WR', age: 25, years_exp: 3, team: 'KC' },
      T_WR_C3: { position: 'WR', age: 25, years_exp: 3, team: 'KC' },
    }
    const htt = makeHistoricalTeamTotals(2024, 'KC', 30, 60)

    const result = computeTeamRzShareFactor('WR', cs[2024][id].stats, 2024, 'KC', htt, cs, pm)

    expect(result.teamRzShareCategory).toBe('rec')
    expect(result.teamRzShare).toBeCloseTo(25 / 60, 3)
    // Target is above all 3 cohort players → factor > 1
    expect(result.teamRzShareFactor).toBeGreaterThan(1)
  })

  // ── Factor is clamped to [0.95, 1.05] ────────────────────────────────────
  it('factor is clamped to [0.95, 1.05] even for extreme percentile', () => {
    const id = 'T_CLAMP'
    // Build a large cohort spread. Target at 100% → after shrinkage still approaches 1.05.
    const cohortEntries = {}
    const cohortPlayers = {}
    for (let i = 0; i < 10; i++) {
      const cid = `T_CL_C_${i}`
      cohortEntries[cid] = { gamesPlayed: 14, stats: { rush_att: 100, rush_rz_att: i * 3 } }
      cohortPlayers[cid] = { position: 'RB', age: 25, years_exp: 3, team: 'KC' }
    }
    const cs  = makeCareerStats(id, { rush_att: 500, rush_rz_att: 49 }, cohortEntries) // 49/50=0.98 → top
    const pm  = makePlayersMap(id, 'RB', 'KC', cohortPlayers)
    const htt = makeHistoricalTeamTotals(2024, 'KC', 50, 80)

    const result = computeTeamRzShareFactor('RB', cs[2024][id].stats, 2024, 'KC', htt, cs, pm)

    expect(result.teamRzShareFactor).toBeLessThanOrEqual(1.05)
    expect(result.teamRzShareFactor).toBeGreaterThanOrEqual(0.95)
  })

  // ── null historicalTeamTotals → neutral ───────────────────────────────────
  it('null historicalTeamTotals → neutral 1.0', () => {
    const id = 'T_NULL_HTT'
    const cs = makeCareerStats(id, { rush_att: 100, rush_rz_att: 30 })
    const pm = makePlayersMap(id, 'RB', 'KC')

    const result = computeTeamRzShareFactor('RB', cs[2024][id].stats, 2024, 'KC', null, cs, pm)

    expect(result.teamRzShare).toBeNull()
    expect(result.teamRzShareFactor).toBe(1.0)
    expect(result.teamRzShareCategory).toBeNull()
  })
})
