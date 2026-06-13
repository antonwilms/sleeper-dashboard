import { describe, it, expect } from 'vitest'
import { getConferenceMultiplier, computeCollegeMetrics } from './collegeMetrics'

// ---------------------------------------------------------------------------
// getConferenceMultiplier
// ---------------------------------------------------------------------------

describe('getConferenceMultiplier', () => {
  it('returns 0.55 for null — the null-guard fires before the map lookup', () => {
    expect(getConferenceMultiplier(null)).toBe(0.55)
    expect(getConferenceMultiplier(undefined)).toBe(0.55)
    expect(getConferenceMultiplier('')).toBe(0.55)
  })

  // D1-E (known): unknown conference strings get the harshest default (0.55) silently in
  // production; in non-production a console.warn fires. Characterised as-is — the multiplier
  // value is the current behavior regardless of the warn.
  it('unknown conference string → 0.55 default (D1-E — known finding, gated fix)', () => {
    expect(getConferenceMultiplier('Unknown Conference')).toBe(0.55)
    expect(getConferenceMultiplier('SWAC')).toBe(0.55)
  })

  it('SEC → 1.00 (power-4 baseline)', () => {
    expect(getConferenceMultiplier('SEC')).toBe(1.00)
  })

  it('Big Ten → 1.00 (power-4 baseline)', () => {
    expect(getConferenceMultiplier('Big Ten')).toBe(1.00)
  })

  it('Big 12 → 0.95', () => {
    expect(getConferenceMultiplier('Big 12')).toBe(0.95)
  })

  it('ACC → 0.95', () => {
    expect(getConferenceMultiplier('ACC')).toBe(0.95)
  })

  it('Pac-12 → 0.95', () => {
    expect(getConferenceMultiplier('Pac-12')).toBe(0.95)
  })

  it('American Athletic → 0.78 (same as "American")', () => {
    expect(getConferenceMultiplier('American')).toBe(0.78)
    expect(getConferenceMultiplier('American Athletic')).toBe(0.78)
  })

  it('Mountain West → 0.75', () => {
    expect(getConferenceMultiplier('Mountain West')).toBe(0.75)
  })

  it('Sun Belt → 0.68', () => {
    expect(getConferenceMultiplier('Sun Belt')).toBe(0.68)
  })

  it('MAC / Mid-American → 0.65', () => {
    expect(getConferenceMultiplier('MAC')).toBe(0.65)
    expect(getConferenceMultiplier('Mid-American')).toBe(0.65)
  })

  it('Conference USA / C-USA → 0.62', () => {
    expect(getConferenceMultiplier('Conference USA')).toBe(0.62)
    expect(getConferenceMultiplier('C-USA')).toBe(0.62)
  })

  it('FBS Independents / Independent → 0.80', () => {
    expect(getConferenceMultiplier('FBS Independents')).toBe(0.80)
    expect(getConferenceMultiplier('Independent')).toBe(0.80)
  })

  it('label casing is exact — wrong case produces the unknown-conference default', () => {
    expect(getConferenceMultiplier('sec')).toBe(0.55)   // lowercase 'sec' is not in the map
    expect(getConferenceMultiplier('big ten')).toBe(0.55)
  })
})

// ---------------------------------------------------------------------------
// computeCollegeMetrics — guard / null cases
// ---------------------------------------------------------------------------

