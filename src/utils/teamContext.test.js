/**
 * src/utils/teamContext.test.js
 *
 * Tests for computeHistoricalTeamTotals (additive D3 extension) and
 * computeHistoricalShares (byte-identical after extension).
 */

import { describe, it, expect, vi } from 'vitest'
import {
  computeHistoricalTeamTotals, computeHistoricalShares, computeTeamContext,
  computeQBQualityByTeam, applyQBQualityModifier, computeShareTrend,
  DEFAULT_ATTRIBUTION, resolveAttributedTeam, isTeamAggregateId,
} from './teamContext.js'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PLAYERS_MAP = {
  p1: { position: 'RB', team: 'KC' },
  p2: { position: 'WR', team: 'KC' },
  p3: { position: 'RB', team: 'SF' },
}

const CAREER_STATS = {
  2024: {
    p1: {
      gamesPlayed: 14,
      stats: { rush_att: 120, rec: 30, rec_tgt: 40, rush_rz_att: 25, rec_rz_tgt: 8 },
    },
    p2: {
      gamesPlayed: 14,
      stats: { rush_att: 5, rec: 80, rec_tgt: 110, rush_rz_att: 0, rec_rz_tgt: 20 },
    },
    p3: {
      gamesPlayed: 14,
      stats: { rush_att: 90, rec: 20, rec_tgt: 25, rush_rz_att: 15, rec_rz_tgt: 4 },
    },
  },
}

// ---------------------------------------------------------------------------
// R2-REANCHOR fixtures — mover + retired-player, shared by T-1..T-5
// ---------------------------------------------------------------------------
// mover: playersMap CURRENT team 'C'; historical season teams 'A' (2023) then
// 'B' (2024) — the mis-attribution the reanchor fixes.
// retired: present in careerStats with a team, absent from playersMap.
// teammateA/B/C: stable single-team players, so team totals aren't 100%
// owned by the mover (keeps shares non-degenerate under both modes).

const REANCHOR_PLAYERS_MAP = {
  mover:     { position: 'RB', team: 'C' },
  teammateA: { position: 'RB', team: 'A' },
  teammateB: { position: 'RB', team: 'B' },
  teammateC: { position: 'RB', team: 'C' },
  // retired: intentionally absent
}

const REANCHOR_CAREER_STATS = {
  2023: {
    mover:     { gamesPlayed: 14, team: 'A', fantasyPoints: 110, stats: { rush_att: 100, rush_rz_att: 20 } },
    teammateA: { gamesPlayed: 14, team: 'A', fantasyPoints: 90,  stats: { rush_att: 60,  rush_rz_att: 10 } },
    teammateB: { gamesPlayed: 14, team: 'B', fantasyPoints: 95,  stats: { rush_att: 70,  rush_rz_att: 14 } },
    teammateC: { gamesPlayed: 14, team: 'C', fantasyPoints: 80,  stats: { rush_att: 50,  rush_rz_att: 8  } },
    retired:   { gamesPlayed: 14, team: 'D', fantasyPoints: 100, stats: { rush_att: 80,  rush_rz_att: 16 } },
  },
  2024: {
    mover:     { gamesPlayed: 14, team: 'B', fantasyPoints: 120, stats: { rush_att: 90, rush_rz_att: 18 } },
    teammateA: { gamesPlayed: 14, team: 'A', fantasyPoints: 140, stats: { rush_att: 65, rush_rz_att: 12 } },
    teammateB: { gamesPlayed: 14, team: 'B', fantasyPoints: 160, stats: { rush_att: 75, rush_rz_att: 15 } },
    teammateC: { gamesPlayed: 14, team: 'C', fantasyPoints: 100, stats: { rush_att: 55, rush_rz_att: 9  } },
  },
}

// ---------------------------------------------------------------------------
// computeHistoricalTeamTotals — D3 additive extension
// ---------------------------------------------------------------------------

