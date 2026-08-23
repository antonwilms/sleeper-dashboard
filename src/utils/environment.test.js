import { describe, it, expect } from 'vitest'
import {
  computeTeamSeasonMetrics, computeLeagueStanding, ordinal, SERIES_METRICS,
  FILTER_METRICS, buildLeagueRankTable,
} from './environment'

// Real ARI week-1-2025 row (verified against nflverse/teamcontext/2025.json directly): plays 61,
// passPlays 37, proePlays 61, proePassPlays 37, proeXpassSum 36.561, stored proe 0.007.
function ariWeek1() {
  return {
    week: 1, seasonType: 'REG', opponent: 'NO',
    off: {
      plays: 61, passPlays: 37, rushPlays: 24,
      epaSum: 2.683, epaPlays: 61,
      passEpaSum: 3.101, passEpaPlays: 37,
      rushEpaSum: -0.418, rushEpaPlays: 24,
      successes: 25, successPlays: 61,
      proePlays: 61, proePassPlays: 37, proeXpassSum: 36.561,
      rzTrips: 3, rzTdTrips: 2,
      neutralSeconds: 788, neutralGaps: 20,
      pointsScored: 20,
    },
    def: { epaSum: -2.791, epaPlays: 67 },
  }
}

function week(overrides, seasonType = 'REG') {
  return {
    week: overrides.week ?? 2, seasonType, opponent: 'X',
    off: {
      plays: 60, passPlays: 30, rushPlays: 30,
      epaSum: 1, epaPlays: 60,
      passEpaSum: 1, passEpaPlays: 30,
      rushEpaSum: 0, rushEpaPlays: 30,
      successes: 24, successPlays: 60,
      proePlays: 60, proePassPlays: 30, proeXpassSum: 30,
      rzTrips: 2, rzTdTrips: 1,
      neutralSeconds: 700, neutralGaps: 20,
      pointsScored: 17,
      ...overrides.off,
    },
    def: { epaSum: -1, epaPlays: 60, ...overrides.def },
  }
}

describe('computeTeamSeasonMetrics — PROE is a difference, using proePlays', () => {
  it('matches the real ARI week-1 stored proe (0.007) via the difference form', () => {
    const m = computeTeamSeasonMetrics([ariWeek1()])
    expect(m.proe).toBeCloseTo(0.0072, 3)
  })

  it('the ratio-only form (proeXpassSum ÷ proePlays alone) would give a different, wrong answer', () => {
    const g = ariWeek1()
    const ratioOnly = g.off.proeXpassSum / g.off.proePlays // the "expected pass rate", not PROE
    expect(ratioOnly).toBeCloseTo(0.599, 2)
    const m = computeTeamSeasonMetrics([g])
    expect(m.proe).not.toBeCloseTo(ratioOnly, 2)
  })

  it('pairing proeXpassSum with proePassPlays (the wrong field, per the app comment this slice fixed) gives nonsense', () => {
    const g = ariWeek1()
    const wrongForm = (g.off.passPlays / g.off.plays) - (g.off.proeXpassSum / g.off.proePassPlays)
    expect(wrongForm).toBeCloseTo(-0.3816, 3)
    const m = computeTeamSeasonMetrics([g])
    expect(m.proe).not.toBeCloseTo(wrongForm, 2)
  })
})

describe('computeTeamSeasonMetrics — successPlays is the denominator, not plays', () => {
  it('success rate is not ≈1.0 — the signature of the successPlays÷plays error', () => {
    const m = computeTeamSeasonMetrics([ariWeek1()])
    expect(m.successRate).toBeCloseTo(25 / 61, 3)
    expect(m.successRate).not.toBeGreaterThan(0.9)
  })
})

describe('computeTeamSeasonMetrics — rate aggregation sums components, never stored rates', () => {
  it('two-week fixture with unequal volume: summing components then dividing differs from averaging the per-game rates', () => {
    const g1 = week({ week: 1, off: { successes: 5, successPlays: 10 } })   // rate 0.50, 10 plays
    const g2 = week({ week: 2, off: { successes: 10, successPlays: 100 } }) // rate 0.10, 100 plays
    const rateAverage = (5 / 10 + 10 / 100) / 2 // naive average of per-game rates = 0.30
    const componentPath = computeTeamSeasonMetrics([g1, g2]).successRate // (5+10)/(10+100) = 0.1364
    expect(componentPath).toBeCloseTo(15 / 110, 4)
    expect(componentPath).not.toBeCloseTo(rateAverage, 2)
  })

  it('never sums the epaPerPlay stored rate — epaSum/epaPlays across two weeks', () => {
    const g1 = week({ week: 1, off: { epaSum: 4, epaPlays: 40 } })  // 0.10/play
    const g2 = week({ week: 2, off: { epaSum: -2, epaPlays: 20 } }) // -0.10/play
    const m = computeTeamSeasonMetrics([g1, g2])
    expect(m.epaPerPlay).toBeCloseTo((4 + -2) / (40 + 20), 5) // 0.0333, not the naive 0 average
  })
})

