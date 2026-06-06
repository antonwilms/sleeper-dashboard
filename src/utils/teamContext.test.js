/**
 * src/utils/teamContext.test.js
 *
 * Tests for computeHistoricalTeamTotals (additive D3 extension) and
 * computeHistoricalShares (byte-identical after extension).
 */

import { describe, it, expect } from 'vitest'
import { computeHistoricalTeamTotals, computeHistoricalShares } from './teamContext.js'

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
