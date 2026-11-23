import { describe, it, expect } from 'vitest'
import { alignToAxis, buildMetricRow, buildRzShareSeries, buildGamesPlayedShareSeries, METRIC_META } from './usageEfficiency'
import { buildWindowStats } from './marketWindowStats'

describe('alignToAxis', () => {
  it('projects a sparse series onto the axis; gap seasons become null, not omitted', () => {
    const series = [{ season: 2021, value: 10 }, { season: 2023, value: 12 }]
    expect(alignToAxis(series, [2021, 2022, 2023, 2024], 'value')).toEqual([10, null, 12, null])
  })

  it('a season present but non-finite becomes null', () => {
    const series = [{ season: 2021, value: NaN }, { season: 2022, value: 5 }]
    expect(alignToAxis(series, [2021, 2022], 'value')).toEqual([null, 5])
  })

  it('reads an arbitrary value key (e.g. snapPct from buildUsageHistory rows)', () => {
    const history = [{ season: 2021, snapPct: 0.4 }, { season: 2022, snapPct: null }]
    expect(alignToAxis(history, [2021, 2022], 'snapPct')).toEqual([0.4, null])
  })

  it('empty/undefined series → all null, never throws', () => {
    expect(alignToAxis(undefined, [2021, 2022], 'value')).toEqual([null, null])
    expect(alignToAxis([], [2021, 2022], 'value')).toEqual([null, null])
  })
})

describe('buildMetricRow', () => {
  const axis = [2021, 2022, 2023, 2024, 2025]

  it('latest is the most recent non-null entry, not necessarily axis[-1]', () => {
    const values = [10, 12, 14, null, null] // player didn't qualify the last two seasons shown
    const row = buildMetricRow('cmpPct', values, axis)
    expect(row.latest).toEqual({ value: 14, season: 2023 })
  })

  it('delta is latest vs axis[0] specifically — not latest vs prior', () => {
    const values = [10, 99, 99, 99, 20] // a middle spike that a "vs prior" comparison would catch instead
    const row = buildMetricRow('cmpPct', values, axis)
    expect(row.delta).toBeCloseTo(10) // 20 - 10, not 20 - 99
  })

  it('delta is null when the first season shown has no value — never substitutes a later baseline', () => {
    const values = [null, 12, 14, 16, 18]
    const row = buildMetricRow('cmpPct', values, axis)
    expect(row.latest.value).toBe(18)
    expect(row.delta).toBeNull()
  })

  it('coverageCount is the count of real (non-null) values on the axis', () => {
    const values = [10, null, 14, null, 18]
    const row = buildMetricRow('cmpPct', values, axis)
    expect(row.coverageCount).toBe(3)
  })

  it('all-null series: latest and delta both null, coverage 0', () => {
    const row = buildMetricRow('sacks', [null, null, null, null, null], axis)
    expect(row.latest).toBeNull()
    expect(row.delta).toBeNull()
    expect(row.coverageCount).toBe(0)
  })

  it('meta is attached and formatting matches the metric id', () => {
    const row = buildMetricRow('rushShare', [0.42], [2025])
    expect(row.meta).toBe(METRIC_META.rushShare)
    expect(row.meta.format(0.42)).toBe('42.0%')
  })
})

describe('METRIC_META — domain and formatting', () => {
  it('bounded fraction metrics carry an explicit [0,1] domain (share series unreadable auto-scaled)', () => {
    for (const id of ['rushShare', 'rbTargetShare', 'targetShare', 'airYardsShare', 'snapShare']) {
      expect(METRIC_META[id].domain).toEqual([0, 1])
    }
  })

  it('cmpPct is on a 0-100 scale, not 0-1 (computeSeasonAverages.compPct convention)', () => {
    expect(METRIC_META.cmpPct.domain).toEqual([0, 100])
    expect(METRIC_META.cmpPct.format(63.4)).toBe('63.4%')
  })

  it('unbounded count/ratio metrics have no fixed domain — a guessed ceiling risks clipping', () => {
    expect(METRIC_META.sacks.domain).toBeNull()
    expect(METRIC_META.yardsPerCarry.domain).toBeNull()
    expect(METRIC_META.aDOT.domain).toBeNull()
  })

  it('deltaFormat signs positive and negative correctly', () => {
    expect(METRIC_META.rushShare.deltaFormat(0.05)).toBe('+5.0pp')
    expect(METRIC_META.rushShare.deltaFormat(-0.05)).toBe('-5.0pp')
    expect(METRIC_META.sacks.deltaFormat(3)).toBe('+3')
    expect(METRIC_META.sacks.deltaFormat(-3)).toBe('-3')
  })
})