describe('computeTeamSeasonMetrics — REG-only filtering', () => {
  it('a POST row changes plays/game and points/game if not filtered out — assert the REG-only answer', () => {
    const reg1 = week({ week: 1, off: { plays: 60, pointsScored: 20 } })
    const reg2 = week({ week: 2, off: { plays: 60, pointsScored: 20 } })
    const post = week({ week: 19, off: { plays: 80, pointsScored: 40 } }, 'POST')
    const regOnly = computeTeamSeasonMetrics([reg1, reg2])
    const withPost = computeTeamSeasonMetrics([reg1, reg2, post])
    // Both calls filter internally — this assertion just proves the POST row is excluded, since
    // the two computations over the same REG rows plus an ignored POST row must agree.
    expect(withPost.playsPerGame).toBeCloseTo(regOnly.playsPerGame, 5)
    expect(withPost.pointsPerGame).toBeCloseTo(regOnly.pointsPerGame, 5)
    expect(withPost.games).toBe(2)
  })
})

describe('computeTeamSeasonMetrics — no off.epa field, and no rzTdTrips÷rzTrips inversion', () => {
  it('rzTdRate uses rzTdTrips ÷ rzTrips', () => {
    const m = computeTeamSeasonMetrics([ariWeek1()])
    expect(m.rzTdRate).toBeCloseTo(2 / 3, 5)
  })

  it('zero-denominator metrics are null, never 0 or NaN', () => {
    const emptyGame = week({ off: { plays: 0, passPlays: 0, proePlays: 0, successPlays: 0, rzTrips: 0, neutralGaps: 0, epaPlays: 0, passEpaPlays: 0, rushEpaPlays: 0 } })
    const m = computeTeamSeasonMetrics([emptyGame])
    expect(m.proe).toBeNull()
    expect(m.pace).toBeNull()
    expect(m.successRate).toBeNull()
    expect(m.rzTdRate).toBeNull()
    expect(m.epaPerPlay).toBeNull()
  })
})

describe('computeLeagueStanding', () => {
  const loaded = {
    complete: true,
    teams: {
      AAA: { games: [week({ off: { successes: 50, successPlays: 60, neutralSeconds: 500, neutralGaps: 20 } })] }, // successRate .833, pace 25
      BBB: { games: [week({ off: { successes: 30, successPlays: 60, neutralSeconds: 700, neutralGaps: 20 } })] }, // successRate .50, pace 35
      CCC: { games: [week({ off: { successes: 40, successPlays: 60, neutralSeconds: 600, neutralGaps: 20 } })] }, // successRate .667, pace 30
    },
  }

  it('computes median and rank from all teams in the loaded season (higher-is-better metric)', () => {
    const s = computeLeagueStanding(loaded, 'successRate', 'AAA')
    expect(s.n).toBe(3)
    expect(s.median).toBeCloseTo(40 / 60, 5) // CCC is the median team
    expect(s.rank).toBe(1) // AAA has the highest success rate
  })

  it('pace ranks the OPPOSITE direction — lower seconds is rank 1, not the highest value', () => {
    const s = computeLeagueStanding(loaded, 'pace', 'AAA') // AAA has the LOWEST pace value (25s, fastest)
    expect(s.rank).toBe(1)
    const slow = computeLeagueStanding(loaded, 'pace', 'BBB') // BBB has the HIGHEST pace value (35s, slowest)
    expect(slow.rank).toBe(3)
  })

  it('a team not present (or with a null metric) is unranked, not defaulted to last/first', () => {
    const s = computeLeagueStanding(loaded, 'successRate', 'ZZZ')
    expect(s.rank).toBeNull()
    expect(s.n).toBe(3) // the distribution itself is still computed from the real 3 teams
  })

  it('empty/incomplete loaded season → all null, n 0', () => {
    expect(computeLeagueStanding(null, 'successRate', 'AAA')).toEqual({ median: null, rank: null, n: 0 })
    expect(computeLeagueStanding({ teams: {} }, 'successRate', 'AAA')).toEqual({ median: null, rank: null, n: 0 })
  })
})

