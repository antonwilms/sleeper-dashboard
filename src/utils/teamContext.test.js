/**
 * src/utils/teamContext.test.js
 *
 * Tests for computeHistoricalTeamTotals (additive D3 extension) and
 * computeHistoricalShares (byte-identical after extension).
 */

import { describe, it, expect } from 'vitest'
import { computeHistoricalTeamTotals, computeHistoricalShares, computeQBQualityByTeam, applyQBQualityModifier } from './teamContext.js'

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