// ---------------------------------------------------------------------------
// buildRzShareSeries — dp-v2 Slice 4c §5
// ---------------------------------------------------------------------------
describe('buildRzShareSeries', () => {
  const historicalTeamTotals = {
    2024: { DAL: { rushAtt: 400, rec: 300, recTgt: 450, rushRz: 40, recRz: 60 } },
    2025: { DAL: { rushAtt: 420, rec: 310, recTgt: 460, rushRz: 50, recRz: 0 } }, // recRz 0 this season
  }

  it('RB: player-total ÷ team-total, not an average of per-game shares', () => {
    const careerStats = {
      2024: { rb1: { gamesPlayed: 16, team: 'DAL', stats: { rush_rz_att: 10 } } }, // 10/40 = 25%
    }
    const series = buildRzShareSeries(careerStats, 'rb1', 'RB', historicalTeamTotals)
    expect(series).toEqual([{ season: 2024, value: 0.25 }])
  })

  it('WR/TE: rec_rz_tgt ÷ team recRz', () => {
    const careerStats = {
      2024: { wr1: { gamesPlayed: 16, team: 'DAL', stats: { rec_rz_tgt: 15 } } }, // 15/60 = 25%
    }
    expect(buildRzShareSeries(careerStats, 'wr1', 'WR', historicalTeamTotals)).toEqual([{ season: 2024, value: 0.25 }])
    expect(buildRzShareSeries(careerStats, 'wr1', 'TE', historicalTeamTotals)).toEqual([{ season: 2024, value: 0.25 }])
  })

  it('QB gets no series at all, regardless of stats present', () => {
    const careerStats = {
      2024: { qb1: { gamesPlayed: 16, team: 'DAL', stats: { pass_rz_att: 30 } } },
    }
    expect(buildRzShareSeries(careerStats, 'qb1', 'QB', historicalTeamTotals)).toEqual([])
  })

  it('zero team denominator (recRz 0 in 2025) omits the season — a void slot, never 0', () => {
    const careerStats = {
      2025: { wr1: { gamesPlayed: 16, team: 'DAL', stats: { rec_rz_tgt: 5 } } },
    }
    expect(buildRzShareSeries(careerStats, 'wr1', 'WR', historicalTeamTotals)).toEqual([])
  })

  it('absent/undefined historicalTeamTotals omits every season, never throws', () => {
    const careerStats = {
      2024: { wr1: { gamesPlayed: 16, team: 'DAL', stats: { rec_rz_tgt: 15 } } },
    }
    expect(buildRzShareSeries(careerStats, 'wr1', 'WR', undefined)).toEqual([])
  })

  it('below QUALIFYING_GP is excluded, same gate as the rest of the section', () => {
    const careerStats = {
      2024: { wr1: { gamesPlayed: 3, team: 'DAL', stats: { rec_rz_tgt: 15 } } },
    }
    expect(buildRzShareSeries(careerStats, 'wr1', 'WR', historicalTeamTotals)).toEqual([])
  })

  it('zero numerator omits the season (matches the rest of the section\'s share-metric convention)', () => {
    const careerStats = {
      2024: { wr1: { gamesPlayed: 16, team: 'DAL', stats: { rec_rz_tgt: 0 } } },
    }
    expect(buildRzShareSeries(careerStats, 'wr1', 'WR', historicalTeamTotals)).toEqual([])
  })
})

describe('buildGamesPlayedShareSeries', () => {
  const P = n => Array(n).fill('P').concat(Array(18 - n).fill('X'))
  const wk = (from, to, stat) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, stat]))
  // 2025 covered: every row carries weeklyStats equal to its stats. w1 played 15 of DAL's 17 games.
  const careerStats = {
    2024: {
      w1: { gamesPlayed: 16, team: 'DAL', weeklyStatus: P(16), stats: { rec_tgt: 80 } }, // no weeklyStats → 2024 uncovered
      w2: { gamesPlayed: 17, team: 'DAL', weeklyStatus: P(17), stats: { rec_tgt: 120 } },
    },
    2025: {
      w1: { gamesPlayed: 15, team: 'DAL', weeklyStatus: P(15), stats: { rec_tgt: 25 }, weeklyStats: { ...wk(1, 10, { rec_tgt: 2 }), ...wk(11, 15, { rec_tgt: 1 }) } },
      w2: { gamesPlayed: 17, team: 'DAL', weeklyStatus: P(17), stats: { rec_tgt: 75 }, weeklyStats: { ...wk(1, 15, { rec_tgt: 3 }), ...wk(16, 17, { rec_tgt: 15 }) } },
      w3: { gamesPlayed: 6, team: 'DAL', weeklyStatus: P(6), stats: { rec_tgt: 0 }, weeklyStats: {} },
    },
  }
  const playerMap = { w1: { position: 'WR' }, w2: { position: 'WR' }, w3: { position: 'WR' } }
  const args = { position: 'WR', seasons: [2024, 2025], careerStats, playerMap, gameLogsByYear: null }
  const statsFor = y => buildWindowStats({ window: { id: String(y), kind: 'season', seasons: [y] }, careerStats, currentSeasonTotals: null, playerMap, gameLogsByYear: null })

  it('F1-T4 reads Market\'s games-played share for covered seasons only; gp gate holds; uncovered seasons are void', () => {
    const w1 = buildGamesPlayedShareSeries({ playerId: 'w1', ...args })
    expect(w1.targetShare).toHaveLength(1) // no 2024 entry: uncovered, never filled from the season-total basis
    expect(w1.targetShare[0].season).toBe(2025)
    expect(w1.targetShare[0].value).toBeCloseTo(25 / 70, 4)
    expect(w1.targetShare[0].value).toBe(statsFor(2025).get('w1').usage.tgtShare)
    expect(w1.targetShare[0].value).not.toBeCloseTo(0.25, 2) // season-total share
    expect(w1.airYardsShare).toEqual([]) // no rec_air_yd tracked → not finite → no entry
    expect(buildGamesPlayedShareSeries({ playerId: 'w3', ...args }).targetShare).toEqual([]) // gp 6 < 8
  })

  it('maps the RB metrics to the carry and target shares and returns nothing for QB', () => {
    const rb = buildGamesPlayedShareSeries({ playerId: 'x', position: 'RB', seasons: [2025], careerStats, playerMap: { x: { position: 'RB' } }, gameLogsByYear: null })
    expect(Object.keys(rb).sort()).toEqual(['rbTargetShare', 'rushShare'])
    expect(buildGamesPlayedShareSeries({ playerId: 'q', position: 'QB', seasons: [2025], careerStats, playerMap, gameLogsByYear: null })).toEqual({})
  })
})