describe('computeHistoricalTeamTotals', () => {
  it('emits rushRz and recRz summed correctly for each team', () => {
    const totals = computeHistoricalTeamTotals(CAREER_STATS, PLAYERS_MAP)

    // KC: p1 + p2
    expect(totals[2024].KC.rushRz).toBe(25 + 0)   // p1 + p2
    expect(totals[2024].KC.recRz).toBe(8 + 20)     // p1 + p2

    // SF: p3 only
    expect(totals[2024].SF.rushRz).toBe(15)
    expect(totals[2024].SF.recRz).toBe(4)
  })

  it('still emits existing fields (rushAtt, rec, recTgt) correctly', () => {
    const totals = computeHistoricalTeamTotals(CAREER_STATS, PLAYERS_MAP)

    expect(totals[2024].KC.rushAtt).toBe(120 + 5)
    expect(totals[2024].KC.rec).toBe(30 + 80)
    expect(totals[2024].KC.recTgt).toBe(40 + 110)

    expect(totals[2024].SF.rushAtt).toBe(90)
    expect(totals[2024].SF.rec).toBe(20)
    expect(totals[2024].SF.recTgt).toBe(25)
  })

  it('defaults rushRz / recRz to 0 when the stat fields are absent', () => {
    const csNoRz = {
      2024: {
        p1: { gamesPlayed: 14, stats: { rush_att: 100, rec: 30, rec_tgt: 40 } },
      },
    }
    const totals = computeHistoricalTeamTotals(csNoRz, PLAYERS_MAP)
    expect(totals[2024].KC.rushRz).toBe(0)
    expect(totals[2024].KC.recRz).toBe(0)
  })

  it('skips players with gamesPlayed < 1', () => {
    const csZeroGP = {
      2024: {
        p1: { gamesPlayed: 0, stats: { rush_att: 100, rush_rz_att: 30, rec_rz_tgt: 10 } },
      },
    }
    const totals = computeHistoricalTeamTotals(csZeroGP, PLAYERS_MAP)
    // p1 skipped → KC entry absent
    expect(totals[2024]?.KC).toBeUndefined()
  })

  // T-1 — parity/golden guard (R2-FLIP): DEFAULT_ATTRIBUTION is now
  // 'per-season-team' — no-options output must be byte-identical to explicit
  // per-season-team mode, and must diverge from explicit current-team mode on
  // the mover/retired fixture. The current-team pins are retained (moved onto
  // an explicit-current pair) because that mode still feeds the held dynasty
  // path (App.jsx historicalTeamTotalsCurrentTeam).
  it('R2-FLIP T-1: no-options is deep-equal to explicit per-season-team mode; current-team remains available for the held dynasty path', () => {
    const noOptions = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP)
    const explicitPerSeason = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, { attribution: 'per-season-team' })
    const explicitCurrent = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, { attribution: 'current-team' })
    expect(noOptions).toEqual(explicitPerSeason)
    expect(noOptions).not.toEqual(explicitCurrent)

    // Per-season pins on noOptions: mover re-keys to his season team, retired
    // player's volume is restored (undercount repair).
    expect(noOptions[2023].A.rushAtt).toBe(160)   // mover (2023 team A) + teammateA
    expect(noOptions[2023].C.rushAtt).toBe(50)    // teammateC only — mover moved to A per-season
    expect(noOptions[2024].B.rushAtt).toBe(165)   // mover (2024 team B) + teammateB
    expect(noOptions[2023].D).toBeDefined()       // retired: restored via per-season team
    expect(noOptions[2023].D.rushAtt).toBe(80)

    // Legacy pins retained on explicitCurrent — the held dynasty path's mode.
    expect(explicitCurrent[2023].C.rushAtt).toBe(150)   // mover (current team C) + teammateC
    expect(explicitCurrent[2023].A.rushAtt).toBe(60)    // teammateA only — mover excluded
    expect(explicitCurrent[2024].C.rushAtt).toBe(145)   // mover + teammateC
    expect(explicitCurrent[2023].D).toBeUndefined()     // retired: absent from playersMap → no team
  })

  // T-3 — per-season totals re-key
  it('R2-REANCHOR T-3: per-season mode re-keys mover to his season team, restores retired-player volume, and falls back on a null v3 team', () => {
    const perSeason = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, { attribution: 'per-season-team' })
    const current = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, { attribution: 'current-team' })

    // Mover's 2023 volume lands in team A (per-season, his season team) vs team C (current, his current team).
    expect(perSeason[2023].A.rushAtt).toBe(100 + 60)   // mover + teammateA
    expect(current[2023].C.rushAtt).toBe(100 + 50)     // mover + teammateC

    // Retired player's volume is restored per-season, still excluded under current mode.
    expect(perSeason[2023].D.rushAtt).toBe(80)
    expect(current[2023].D).toBeUndefined()

    // A team: null v3 record with a playersMap team falls back rather than dropping.
    const playersMapWithFallback = { ...REANCHOR_PLAYERS_MAP, nullTeamPlayer: { position: 'RB', team: 'E' } }
    const careerStatsWithFallback = {
      2023: {
        ...REANCHOR_CAREER_STATS[2023],
        nullTeamPlayer: { gamesPlayed: 14, team: null, stats: { rush_att: 40, rush_rz_att: 6 } },
      },
    }
    const perSeasonFallback = computeHistoricalTeamTotals(careerStatsWithFallback, playersMapWithFallback, { attribution: 'per-season-team' })
    expect(perSeasonFallback[2023].E.rushAtt).toBe(40)
  })
})

// ---------------------------------------------------------------------------
// computeHistoricalShares — byte-identical after D3 additive extension
// ---------------------------------------------------------------------------