describe('ordinal', () => {
  it('handles 1st/2nd/3rd/4th and the 11-13 exception', () => {
    expect(ordinal(1)).toBe('1st')
    expect(ordinal(2)).toBe('2nd')
    expect(ordinal(3)).toBe('3rd')
    expect(ordinal(4)).toBe('4th')
    expect(ordinal(11)).toBe('11th')
    expect(ordinal(12)).toBe('12th')
    expect(ordinal(13)).toBe('13th')
    expect(ordinal(21)).toBe('21st')
    expect(ordinal(32)).toBe('32nd')
  })
})

describe('SERIES_METRICS', () => {
  it('is exactly the four §4.1 metrics', () => {
    expect(SERIES_METRICS).toEqual(['proe', 'pace', 'successRate', 'rzTdRate'])
  })
})

describe('FILTER_METRICS (dp-v2 5c)', () => {
  it('is its own list, deliberately different from SERIES_METRICS — swaps successRate for epaPerPlay', () => {
    expect(FILTER_METRICS).toEqual(['proe', 'pace', 'epaPerPlay', 'rzTdRate'])
    expect(FILTER_METRICS).not.toEqual(SERIES_METRICS)
    expect(FILTER_METRICS).toContain('epaPerPlay')
    expect(SERIES_METRICS).not.toContain('epaPerPlay')
  })
})

describe('buildLeagueRankTable (dp-v2 5c)', () => {
  const loaded = {
    complete: true,
    teams: {
      AAA: { games: [week({ off: { successes: 50, successPlays: 60, neutralSeconds: 500, neutralGaps: 20, epaSum: 10, epaPlays: 60 } })] }, // pace 25 (fast), epaPerPlay 0.167
      BBB: { games: [week({ off: { successes: 30, successPlays: 60, neutralSeconds: 700, neutralGaps: 20, epaSum: -6, epaPlays: 60 } })] }, // pace 35 (slow), epaPerPlay -0.10
      CCC: { games: [week({ off: { successes: 40, successPlays: 60, neutralSeconds: 600, neutralGaps: 20, epaSum: 3, epaPlays: 60 } })] },   // pace 30, epaPerPlay 0.05
    },
  }

  it('ranks epaPerPlay — absent from SERIES_METRICS, so a test exercising only that list would miss it', () => {
    const table = buildLeagueRankTable(loaded, FILTER_METRICS)
    expect(table.epaPerPlay.AAA).toBe(1) // highest epaPerPlay
    expect(table.epaPerPlay.CCC).toBe(2)
    expect(table.epaPerPlay.BBB).toBe(3) // lowest (negative)
  })

  it('pace ranks the OPPOSITE direction — the fastest (lowest) team is rank 1, not the highest value', () => {
    const table = buildLeagueRankTable(loaded, FILTER_METRICS)
    expect(table.pace.AAA).toBe(1) // AAA has the lowest pace value (25s) — the fastest offence
    expect(table.pace.BBB).toBe(3) // BBB has the highest (35s) — the slowest
  })

  it('matches computeLeagueStanding\'s own rank for the same metric/team (same underlying math, built once instead of per-team-per-call)', () => {
    const table = buildLeagueRankTable(loaded, FILTER_METRICS)
    for (const metric of FILTER_METRICS) {
      for (const team of Object.keys(loaded.teams)) {
        expect(table[metric][team] ?? null).toBe(computeLeagueStanding(loaded, metric, team).rank)
      }
    }
  })

  it('a team with a null metric is absent from that metric\'s map — unranked, not defaulted to first/last', () => {
    const withGap = {
      complete: true,
      teams: {
        ...loaded.teams,
        ZZZ: { games: [week({ off: { plays: 0, passPlays: 0, proePlays: 0, epaPlays: 0 } })] }, // proe/epaPerPlay null
      },
    }
    const table = buildLeagueRankTable(withGap, FILTER_METRICS)
    expect(table.proe.ZZZ).toBeUndefined()
    expect(table.epaPerPlay.ZZZ).toBeUndefined()
    // successRate/rzTdRate-independent fields (pace here) still resolve normally for the same team.
    expect(Object.keys(table.proe)).toHaveLength(3)
  })

  it('an absent/empty loaded season returns an empty map per metric, not a throw', () => {
    expect(buildLeagueRankTable(null, FILTER_METRICS)).toEqual({ proe: {}, pace: {}, epaPerPlay: {}, rzTdRate: {} })
    expect(buildLeagueRankTable({ teams: {} }, FILTER_METRICS)).toEqual({ proe: {}, pace: {}, epaPerPlay: {}, rzTdRate: {} })
  })
})
