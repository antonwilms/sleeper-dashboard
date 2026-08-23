import { describe, it, expect } from 'vitest'
import { computeSeasonEfficiency, MIN_PASS_ATTEMPTS, MIN_CARRIES, MIN_TARGETS } from './seasonEfficiency'

const season = 2025

function gameLogs(players) {
  return { complete: true, players }
}

describe('computeSeasonEfficiency — denominator floors', () => {
  // The floors apply only to the four per-opportunity RATES (epaPerAtt, cpoe, rushEpaPerAtt,
  // epaPerTgt). Shares (carrySh) and season totals (rushEpaTotal) are deliberately unfloored —
  // this is the distinction the task file's §2 turns on, asserted explicitly below.

  it('EPA/ATT and CPOE: null one attempt below MIN_PASS_ATTEMPTS, a number at it', () => {
    const below = gameLogs({
      p1: { games: [{ week: 1, seasonType: 'REG', attempts: MIN_PASS_ATTEMPTS - 1, passingEpa: 10, passingCpoe: 5 }] },
    })
    const belowResult = computeSeasonEfficiency(below, null, season)
    expect(belowResult.p1.epaPerAtt).toBeNull()
    expect(belowResult.p1.cpoe).toBeNull()

    const at = gameLogs({
      p1: { games: [{ week: 1, seasonType: 'REG', attempts: MIN_PASS_ATTEMPTS, passingEpa: 10, passingCpoe: 5 }] },
    })
    const atResult = computeSeasonEfficiency(at, null, season)
    expect(atResult.p1.epaPerAtt).toBeCloseTo(10 / MIN_PASS_ATTEMPTS)
    expect(atResult.p1.cpoe).toBeCloseTo(5)
  })

  it('RUSH EPA/ATT: null one carry below MIN_CARRIES, a number at it', () => {
    const below = gameLogs({
      p1: { games: [{ week: 1, seasonType: 'REG', carries: MIN_CARRIES - 1, rushingEpa: 6 }] },
    })
    expect(computeSeasonEfficiency(below, null, season).p1.rushEpaPerAtt).toBeNull()

    const at = gameLogs({
      p1: { games: [{ week: 1, seasonType: 'REG', carries: MIN_CARRIES, rushingEpa: 6 }] },
    })
    expect(computeSeasonEfficiency(at, null, season).p1.rushEpaPerAtt).toBeCloseTo(6 / MIN_CARRIES)
  })

  it('EPA/TGT: null one target below MIN_TARGETS, a number at it', () => {
    const below = gameLogs({
      p1: { games: [{ week: 1, seasonType: 'REG', targets: MIN_TARGETS - 1, receivingEpa: 8 }] },
    })
    expect(computeSeasonEfficiency(below, null, season).p1.epaPerTgt).toBeNull()

    const at = gameLogs({
      p1: { games: [{ week: 1, seasonType: 'REG', targets: MIN_TARGETS, receivingEpa: 8 }] },
    })
    expect(computeSeasonEfficiency(at, null, season).p1.epaPerTgt).toBeCloseTo(8 / MIN_TARGETS)
  })

  it('rushEpaTotal is a season total and stays a real number below MIN_CARRIES', () => {
    const result = computeSeasonEfficiency(
      gameLogs({ p1: { games: [{ week: 1, seasonType: 'REG', carries: MIN_CARRIES - 1, rushingEpa: 6 }] } }),
      null,
      season,
    )
    expect(result.p1.rushEpaTotal).toBe(6)
    expect(result.p1.rushEpaPerAtt).toBeNull()
  })

  it('carrySh is a share and stays a real number below MIN_CARRIES', () => {
    const gameLogsResult = gameLogs({
      p1: { games: [{ week: 1, seasonType: 'REG', team: 'KC', carries: MIN_CARRIES - 1, rushingEpa: 6 }] },
    })
    const teamContextResult = {
      complete: true,
      teams: { KC: { games: [{ week: 1, seasonType: 'REG', off: { rushPlays: 40 } }] } },
    }
    const result = computeSeasonEfficiency(gameLogsResult, teamContextResult, season)
    expect(result.p1.carrySh).toBeCloseTo((MIN_CARRIES - 1) / 40)
    expect(result.p1.rushEpaPerAtt).toBeNull()
  })
})