describe('computeHistoricalShares', () => {
  it('output is byte-identical to the pre-D3 result (new rushRz/recRz fields are ignored)', () => {
    // Build totals with the new fields and compute shares.
    const totals = computeHistoricalTeamTotals(CAREER_STATS, PLAYERS_MAP)
    const shares = computeHistoricalShares(CAREER_STATS, PLAYERS_MAP, totals)

    // p1 (RB/KC): share = rush_att(120) / KC.rushAtt(125) ≈ 0.960
    const p1Shares = shares.p1
    expect(p1Shares).not.toBeUndefined()
    const p1S24 = p1Shares.find(s => s.season === 2024)
    expect(p1S24).not.toBeUndefined()
    expect(p1S24.share).toBeCloseTo(120 / 125, 3)

    // p2 (WR/KC): share = rec_tgt(110) / KC.recTgt(150) ≈ 0.733
    const p2Shares = shares.p2
    expect(p2Shares).not.toBeUndefined()
    const p2S24 = p2Shares.find(s => s.season === 2024)
    expect(p2S24).not.toBeUndefined()
    expect(p2S24.share).toBeCloseTo(110 / 150, 3)

    // Critically: rushRz / recRz do NOT appear in the share output
    expect(p1S24).not.toHaveProperty('rushRz')
    expect(p2S24).not.toHaveProperty('recRz')
  })

  it('computeHistoricalShares produces the same result regardless of whether rushRz/recRz are present', () => {
    // Totals WITH new fields (from the updated function)
    const totalsNew = computeHistoricalTeamTotals(CAREER_STATS, PLAYERS_MAP)

    // Manually strip rushRz/recRz to simulate pre-D3 totals
    const totalsOld = JSON.parse(JSON.stringify(totalsNew))
    for (const season of Object.values(totalsOld)) {
      for (const team of Object.values(season)) {
        delete team.rushRz
        delete team.recRz
      }
    }

    const sharesNew = computeHistoricalShares(CAREER_STATS, PLAYERS_MAP, totalsNew)
    const sharesOld = computeHistoricalShares(CAREER_STATS, PLAYERS_MAP, totalsOld)

    // Both should produce identical JSON output
    expect(JSON.stringify(sharesNew)).toBe(JSON.stringify(sharesOld))
  })

  // T-1 — parity/golden guard (R2-FLIP)
  it('R2-FLIP T-1: no-options is deep-equal to explicit per-season-team mode; current-team remains available for the held dynasty path', () => {
    const totalsNoOptions = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP)
    const noOptions = computeHistoricalShares(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, totalsNoOptions)
    const totalsPerSeason = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, { attribution: 'per-season-team' })
    const explicitPerSeason = computeHistoricalShares(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, totalsPerSeason, { attribution: 'per-season-team' })
    expect(noOptions).toEqual(explicitPerSeason)

    // Second, explicit current-team totals+shares pair — the held dynasty path's mode.
    const totalsCurrent = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, { attribution: 'current-team' })
    const explicitCurrent = computeHistoricalShares(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, totalsCurrent, { attribution: 'current-team' })
    expect(noOptions).not.toEqual(explicitCurrent)

    // retired is absent from playersMap → no share row at all in EITHER mode (position gate).
    expect(noOptions.retired).toBeUndefined()
    expect(explicitCurrent.retired).toBeUndefined()

    // Per-season pins on noOptions.
    const moverSharesPerSeason = noOptions.mover
    expect(moverSharesPerSeason.find(s => s.season === 2023).share).toBeCloseTo(100 / 160, 3)
    expect(moverSharesPerSeason.find(s => s.season === 2024).share).toBeCloseTo(90 / 165, 3)

    // Legacy pins on the explicit-current pair.
    const moverSharesCurrent = explicitCurrent.mover
    expect(moverSharesCurrent.find(s => s.season === 2023).share).toBeCloseTo(100 / 150, 3)
    expect(moverSharesCurrent.find(s => s.season === 2024).share).toBeCloseTo(90 / 145, 3)
  })

  // T-4 — per-season shares
  it('R2-REANCHOR T-4: per-season mode computes mover shares vs his season-team totals; retired contributes to totals but gets no share row', () => {
    const totalsPerSeason = computeHistoricalTeamTotals(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, { attribution: 'per-season-team' })
    const sharesPerSeason = computeHistoricalShares(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, totalsPerSeason, { attribution: 'per-season-team' })

    const moverShares = sharesPerSeason.mover
    const s2023 = moverShares.find(s => s.season === 2023)
    const s2024 = moverShares.find(s => s.season === 2024)
    expect(s2023.share).toBeCloseTo(100 / 160, 3)   // vs team-A totals
    expect(s2024.share).toBeCloseTo(90 / 165, 3)    // vs team-B totals

    // Ordering/rounding unchanged: oldest→newest, 3dp.
    expect(moverShares.map(s => s.season)).toEqual([2023, 2024])
    expect(s2023.share).toBe(Math.round(s2023.share * 1000) / 1000)

    // retired: absent from playersMap → no share row, even though its volume
    // contributed to the per-season team-D totals (the denominator repair, §6).
    expect(sharesPerSeason.retired).toBeUndefined()
    expect(totalsPerSeason[2023].D.rushAtt).toBe(80)
  })
})

// ---------------------------------------------------------------------------
// computeTeamContext — R2-REANCHOR T-1 parity/golden guard
// ---------------------------------------------------------------------------