describe('computeCollegeMetrics — null / invalid inputs', () => {
  it('returns null for null seasons', () => {
    expect(computeCollegeMetrics(null, 'WR', 24, 2024)).toBeNull()
  })

  it('returns null for empty seasons array', () => {
    expect(computeCollegeMetrics([], 'WR', 24, 2024)).toBeNull()
  })

  it('returns null when currentAge is null', () => {
    expect(computeCollegeMetrics([makeSeason(2020, 'WR')], 'WR', null, 2024)).toBeNull()
  })

  it('returns null when currentSeason is null', () => {
    expect(computeCollegeMetrics([makeSeason(2020, 'WR')], 'WR', 24, null)).toBeNull()
  })

  it('returns null for unknown / non-skill position', () => {
    expect(computeCollegeMetrics([makeSeason(2020, 'WR')], 'OT', 24, 2024)).toBeNull()
    expect(computeCollegeMetrics([makeSeason(2020, 'WR')], 'K', 24, 2024)).toBeNull()
    expect(computeCollegeMetrics([makeSeason(2020, 'WR')], '', 24, 2024)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Helpers — build season objects for each position
// ---------------------------------------------------------------------------

function makeSeason(year, pos, overrides = {}) {
  const base = {
    year,
    receiving:      null,
    rushing:        null,
    passing:        null,
    teamRecTotals:  { YDS: 0, TD: 0 },
    teamRushTotals: { YDS: 0, TD: 0 },
    teamPassTotals: { YDS: 0, TD: 0 },
  }
  if (pos === 'WR' || pos === 'TE') {
    base.receiving = { YDS: 1000, TD: 10, conference: 'SEC' }
    base.teamRecTotals = { YDS: 2000, TD: 20 }
  } else if (pos === 'RB') {
    base.rushing = { YDS: 1000, TD: 10, conference: 'SEC' }
    base.teamRushTotals = { YDS: 2000, TD: 20 }
  } else if (pos === 'QB') {
    base.passing = { YDS: 3000, ATT: 500, TD: 30, conference: 'SEC' }
  }
  return { ...base, ...overrides }
}

// ---------------------------------------------------------------------------
// computeCollegeMetrics — WR single season
// ---------------------------------------------------------------------------

describe('computeCollegeMetrics — WR single season', () => {
  // rec.YDS=1000, team.YDS=2000, rec.TD=10, team.TD=20, SEC (×1.00)
  // domRating = (1000/2000*0.65 + 10/20*0.35) * 100 = (0.325+0.175)*100 = 50.0
  it('computes domRating = 50.0 for a 50% share across yards and TDs (SEC)', () => {
    const result = computeCollegeMetrics([makeSeason(2021, 'WR')], 'WR', 24, 2024)
    const enrichedSeason = result.seasons[0]
    expect(enrichedSeason.domRating).toBe(50.0)
    expect(enrichedSeason.confMultiplier).toBe(1.00)
    expect(enrichedSeason.conference).toBe('SEC')
  })

  it('estimatedAge = currentAge − (currentSeason − year)', () => {
    // currentAge=24, currentSeason=2024, year=2021 → 24-(2024-2021)=21
    const result = computeCollegeMetrics([makeSeason(2021, 'WR')], 'WR', 24, 2024)
    expect(result.seasons[0].estimatedAge).toBe(21)
  })

  it('single season → productionTrend = "single-season"', () => {
    const result = computeCollegeMetrics([makeSeason(2021, 'WR')], 'WR', 24, 2024)
    expect(result.productionTrend).toBe('single-season')
    expect(result.seasonsPlayed).toBe(1)
  })

  it('peakDominator and finalYearDominator are both the single season domRating', () => {
    const result = computeCollegeMetrics([makeSeason(2021, 'WR')], 'WR', 24, 2024)
    expect(result.peakDominator).toBe(50.0)
    expect(result.finalYearDominator).toBe(50.0)
  })

  it('breakoutAge set when domRating >= 20 in first season', () => {
    // domRating=50 >= 20 → breakout fires in this season
    const result = computeCollegeMetrics([makeSeason(2021, 'WR')], 'WR', 24, 2024)
    expect(result.breakoutAge).toBe(21)
  })

  it('breakoutAge set when YDS >= 800 even if domRating < 20', () => {
    // Low team totals gives domRating < 20 but YDS=900 >= 800 → breakout via YDS path
    const season = makeSeason(2019, 'WR', {
      receiving:     { YDS: 900, TD: 2, conference: 'SEC' },
      teamRecTotals: { YDS: 50000, TD: 1000 }, // huge denominator → tiny domRating
    })
    const result = computeCollegeMetrics([season], 'WR', 26, 2024)
    expect(result.breakoutAge).toBe(21)  // 26-(2024-2019) = 21
  })

  it('breakoutAge is null when no season meets the WR threshold', () => {
    const season = makeSeason(2021, 'WR', {
      receiving:     { YDS: 200, TD: 1, conference: 'SEC' },
      teamRecTotals: { YDS: 50000, TD: 1000 },
    })
    const result = computeCollegeMetrics([season], 'WR', 24, 2024)
    expect(result.breakoutAge).toBeNull()
  })

  it('null receiving data → domRating is null for that season', () => {
    const season = makeSeason(2021, 'WR', { receiving: null })
    const result = computeCollegeMetrics([season], 'WR', 24, 2024)
    expect(result.seasons[0].domRating).toBeNull()
    expect(result.peakDominator).toBeNull()
    expect(result.finalYearDominator).toBeNull()
  })

  it('conference multiplier scales domRating — Sun Belt (×0.68) reduces the rating', () => {
    const season = makeSeason(2020, 'WR', {
      receiving: { YDS: 1000, TD: 10, conference: 'Sun Belt' },
      teamRecTotals: { YDS: 2000, TD: 20 },
    })
    const result = computeCollegeMetrics([season], 'WR', 24, 2024)
    // domRating before conf: 50.0 × 0.68 = 34.0
    expect(result.seasons[0].confMultiplier).toBe(0.68)
    expect(result.seasons[0].domRating).toBe(34.0)
  })
})

// ---------------------------------------------------------------------------
// computeCollegeMetrics — TE (same isSkill branch as WR)
// ---------------------------------------------------------------------------

describe('computeCollegeMetrics — TE single season', () => {
  it('TE uses the receiving dominator formula (same branch as WR)', () => {
    const result = computeCollegeMetrics([makeSeason(2021, 'TE')], 'TE', 24, 2024)
    expect(result.seasons[0].domRating).toBe(50.0)
  })
})

// ---------------------------------------------------------------------------
// computeCollegeMetrics — RB single season
// ---------------------------------------------------------------------------

describe('computeCollegeMetrics — RB single season', () => {
  // rush.YDS=1000, team.YDS=2000, rush.TD=10, team.TD=20, SEC (×1.00)
  // domRating = (1000/2000*0.65 + 10/20*0.35)*100 = 50.0
  it('computes domRating = 50.0 for a 50% rushing share (SEC)', () => {
    const result = computeCollegeMetrics([makeSeason(2021, 'RB')], 'RB', 24, 2024)
    expect(result.seasons[0].domRating).toBe(50.0)
  })

  it('breakoutAge set when domRating >= 30', () => {
    // domRating=50 >= 30 → breakout
    const result = computeCollegeMetrics([makeSeason(2021, 'RB')], 'RB', 24, 2024)
    expect(result.breakoutAge).toBe(21)
  })

  it('breakoutAge set when rushing YDS >= 700 even if domRating < 30', () => {
    const season = makeSeason(2019, 'RB', {
      rushing:        { YDS: 750, TD: 1, conference: 'SEC' },
      teamRushTotals: { YDS: 50000, TD: 1000 },
    })
    const result = computeCollegeMetrics([season], 'RB', 26, 2024)
    expect(result.breakoutAge).toBe(21)
  })

  it('null rushing data → domRating is null', () => {
    const season = makeSeason(2021, 'RB', { rushing: null })
    const result = computeCollegeMetrics([season], 'RB', 24, 2024)
    expect(result.seasons[0].domRating).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// computeCollegeMetrics — QB single season
// ---------------------------------------------------------------------------

describe('computeCollegeMetrics — QB single season', () => {
  // YDS=3000, ATT=500, TD=30, SEC (×1.00)
  // ypa = 3000/500 = 6.0
  // eff = max(0, min(100, (6-4)*20)) = 40
  // vol = max(0, min(100, (500-200)/6)) = 50 (200/6 = 33.33...)
  // base = round((40*0.55 + 33.333...*0.45)*10)/10 = round((22 + 15.0)*10)/10 = 37.0
  //   Wait: 200/6 is the vol formula for ATT=500: (500-200)/6 = 50 exactly → vol=50
  //   base = round((40*0.55 + 50*0.45)*10)/10 = round((22+22.5)*10)/10 = round(445)/10 = 44.5
  // tdBonus = min(10, 30/3) = 10
  // qbScore = min(100, 44.5+10) = 54.5 × 1.00 = 54.5
  it('computes qbScore correctly for a strong passing season (SEC)', () => {
    const result = computeCollegeMetrics([makeSeason(2021, 'QB')], 'QB', 24, 2024)
    expect(result.seasons[0].qbScore).toBe(54.5)
    expect(result.seasons[0].domRating).toBeNull() // QB path uses qbScore, not domRating
    expect(result.seasons[0].confMultiplier).toBe(1.00)
  })

  it('peakDominator and finalYearDominator reflect qbScore for QB position', () => {
    const result = computeCollegeMetrics([makeSeason(2021, 'QB')], 'QB', 24, 2024)
    expect(result.peakDominator).toBe(54.5)
    expect(result.finalYearDominator).toBe(54.5)
  })

  it('breakoutAge set when TD >= 20', () => {
    // pass.TD=30 >= 20 → breakout even if YDS < 2500
    const season = makeSeason(2021, 'QB', { passing: { YDS: 2000, ATT: 350, TD: 25, conference: 'SEC' } })
    const result = computeCollegeMetrics([season], 'QB', 24, 2024)
    expect(result.breakoutAge).toBe(21)
  })

  it('breakoutAge set when passing YDS >= 2500 even if TD < 20', () => {
    const season = makeSeason(2021, 'QB', { passing: { YDS: 2600, ATT: 400, TD: 15, conference: 'SEC' } })
    const result = computeCollegeMetrics([season], 'QB', 24, 2024)
    expect(result.breakoutAge).toBe(21)
  })

  it('null passing data → qbScore is null', () => {
    const season = makeSeason(2021, 'QB', { passing: null })
    const result = computeCollegeMetrics([season], 'QB', 24, 2024)
    expect(result.seasons[0].qbScore).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// computeCollegeMetrics — multi-season production trend
// ---------------------------------------------------------------------------

// Season factory for WR with an explicit domRating via controlled YDS/team splits.
// All SEC (×1.00) for direct math.
function wrSeason(year, yds, teamYds, td, teamTd) {
  return {
    year,
    receiving:      { YDS: yds, TD: td, conference: 'SEC' },
    rushing:        null,
    passing:        null,
    teamRecTotals:  { YDS: teamYds, TD: teamTd },
    teamRushTotals: { YDS: 0, TD: 0 },
    teamPassTotals: { YDS: 0, TD: 0 },
  }
}

describe('computeCollegeMetrics — multi-season productionTrend', () => {
  // Season 1: (1000/2000*0.65 + 10/20*0.35)*100 = 50.0
  // Season 2: (1600/2000*0.65 + 16/20*0.35)*100 = (0.8*0.65+0.8*0.35)*100 = 80.0
  // mean=65, ratio=80/65=1.231 > 1.15 → improving
  it('productionTrend "improving" when final/mean > 1.15', () => {
    const seasons = [
      wrSeason(2020, 1000, 2000, 10, 20),
      wrSeason(2021, 1600, 2000, 16, 20),
    ]
    const result = computeCollegeMetrics(seasons, 'WR', 24, 2024)
    expect(result.productionTrend).toBe('improving')
    expect(result.peakDominator).toBe(80.0)
    expect(result.finalYearDominator).toBe(80.0)
  })

  // Season 1: 80.0, Season 2: 50.0 — ratio=50/65=0.769 < 0.85 → declining
  it('productionTrend "declining" when final/mean < 0.85', () => {
    const seasons = [
      wrSeason(2020, 1600, 2000, 16, 20),
      wrSeason(2021, 1000, 2000, 10, 20),
    ]
    const result = computeCollegeMetrics(seasons, 'WR', 24, 2024)
    expect(result.productionTrend).toBe('declining')
    expect(result.peakDominator).toBe(80.0)
    expect(result.finalYearDominator).toBe(50.0)
  })

  // Season 1 = Season 2 = 50.0 → ratio=1.0 → peak-final
  it('productionTrend "peak-final" when ratio is in [0.85, 1.15]', () => {
    const seasons = [
      wrSeason(2020, 1000, 2000, 10, 20),
      wrSeason(2021, 1000, 2000, 10, 20),
    ]
    const result = computeCollegeMetrics(seasons, 'WR', 24, 2024)
    expect(result.productionTrend).toBe('peak-final')
  })

  it('breakoutAge is the estimatedAge of the FIRST season meeting the threshold', () => {
    // Season 2020: domRating=25 ≥ 20 → breakout fires at season 2020
    // Season 2021: domRating=50 (would also qualify, but first fires)
    // currentAge=26, currentSeason=2024 → 2020 estimatedAge = 26-(2024-2020)=22
    const seasons = [
      wrSeason(2020, 500, 1000, 5, 10),  // (0.5*0.65 + 0.5*0.35)*100 = 50.0 — wait
      // Actually: 500/1000=0.5, 5/10=0.5 → 0.5*0.65+0.5*0.35 = 0.5 → domRating=50
      // That's >= 20 already. Let me use a tiny team share for season 2020:
      wrSeason(2021, 1000, 2000, 10, 20), // domRating=50
    ]
    // Season 2020 has domRating=50 >= 20 → breakout → breakoutAge=22
    const result = computeCollegeMetrics(seasons, 'WR', 26, 2024)
    expect(result.breakoutAge).toBe(22)
  })

  it('seasonsPlayed reflects the number of enriched seasons', () => {
    const seasons = [
      wrSeason(2019, 1000, 2000, 10, 20),
      wrSeason(2020, 1200, 2000, 12, 20),
      wrSeason(2021, 1600, 2000, 16, 20),
    ]
    const result = computeCollegeMetrics(seasons, 'WR', 24, 2024)
    expect(result.seasonsPlayed).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// computeCollegeMetrics — D1-F edge (known finding — characterised as-is)
// ---------------------------------------------------------------------------

describe('computeCollegeMetrics — D1-F: team.TD null inflates TD-share denominator', () => {
  // D1-F (known, gated): when teamRecTotals.TD is null, `team.TD ?? 1` produces 1,
  // so the TD-share term divides a player's TDs by 1 instead of the real team total —
  // grossly inflating domRating. Test characterises current behavior; the fix is gated.
  it('team.TD=null → denominator becomes 1 → inflated domRating (D1-F, known finding)', () => {
    const season = {
      year: 2021,
      receiving:      { YDS: 1000, TD: 10, conference: 'SEC' },
      rushing:        null,
      passing:        null,
      teamRecTotals:  { YDS: 2000, TD: null }, // null TD — triggers D1-F path
      teamRushTotals: { YDS: 0, TD: 0 },
      teamPassTotals: { YDS: 0, TD: 0 },
    }
    const result = computeCollegeMetrics([season], 'WR', 24, 2024)
    // Normal domRating would be 50.0; with TD denominator=1: (0.5*0.65 + 10/1*0.35)*100 = 382.5
    expect(result.seasons[0].domRating).toBe(382.5)
  })
})