describe('computeTeamContext', () => {
  it('R2-FLIP T-1: no-options is deep-equal to explicit per-season-team mode; current-team remains available for the held dynasty path', () => {
    const noOptions = computeTeamContext(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, 2024)
    const explicitPerSeason = computeTeamContext(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, 2024, { attribution: 'per-season-team' })
    const explicitCurrent = computeTeamContext(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, 2024, { attribution: 'current-team' })
    expect(noOptions).toEqual(explicitPerSeason)
    expect(noOptions).not.toEqual(explicitCurrent)

    // Per-season pins on noOptions: mover's currentSeason share + teamOffenseRank
    // are computed against team B (his season team).
    expect(noOptions.playerShares.mover.carryShare).toBeCloseTo(90 / 165, 3)
    expect(noOptions.teamOffense.B).toBeDefined()
    expect(noOptions.playerShares.mover.teamOffenseRank).toBe(noOptions.teamOffense.B.rank)

    // Legacy pins on explicitCurrent — the held dynasty path's mode.
    expect(explicitCurrent.playerShares.mover.carryShare).toBeCloseTo(90 / 145, 3)
    expect(explicitCurrent.teamOffense.C).toBeDefined()
    expect(explicitCurrent.playerShares.mover.teamOffenseRank).toBe(explicitCurrent.teamOffense.C.rank)
  })

  // T-5 — per-season attribution
  it('R2-REANCHOR T-5: per-season mode attributes the offseason mover to his season team; team ranks shift with his re-keyed volume', () => {
    const perSeason = computeTeamContext(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, 2024, { attribution: 'per-season-team' })
    const current = computeTeamContext(REANCHOR_CAREER_STATS, REANCHOR_PLAYERS_MAP, 2024, { attribution: 'current-team' })

    // mover's share is computed against team B (per-season, his season team), not team C (current, his current team).
    expect(perSeason.playerShares.mover.carryShare).toBeCloseTo(90 / 165, 3)
    expect(current.playerShares.mover.carryShare).toBeCloseTo(90 / 145, 3)

    // Team B's rank/totalPts improve once mover's volume re-keys onto it.
    expect(current.teamOffense.B.totalPts).toBe(160)
    expect(current.teamOffense.B.rank).toBe(2)
    expect(perSeason.teamOffense.B.totalPts).toBe(280)
    expect(perSeason.teamOffense.B.rank).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// resolveAttributedTeam — unit tests (R2-REANCHOR T-2)
// ---------------------------------------------------------------------------

describe('resolveAttributedTeam', () => {
  it('R2-REANCHOR T-2: per-season mode returns seasonEntry.team, falls back to player.team, then null; current mode ignores seasonEntry.team entirely', () => {
    const seasonEntry = { team: 'A' }
    const player = { team: 'C' }

    expect(resolveAttributedTeam(seasonEntry, player, 'per-season-team')).toBe('A')
    expect(resolveAttributedTeam({ team: null }, player, 'per-season-team')).toBe('C')
    expect(resolveAttributedTeam({}, player, 'per-season-team')).toBe('C')
    expect(resolveAttributedTeam({ team: null }, null, 'per-season-team')).toBeNull()
    expect(resolveAttributedTeam(null, null, 'per-season-team')).toBeNull()

    expect(resolveAttributedTeam(seasonEntry, player, 'current-team')).toBe('C')
    expect(resolveAttributedTeam(null, player, 'current-team')).toBe('C')
    expect(resolveAttributedTeam(seasonEntry, null, 'current-team')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Fallback path — no `team` field anywhere (R2-REANCHOR T-9)
// ---------------------------------------------------------------------------
// Live-API-aggregated shape: careerStats entries carry no `team` field at all
// (see src/api/sleeperStats.js — `team` never lands on aggregated records).
// Per-season mode must fall back to the current team and reproduce legacy
// output exactly.

describe('fallback path (no team field anywhere)', () => {
  it('R2-REANCHOR T-9: per-season mode with no season team anywhere reproduces legacy (current-team) output exactly', () => {
    const noTeamCareerStats = {
      2024: {
        p1: { gamesPlayed: 14, stats: { rush_att: 120, rec: 30, rec_tgt: 40, rush_rz_att: 25, rec_rz_tgt: 8 } },
        p2: { gamesPlayed: 14, stats: { rush_att: 5,   rec: 80, rec_tgt: 110, rush_rz_att: 0,  rec_rz_tgt: 20 } },
        p3: { gamesPlayed: 14, stats: { rush_att: 90,  rec: 20, rec_tgt: 25, rush_rz_att: 15, rec_rz_tgt: 4 } },
      },
    }

    const totalsPerSeason = computeHistoricalTeamTotals(noTeamCareerStats, PLAYERS_MAP, { attribution: 'per-season-team' })
    const totalsCurrent   = computeHistoricalTeamTotals(noTeamCareerStats, PLAYERS_MAP, { attribution: 'current-team' })
    expect(totalsPerSeason).toEqual(totalsCurrent)

    const sharesPerSeason = computeHistoricalShares(noTeamCareerStats, PLAYERS_MAP, totalsPerSeason, { attribution: 'per-season-team' })
    const sharesCurrent   = computeHistoricalShares(noTeamCareerStats, PLAYERS_MAP, totalsCurrent, { attribution: 'current-team' })
    expect(sharesPerSeason).toEqual(sharesCurrent)

    const contextPerSeason = computeTeamContext(noTeamCareerStats, PLAYERS_MAP, 2024, { attribution: 'per-season-team' })
    const contextCurrent   = computeTeamContext(noTeamCareerStats, PLAYERS_MAP, 2024, { attribution: 'current-team' })
    expect(contextPerSeason).toEqual(contextCurrent)
  })
})

// ---------------------------------------------------------------------------
// DEFAULT_ATTRIBUTION — R2-REANCHOR execution gate (D-1)
// ---------------------------------------------------------------------------

describe('DEFAULT_ATTRIBUTION', () => {
  it('R2-FLIP: per-season-team is the default — activated 2026-07-11 (gate FLIP-CLEARS, data repo 2026-07-09-r2flip-verdict)', () => {
    expect(DEFAULT_ATTRIBUTION).toBe('per-season-team')
  })
})

// ---------------------------------------------------------------------------
// computeQBQualityByTeam — F1-A coverage + projection-input pin
// ---------------------------------------------------------------------------

describe('computeQBQualityByTeam', () => {
  // #1 — legacy default excludes un-rostered QBs (pins the projection-path input)
  it('legacy default excludes un-rostered QBs', () => {
    const rows = [
      { player_id: 'qb1', position: 'QB', nfl_team: 'BUF', ownerTeamName: null,
        dynastyScore: { score: 80 }, currentSeasonPPG: 20 },
    ]
    const result = computeQBQualityByTeam(rows, null)
    expect(result).not.toHaveProperty('BUF')
  })

  // #2 — expanded includes un-rostered QBs (F1-A)
  it('expanded mode includes un-rostered QBs', () => {
    const rows = [
      { player_id: 'qb1', position: 'QB', nfl_team: 'BUF', ownerTeamName: null,
        dynastyScore: { score: 80 }, currentSeasonPPG: 20 },
    ]
    const result = computeQBQualityByTeam(rows, null, true)
    expect(result.BUF).toBe(80)
  })

  // #3 — flag is a no-op for fully-rostered non-FA fixtures
  it('flag is a no-op for fully-rostered non-FA fixtures', () => {
    const rows = [
      { player_id: 'q1', position: 'QB', nfl_team: 'KC',  ownerTeamName: 'TeamA', dynastyScore: { score: 70 }, currentSeasonPPG: 22 },
      { player_id: 'q2', position: 'QB', nfl_team: 'SF',  ownerTeamName: 'TeamB', dynastyScore: { score: 60 }, currentSeasonPPG: 18 },
      { player_id: 'q3', position: 'QB', nfl_team: 'DAL', ownerTeamName: 'TeamC', dynastyScore: { score: 55 }, currentSeasonPPG: 15 },
    ]
    const legacy   = computeQBQualityByTeam(rows, null)
    const expanded = computeQBQualityByTeam(rows, null, true)
    expect(JSON.stringify(expanded)).toBe(JSON.stringify(legacy))
  })

  // #4 — depth-chart QB1 preference survives the enlarged pool
  it('depth-chart QB1 preference survives the enlarged pool (F1-A regression catcher)', () => {
    const rows = [
      // un-rostered starter (depthOrder 1 via depthMap), quality 75, PPG 14
      { player_id: 'qb_start', position: 'QB', nfl_team: 'KC', ownerTeamName: null,
        dynastyScore: { score: 75 }, currentSeasonPPG: 14 },
      // rostered backup (depthOrder 2), quality 40, PPG 18 — higher PPG but deeper
      { player_id: 'qb_back',  position: 'QB', nfl_team: 'KC', ownerTeamName: 'TeamA',
        dynastyScore: { score: 40 }, currentSeasonPPG: 18 },
    ]
    const depthMap = { qb_start: { depthOrder: 1 }, qb_back: { depthOrder: 2 } }

    const expanded = computeQBQualityByTeam(rows, depthMap, true)
    expect(expanded.KC).toBe(75)  // starter wins despite lower PPG

    const legacy   = computeQBQualityByTeam(rows, depthMap)
    // Legacy excludes qb_start (un-rostered) → only backup is a candidate
    expect(legacy.KC).toBe(40)
  })

  // #5 — PPG fallback without depthMap
  it('PPG fallback picks highest currentSeasonPPG when no depthMap', () => {
    const rows = [
      { player_id: 'q1', position: 'QB', nfl_team: 'MIA', ownerTeamName: 'T1', dynastyScore: { score: 55 }, currentSeasonPPG: 12 },
      { player_id: 'q2', position: 'QB', nfl_team: 'MIA', ownerTeamName: 'T2', dynastyScore: { score: 80 }, currentSeasonPPG: 25 },
    ]
    const result = computeQBQualityByTeam(rows, null)
    expect(result.MIA).toBe(80)  // q2 wins by PPG
  })

  // #6 — quality fallback chain: dynastyScore → KTC/100 → 50
  it('quality fallback chain: KTC/100 then 50', () => {
    const rows = [
      { player_id: 'q1', position: 'QB', nfl_team: 'NE', ownerTeamName: 'T1', ktcValue: 6000,  currentSeasonPPG: 10 },
      { player_id: 'q2', position: 'QB', nfl_team: 'GB', ownerTeamName: 'T2', ktcValue: 12000, currentSeasonPPG: 10 },
      { player_id: 'q3', position: 'QB', nfl_team: 'TEN', ownerTeamName: 'T3',                 currentSeasonPPG: 10 },
    ]
    const result = computeQBQualityByTeam(rows, null)
    expect(result.NE).toBe(60)    // 6000 / 100
    expect(result.GB).toBe(100)   // min(12000/100, 100)
    expect(result.TEN).toBe(50)   // neutral fallback
  })

  // #7 — output contract sweep (F4-A CI tripwire at source)
  it('every entry is finite and in [0, 100]; absent teams produce no key', () => {
    const rows = [
      // rostered with dynasty score
      { player_id: 'q1', position: 'QB', nfl_team: 'KC',  ownerTeamName: 'T1', dynastyScore: { score: 72 }, currentSeasonPPG: 22 },
      // un-rostered (included in expanded mode)
      { player_id: 'q2', position: 'QB', nfl_team: 'BUF', ownerTeamName: null, dynastyScore: { score: 68 }, currentSeasonPPG: 19 },
      // KTC-only (no dynastyScore)
      { player_id: 'q3', position: 'QB', nfl_team: 'SF',  ownerTeamName: 'T3', ktcValue: 5500, currentSeasonPPG: 14 },
      // bare QB (neither score nor KTC)
      { player_id: 'q4', position: 'QB', nfl_team: 'LAR', ownerTeamName: 'T4', currentSeasonPPG: 11 },
      // non-QB row — must be excluded
      { player_id: 'w1', position: 'WR', nfl_team: 'PHI', ownerTeamName: 'T5', dynastyScore: { score: 60 }, currentSeasonPPG: 18 },
    ]
    const result = computeQBQualityByTeam(rows, null, true)

    // PHI has no QB row → absent
    expect(result).not.toHaveProperty('PHI')

    for (const [, v] of Object.entries(result)) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })

  // #8 — FA handling pins both modes
  it('FA handling: expanded skips FA QBs; legacy keeps rostered FA QB', () => {
    const rows = [
      // un-rostered FA QB — expanded should skip
      { player_id: 'fa1', position: 'QB', nfl_team: 'FA', ownerTeamName: null, dynastyScore: { score: 60 }, currentSeasonPPG: 15 },
      // rostered FA QB — legacy should include (preserves projection-input bytes)
      { player_id: 'fa2', position: 'QB', nfl_team: 'FA', ownerTeamName: 'TeamX', dynastyScore: { score: 45 }, currentSeasonPPG: 12 },
    ]

    const expanded = computeQBQualityByTeam(rows, null, true)
    expect(expanded).not.toHaveProperty('FA')

    const legacy = computeQBQualityByTeam(rows, null)
    expect(legacy).toHaveProperty('FA')
    expect(legacy.FA).toBe(45)
  })

  // #9 — empty input
  it('empty input returns empty object', () => {
    expect(computeQBQualityByTeam([], null, true)).toEqual({})
  })
})

// ---------------------------------------------------------------------------
// applyQBQualityModifier — OQ modifier math (F4-A)
// ---------------------------------------------------------------------------

// Standard WR row factory used across modifier tests
function makeWRRow(overrides = {}) {
  return {
    position: 'WR',
    nfl_team: 'KC',
    dynastyScore: {
      score: 70,
      components: {
        opportunityQuality: { value: 60, efficiencyPercentile: 55, volumePercentile: 65 },
      },
      signals: {},
    },
    ...overrides,
  }
}

describe('applyQBQualityModifier', () => {
  // #10 — WR, qbScore 100 → modifier 1.15
  it('WR with qbScore 100 applies 1.15 modifier correctly', () => {
    const row = makeWRRow()
    const result = applyQBQualityModifier(row, { KC: 100 })

    expect(result.dynastyScore.components.opportunityQuality.value).toBe(69)  // round(60×1.15)
    expect(result.dynastyScore.score).toBe(71)                                // round(70+(69−60)×0.15)
    expect(result.dynastyScore.signals.qbQualityScore).toBe(100)
    expect(result.dynastyScore.signals.qbModifierApplied).toBe(15)
    // Other OQ subfields preserved by spread
    expect(result.dynastyScore.components.opportunityQuality.efficiencyPercentile).toBe(55)
    expect(result.dynastyScore.components.opportunityQuality.volumePercentile).toBe(65)
  })

  // #11 — WR, qbScore 0 → modifier 0.85
  it('WR with qbScore 0 applies 0.85 modifier correctly', () => {
    const row = makeWRRow()
    const result = applyQBQualityModifier(row, { KC: 0 })

    expect(result.dynastyScore.components.opportunityQuality.value).toBe(51)  // round(60×0.85)
    expect(result.dynastyScore.signals.qbModifierApplied).toBe(-15)
    expect(result.dynastyScore.score).toBe(69)  // round(70+(51−60)×0.15) = round(68.65) = 69
  })

  // #12 — WR, qbScore 50 (neutral) → modifier 1.0; new annotated object returned
  it('WR with qbScore 50 returns new annotated object with unchanged values', () => {
    const row = makeWRRow()
    const result = applyQBQualityModifier(row, { KC: 50 })

    expect(result).not.toBe(row)  // new object, not same reference
    expect(result.dynastyScore.components.opportunityQuality.value).toBe(60)  // unchanged
    expect(result.dynastyScore.score).toBe(70)  // unchanged
    expect(result.dynastyScore.signals.qbModifierApplied).toBe(0)
  })

  // #13 — workhorse RB and non-workhorse RB
  it('workhorse RB applies inverse modifier; non-workhorse returns same reference', () => {
    function makeRBRow(carryShare) {
      return {
        position: 'RB',
        nfl_team: 'KC',
        dynastyScore: {
          score: 70,
          components: {
            opportunityQuality: { value: 60 },
          },
          signals: { carryShare },
        },
      }
    }

    const workhorse = makeRBRow(0.5)
    const r100 = applyQBQualityModifier(workhorse, { KC: 100 })
    expect(r100.dynastyScore.components.opportunityQuality.value).toBe(57)  // round(60×0.95)

    const workhorse2 = makeRBRow(0.5)
    const r0 = applyQBQualityModifier(workhorse2, { KC: 0 })
    expect(r0.dynastyScore.components.opportunityQuality.value).toBe(66)   // round(60×1.10)

    // Non-workhorse: same reference
    const light = makeRBRow(0.2)
    expect(applyQBQualityModifier(light, { KC: 80 })).toBe(light)

    const nullShare = makeRBRow(null)
    expect(applyQBQualityModifier(nullShare, { KC: 80 })).toBe(nullShare)
  })

  // #14 — no-op reference identity for QB, null components, absent team
  it('returns same reference for QB, null components, and team absent from map', () => {
    const qbRow = { position: 'QB', nfl_team: 'KC',
      dynastyScore: { score: 70, components: { opportunityQuality: { value: 60 } }, signals: {} } }
    expect(applyQBQualityModifier(qbRow, { KC: 80 })).toBe(qbRow)

    const nullComponents = makeWRRow()
    nullComponents.dynastyScore = { score: 70, components: null, signals: {} }
    expect(applyQBQualityModifier(nullComponents, { KC: 80 })).toBe(nullComponents)

    const absentTeam = makeWRRow()
    expect(applyQBQualityModifier(absentTeam, {})).toBe(absentTeam)
  })

  // #15 — finiteness guard and value-range sweep
  it('NaN qbScore returns same reference; finite qbScores produce in-range outputs', () => {
    const row = makeWRRow()
    expect(applyQBQualityModifier(row, { KC: NaN })).toBe(row)

    for (const qbScore of [0, 25, 50, 75, 100]) {
      const r = applyQBQualityModifier(makeWRRow(), { KC: qbScore })
      expect(Number.isFinite(r.dynastyScore.components.opportunityQuality.value)).toBe(true)
      expect(r.dynastyScore.components.opportunityQuality.value).toBeGreaterThanOrEqual(0)
      expect(r.dynastyScore.components.opportunityQuality.value).toBeLessThanOrEqual(100)
      expect(r.dynastyScore.signals.qbModifierApplied).toBeGreaterThanOrEqual(-15)
      expect(r.dynastyScore.signals.qbModifierApplied).toBeLessThanOrEqual(15)
    }
  })

  // #16 — clamp pins
  it('clamp pins: OQ 95 with qbScore 100 clamps to 100; OQ 0 stays 0', () => {
    const highOQ = makeWRRow()
    highOQ.dynastyScore.components.opportunityQuality.value = 95
    const r1 = applyQBQualityModifier(highOQ, { KC: 100 })
    expect(r1.dynastyScore.components.opportunityQuality.value).toBe(100)  // min(100, 95×1.15=109.25)

    const zeroOQ = makeWRRow()
    zeroOQ.dynastyScore.components.opportunityQuality.value = 0
    const r2 = applyQBQualityModifier(zeroOQ, { KC: 100 })
    expect(r2.dynastyScore.components.opportunityQuality.value).toBe(0)

    const r3 = applyQBQualityModifier({ ...makeWRRow(), dynastyScore: { ...makeWRRow().dynastyScore, components: { opportunityQuality: { value: 0 } } } }, { KC: 0 })
    expect(r3.dynastyScore.components.opportunityQuality.value).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Entity filter (TEAM_ aggregate pseudo-rows) — share-denominator fix
// ---------------------------------------------------------------------------
// Sleeper's store-served season-totals carry one TEAM_<abbr> whole-team
// aggregate pseudo-row per team; summed alongside players it exactly doubles
// team denominators. isTeamAggregateId excludes them by id prefix — NOT by
// playersMap membership, which would silently regress the R2 per-season
// denominator repair (retired players absent from playersMap must still
// contribute to historical totals; see T-1/T-3 above).

describe('entity filter (TEAM_ aggregate pseudo-rows)', () => {
  const ENTITY_FILTER_CAREER_STATS = {
    2024: {
      p1:      { gamesPlayed: 14, team: 'X', stats: { rush_att: 120, rec: 10, rec_tgt: 15, rush_rz_att: 20, rec_rz_tgt: 3 } },
      p2:      { gamesPlayed: 14, team: 'X', stats: { rush_att: 80, rec: 5, rec_tgt: 8, rush_rz_att: 10, rec_rz_tgt: 1 } },
      retired: { gamesPlayed: 14, team: 'X', stats: { rush_att: 50 } },   // absent from playersMap
      TEAM_X:  { gamesPlayed: 17, team: 'X', stats: { rush_att: 200, rec: 50, rec_tgt: 60, rush_rz_att: 40, rec_rz_tgt: 12 } },
    },
  }
  const ENTITY_FILTER_PLAYERS_MAP = {
    p1: { position: 'RB', team: 'X' },
    p2: { position: 'RB', team: 'X' },
  }

  it('T-N1: TEAM_X is excluded from per-season totals — players + retired only', () => {
    const totals = computeHistoricalTeamTotals(ENTITY_FILTER_CAREER_STATS, ENTITY_FILTER_PLAYERS_MAP)
    // rushAtt = 120 (p1) + 80 (p2) + 50 (retired) = 250; without the filter it
    // would be 450 (250 + TEAM_X's 200).
    expect(totals[2024].X).toEqual({ rushAtt: 250, rec: 15, recTgt: 23, rushRz: 30, recRz: 4 })
  })

  it('T-N2: retired (non-member) still contributes to per-season totals; TEAM_X never does — the anti-membership-gate pin', () => {
    const withRetired = computeHistoricalTeamTotals(ENTITY_FILTER_CAREER_STATS, ENTITY_FILTER_PLAYERS_MAP, { attribution: 'per-season-team' })
    expect(withRetired[2024].X.rushAtt).toBe(250)   // 120 + 80 + 50; TEAM_X's 200 excluded regardless

    const csWithoutRetired = { 2024: { ...ENTITY_FILTER_CAREER_STATS[2024] } }
    delete csWithoutRetired[2024].retired
    const withoutRetired = computeHistoricalTeamTotals(csWithoutRetired, ENTITY_FILTER_PLAYERS_MAP, { attribution: 'per-season-team' })
    expect(withoutRetired[2024].X.rushAtt).toBe(200)   // 120 + 80 — confirms retired's 50 was the delta

    // This is the assertion a future "helpful" membership gate would break first:
    // a membership gate would exclude `retired` (not in playersMap) exactly like
    // it excludes TEAM_X, collapsing withRetired to 200 and losing the R2 repair.
  })

  it('T-N3: current-team no-op proof — byte-identical with and without the TEAM_X row', () => {
    const csNoTeamRow = {
      2024: {
        p1: ENTITY_FILTER_CAREER_STATS[2024].p1,
        p2: ENTITY_FILTER_CAREER_STATS[2024].p2,
        retired: ENTITY_FILTER_CAREER_STATS[2024].retired,
      },
    }
    const withRow = computeHistoricalTeamTotals(ENTITY_FILTER_CAREER_STATS, ENTITY_FILTER_PLAYERS_MAP, { attribution: 'current-team' })
    const withoutRow = computeHistoricalTeamTotals(csNoTeamRow, ENTITY_FILTER_PLAYERS_MAP, { attribution: 'current-team' })
    expect(withRow).toEqual(withoutRow)
    // Both drop TEAM_X and retired (neither in playersMap) — pre-fix via the
    // playersMap lookup, post-fix via the prefix filter — leaving only p1+p2.
    expect(withRow[2024].X).toEqual({ rushAtt: 200, rec: 15, recTgt: 23, rushRz: 30, recRz: 4 })
  })

  it('T-N4: no phantom TEAM_X share row; p1 share is 120/250 = 0.48', () => {
    const totals = computeHistoricalTeamTotals(ENTITY_FILTER_CAREER_STATS, ENTITY_FILTER_PLAYERS_MAP, { attribution: 'per-season-team' })
    const shares = computeHistoricalShares(ENTITY_FILTER_CAREER_STATS, ENTITY_FILTER_PLAYERS_MAP, totals, { attribution: 'per-season-team' })
    expect(shares.TEAM_X).toBeUndefined()
    expect(shares.p1[0].share).toBe(0.48)
  })

  it('T-N5: isTeamAggregateId', () => {
    expect(isTeamAggregateId('TEAM_IND')).toBe(true)
    expect(isTeamAggregateId('6813')).toBe(false)
    expect(isTeamAggregateId('IND')).toBe(false)
    expect(isTeamAggregateId('1339z')).toBe(false)
    expect(isTeamAggregateId('')).toBe(false)
    expect(isTeamAggregateId(null)).toBe(false)
    expect(isTeamAggregateId(undefined)).toBe(false)
    expect(isTeamAggregateId(123)).toBe(false)
  })

  it('T-N6: share > 1 fires the console.warn tripwire on a handcrafted undersized totals argument', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const cs = { 2024: { p1: { gamesPlayed: 8, team: 'X', stats: { rush_att: 50 } } } }
    const playersMap = { p1: { position: 'RB', team: 'X' } }
    const undersizedTotals = { 2024: { X: { rushAtt: 10, rec: 0, recTgt: 0, rushRz: 0, recRz: 0 } } }

    const shares = computeHistoricalShares(cs, playersMap, undersizedTotals)

    expect(shares.p1[0].share).toBeGreaterThan(1)
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('share > 1'))
    warnSpy.mockRestore()
  })

  // T-N7 — Jonathan Taylor (6813, IND every season) real-value pins, 2020-2025.
  // Values from the share-denominator-fix plan §4 (data HEAD 52eea562).
  const TAYLOR_SEASONS = [
    { season: 2020, gp: 15, taylor: 232, rest: 227, teamRow: 459 },
    { season: 2021, gp: 17, taylor: 332, rest: 167, teamRow: 499 },
    { season: 2022, gp: 11, taylor: 192, rest: 246, teamRow: 439 },
    { season: 2023, gp: 10, taylor: 169, rest: 311, teamRow: 479 },
    { season: 2024, gp: 14, taylor: 303, rest: 193, teamRow: 496 },
    { season: 2025, gp: 17, taylor: 323, rest: 119, teamRow: 442 },
  ]
  const TAYLOR_CAREER_STATS = {}
  for (const { season, gp, taylor, rest, teamRow } of TAYLOR_SEASONS) {
    TAYLOR_CAREER_STATS[season] = {
      '6813': { gamesPlayed: gp, team: 'IND', stats: { rush_att: taylor } },
      rest:   { gamesPlayed: 17, team: 'IND', stats: { rush_att: rest } },
      TEAM_IND: { gamesPlayed: 17, team: 'IND', stats: { rush_att: teamRow } },   // intentionally absent from playersMap, like /players/nfl
    }
  }
  const TAYLOR_PLAYERS_MAP = {
    '6813': { position: 'RB', team: 'IND' },
    rest:   { position: 'RB', team: 'IND' },
  }

  it('T-N7: Jonathan Taylor real-value pins (2020-2025)', () => {
    const totals = computeHistoricalTeamTotals(TAYLOR_CAREER_STATS, TAYLOR_PLAYERS_MAP)
    const expectedTotals = [459, 499, 438, 480, 496, 442]
    TAYLOR_SEASONS.forEach(({ season }, i) => {
      expect(totals[season].IND.rushAtt).toBe(expectedTotals[i])
    })

    const shares = computeHistoricalShares(TAYLOR_CAREER_STATS, TAYLOR_PLAYERS_MAP, totals)
    const shareValues = shares['6813'].map(s => s.share)
    expect(shareValues).toEqual([0.505, 0.665, 0.438, 0.352, 0.611, 0.731])
    // Display consequence: Role History slice(-5) → 67/44/35/61/73 (2021-2025).

    const trend = computeShareTrend(shares['6813'])
    expect(trend.shareTrendLabel).toBe('growing')
    expect(trend.volatilityLabel).toBe('volatile')
    expect(trend.shareVolatility).toBeCloseTo(0.144, 2)
    // Step-3 consequence: shareVolatilityScale 0.50, shareTrendMultiplier 1.040
    // (seasonProjection.js) — was 'moderate'/0.80/1.064 pre-fix.
  })
})
