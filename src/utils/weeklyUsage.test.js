import { describe, it, expect } from 'vitest'
import {
  buildTeamAggregates, accumulateUsage, computeUsageShares, priorSeasonSnapShare,
  accumulateRedZone, computeRedZoneShares, computeUsageCounts,
} from './weeklyUsage'

function statRow({ team, opponent = 'DEN', gp = 1, rush_att, rec, rec_tgt, off_snp, tm_off_snp }) {
  const stats = { gp }
  if (rush_att !== undefined) stats.rush_att = rush_att
  if (rec !== undefined) stats.rec = rec
  if (rec_tgt !== undefined) stats.rec_tgt = rec_tgt
  if (off_snp !== undefined) stats.off_snp = off_snp
  if (tm_off_snp !== undefined) stats.tm_off_snp = tm_off_snp
  return { stats, team, opponent }
}

function teamRow(passAtt, rushAtt) {
  return { stats: { pass_att: passAtt, rush_att: rushAtt }, team: null, opponent: null }
}

describe('buildTeamAggregates', () => {
  it('picks out TEAM_<abbr> rows, keyed without the prefix', () => {
    const weekRows = {
      TEAM_KC: teamRow(35, 25),
      TEAM_DEN: teamRow(30, 20),
      p1: statRow({ team: 'KC', rush_att: 10 }),
    }
    const agg = buildTeamAggregates(weekRows)
    expect(agg.KC).toEqual({ passAtt: 35, rushAtt: 25, offSnp: null })
    expect(agg.DEN).toEqual({ passAtt: 30, rushAtt: 20, offSnp: null })
    expect(agg.p1).toBeUndefined()
  })

  it('a team absent from the payload (bye) has no entry', () => {
    const agg = buildTeamAggregates({ TEAM_KC: teamRow(35, 25) })
    expect(agg.DEN).toBeUndefined()
  })

  it('empty/null input returns {}', () => {
    expect(buildTeamAggregates(null)).toEqual({})
    expect(buildTeamAggregates({})).toEqual({})
  })
})

describe('accumulateUsage — the snap null-vs-zero three-row table (parent §1.1), each asserted separately', () => {
  it('off_snp present + tm_off_snp present -> the ratio', () => {
    const weeklyMaps = [{
      week: 1,
      rows: { p1: statRow({ team: 'KC', off_snp: 40, tm_off_snp: 60 }) },
      teamAggregates: { KC: { passAtt: 30, rushAtt: 20, offSnp: 60 } },
    }]
    const totals = accumulateUsage(weeklyMaps, 'p1')
    const shares = computeUsageShares(totals, 'WR')
    expect(shares.snap).toBeCloseTo(40 / 60)
  })

  it('off_snp ABSENT + tm_off_snp present + gp===1 -> a real 0, not null', () => {
    const weeklyMaps = [{
      week: 1,
      rows: { p1: statRow({ team: 'KC', tm_off_snp: 60 }) }, // no off_snp key at all
      teamAggregates: { KC: { passAtt: 30, rushAtt: 20, offSnp: 60 } },
    }]
    const totals = accumulateUsage(weeklyMaps, 'p1')
    const shares = computeUsageShares(totals, 'WR')
    expect(shares.snap).toBe(0)
  })

  it('gp absent (no observation at all) -> null', () => {
    const weeklyMaps = [{
      week: 1,
      rows: { p1: { stats: {}, team: 'KC', opponent: 'DEN' } }, // no gp, no tm_off_snp
      teamAggregates: { KC: { passAtt: 30, rushAtt: 20, offSnp: 60 } },
    }]
    const totals = accumulateUsage(weeklyMaps, 'p1')
    const shares = computeUsageShares(totals, 'WR')
    expect(shares.snap).toBeNull()
  })
})

describe('computeUsageShares — the four definitions', () => {
  const weeklyMaps = [{
    week: 1,
    rows: { p1: statRow({ team: 'KC', rush_att: 5, rec: 3, rec_tgt: 6, off_snp: 40, tm_off_snp: 50 }) },
    teamAggregates: { KC: { passAtt: 30, rushAtt: 20, offSnp: 50 } },
  }]

  it('rush = player rush_att / team rush_att', () => {
    const shares = computeUsageShares(accumulateUsage(weeklyMaps, 'p1'), 'RB')
    expect(shares.rush).toBeCloseTo(5 / 20)
  })

  it('target = player rec_tgt / team pass_att', () => {
    const shares = computeUsageShares(accumulateUsage(weeklyMaps, 'p1'), 'RB')
    expect(shares.target).toBeCloseTo(6 / 30)
  })

  it('touch = (rush_att + rec) / (team rush_att + team pass_att)', () => {
    const shares = computeUsageShares(accumulateUsage(weeklyMaps, 'p1'), 'RB')
    expect(shares.touch).toBeCloseTo((5 + 3) / (20 + 30))
  })

  it('rush is null for WR/TE; target is null for QB — position gating', () => {
    const totals = accumulateUsage(weeklyMaps, 'p1')
    expect(computeUsageShares(totals, 'WR').rush).toBeNull()
    expect(computeUsageShares(totals, 'TE').rush).toBeNull()
    expect(computeUsageShares(totals, 'QB').target).toBeNull()
  })

  it('a player who never played in the window gets every share null, not 0', () => {
    const totals = accumulateUsage([], 'p1')
    const shares = computeUsageShares(totals, 'RB')
    expect(shares).toEqual({ rush: null, target: null, touch: null, snap: null })
  })
})

describe('accumulateUsage — sums across the window then divides once (never averages weekly shares)', () => {
  // Week 1: 2/40 carries (5%). Week 2: 18/20 carries (90%). Mean of shares = 47.5%.
  // Summed-then-divided = 20/60 = 33.3% — the two differ, proving the function does not average.
  const weeklyMaps = [
    {
      week: 1,
      rows: { p1: statRow({ team: 'KC', rush_att: 2 }) },
      teamAggregates: { KC: { passAtt: 10, rushAtt: 40, offSnp: 40 } },
    },
    {
      week: 2,
      rows: { p1: statRow({ team: 'KC', rush_att: 18 }) },
      teamAggregates: { KC: { passAtt: 10, rushAtt: 20, offSnp: 20 } },
    },
  ]

  it('equals summed-then-divided, not the mean of weekly shares', () => {
    const shares = computeUsageShares(accumulateUsage(weeklyMaps, 'p1'), 'RB')
    const meanOfShares = (2 / 40 + 18 / 20) / 2
    const summedThenDivided = (2 + 18) / (40 + 20)
    expect(shares.rush).toBeCloseTo(summedThenDivided)
    expect(shares.rush).not.toBeCloseTo(meanOfShares, 2)
  })
})

describe('accumulateUsage — a player whose team changes mid-window (trade)', () => {
  // Week 1 with KC (heavy rush share), week 2 with DEN (light rush share) — resolved from that
  // WEEK's own row.team, never a fixed team or a playerMap fallback (which would divide by only
  // one of the two teams' attempts for the whole window).
  const weeklyMaps = [
    {
      week: 1,
      rows: { p1: statRow({ team: 'KC', rush_att: 10 }) },
      teamAggregates: {
        KC: { passAtt: 20, rushAtt: 20, offSnp: 20 },
        DEN: { passAtt: 20, rushAtt: 20, offSnp: 20 },
      },
    },
    {
      week: 2,
      rows: { p1: statRow({ team: 'DEN', rush_att: 2 }) },
      teamAggregates: {
        KC: { passAtt: 20, rushAtt: 20, offSnp: 20 },
        DEN: { passAtt: 20, rushAtt: 20, offSnp: 20 },
      },
    },
  ]

  it('divides each week by that week\'s own team, not a fixed team across the window', () => {
    const shares = computeUsageShares(accumulateUsage(weeklyMaps, 'p1'), 'RB')
    // Correct (per-week team resolution): (10 + 2) / (20 + 20) = 0.3
    expect(shares.rush).toBeCloseTo(12 / 40)

    // A fixed-team-across-the-window implementation (e.g. always KC, or a playerMap fallback to
    // his CURRENT team) would give a visibly different, wrong answer:
    const fixedToKcOnly = 12 / 20 // both weeks' attempts over only KC's denominator
    expect(shares.rush).not.toBeCloseTo(fixedToKcOnly, 2)
  })

  it('a team absent from a given week\'s teamAggregates contributes 0 to that week, not a throw', () => {
    const partial = [
      { week: 1, rows: { p1: statRow({ team: 'KC', rush_att: 10 }) }, teamAggregates: {} },
    ]
    expect(() => accumulateUsage(partial, 'p1')).not.toThrow()
    const totals = accumulateUsage(partial, 'p1')
    expect(totals.teamRushAtt).toBe(0)
  })
})

describe('priorSeasonSnapShare (weekly-decision-2-panels.md §1a)', () => {
  function seasonRow({ gamesPlayed, off_snp, tm_off_snp }) {
    const stats = {}
    if (off_snp !== undefined) stats.off_snp = off_snp
    if (tm_off_snp !== undefined) stats.tm_off_snp = tm_off_snp
    return { gamesPlayed, stats }
  }

  it('is off_snp / tm_off_snp when both are present and gamesPlayed > 0', () => {
    const rows = { p1: seasonRow({ gamesPlayed: 10, off_snp: 400, tm_off_snp: 800 }) }
    expect(priorSeasonSnapShare(rows, 'p1')).toBeCloseTo(0.5)
  })

  it('an absent off_snp beside a present tm_off_snp is a measured 0, not null (W1\'s rule)', () => {
    const rows = { p1: seasonRow({ gamesPlayed: 10, tm_off_snp: 800 }) }
    expect(priorSeasonSnapShare(rows, 'p1')).toBe(0)
  })

  it('gamesPlayed 0 -> null', () => {
    const rows = { p1: seasonRow({ gamesPlayed: 0, off_snp: 10, tm_off_snp: 800 }) }
    expect(priorSeasonSnapShare(rows, 'p1')).toBeNull()
  })

  it('an absent tm_off_snp -> null', () => {
    const rows = { p1: seasonRow({ gamesPlayed: 10, off_snp: 10 }) }
    expect(priorSeasonSnapShare(rows, 'p1')).toBeNull()
  })

  it('no row for the player -> null', () => {
    expect(priorSeasonSnapShare({}, 'missing')).toBeNull()
    expect(priorSeasonSnapShare(null, 'missing')).toBeNull()
  })
})

// week-lineup-cleanup.md §2 — red-zone usage and counts.
function rzWeek(week, playerRows, teamRows) {
  const rows = {}
  for (const [id, r] of Object.entries(playerRows)) rows[id] = { team: r.team, stats: { gp: r.gp ?? 1, ...r.stats } }
  for (const [abbr, stats] of Object.entries(teamRows)) rows['TEAM_' + abbr] = { team: null, stats }
  return { week, rows }
}

describe('accumulateRedZone', () => {
  it('sums two played weeks of player and team red-zone attempts', () => {
    const maps = [
      rzWeek(1, { p1: { team: 'A', stats: { rush_rz_att: 3, rec_rz_tgt: 1 } } }, { A: { rush_rz_att: 10, pass_rz_att: 8 } }),
      rzWeek(2, { p1: { team: 'A', stats: { rush_rz_att: 2, rec_rz_tgt: 2 } } }, { A: { rush_rz_att: 6, pass_rz_att: 12 } }),
    ]
    expect(accumulateRedZone(maps, 'p1')).toEqual({ played: true, rzRush: 5, rzTgt: 3, teamRzRush: 16, teamRzPass: 20 })
  })

  it('skips a week the player did not play (gp !== 1)', () => {
    const maps = [
      rzWeek(1, { p1: { team: 'A', stats: { rush_rz_att: 3 } } }, { A: { rush_rz_att: 10 } }),
      rzWeek(2, { p1: { team: 'A', gp: 0, stats: { rush_rz_att: 9 } } }, { A: { rush_rz_att: 50 } }),
    ]
    const t = accumulateRedZone(maps, 'p1')
    expect(t.rzRush).toBe(3)
    expect(t.teamRzRush).toBe(10)
  })

  it('a traded player divides each week by the team he played for that week', () => {
    const maps = [
      rzWeek(1, { p1: { team: 'A', stats: { rush_rz_att: 2 } } }, { A: { rush_rz_att: 4 }, B: { rush_rz_att: 100 } }),
      rzWeek(2, { p1: { team: 'B', stats: { rush_rz_att: 2 } } }, { A: { rush_rz_att: 100 }, B: { rush_rz_att: 6 } }),
    ]
    const t = accumulateRedZone(maps, 'p1')
    expect(t.teamRzRush).toBe(10) // 4 (A) + 6 (B), not 8 or 200
    expect(t.rzRush).toBe(4)
  })

  it('absent player and team red-zone keys add 0 (Sleeper omits zero)', () => {
    const maps = [rzWeek(1, { p1: { team: 'A', stats: {} } }, { A: {} })]
    expect(accumulateRedZone(maps, 'p1')).toEqual({ played: true, rzRush: 0, rzTgt: 0, teamRzRush: 0, teamRzPass: 0 })
    expect(accumulateRedZone(maps, 'ghost').played).toBe(false)
  })
})

describe('computeRedZoneShares', () => {
  const totals = { played: true, rzRush: 4, rzTgt: 3, teamRzRush: 16, teamRzPass: 12 }
  it('RB gets both shares', () => {
    expect(computeRedZoneShares(totals, 'RB')).toEqual({ rzRush: 0.25, rzTarget: 0.25 })
  })
  it('rzRush is null for WR/TE, rzTarget null for QB', () => {
    expect(computeRedZoneShares(totals, 'WR').rzRush).toBeNull()
    expect(computeRedZoneShares(totals, 'TE').rzRush).toBeNull()
    expect(computeRedZoneShares(totals, 'QB').rzTarget).toBeNull()
  })
  it('a zero team denominator -> null, and not played -> null', () => {
    expect(computeRedZoneShares({ ...totals, teamRzRush: 0, teamRzPass: 0 }, 'RB')).toEqual({ rzRush: null, rzTarget: null })
    expect(computeRedZoneShares({ ...totals, played: false }, 'RB')).toEqual({ rzRush: null, rzTarget: null })
  })
})

describe('computeUsageCounts', () => {
  const usage = { played: true, rushAtt: 22, rec: 5, recTgt: 8, offSnp: 120, tmOffSnp: 200, snapObservations: 3 }
  const rz = { played: true, rzRush: 4, rzTgt: 2 }
  it('counts equal the totals; touch = carries + receptions', () => {
    expect(computeUsageCounts(usage, rz, 'RB')).toEqual({ rush: 22, target: 8, touch: 27, snap: 120, rzRush: 4, rzTarget: 2 })
  })
  it('position gating: WR/TE no rush counts, QB no target counts', () => {
    const wr = computeUsageCounts(usage, rz, 'WR')
    expect(wr.rush).toBeNull(); expect(wr.rzRush).toBeNull(); expect(wr.target).toBe(8)
    const qb = computeUsageCounts(usage, rz, 'QB')
    expect(qb.target).toBeNull(); expect(qb.rzTarget).toBeNull(); expect(qb.rush).toBe(22)
  })
  it('snap is 0 for a played week with tm_off_snp but no off_snp, null with no tm_off_snp week', () => {
    const maps = [{ week: 1, teamAggregates: {}, rows: { p1: { team: 'A', stats: { gp: 1, tm_off_snp: 60 } } } }]
    expect(computeUsageCounts(accumulateUsage(maps, 'p1'), rz, 'RB').snap).toBe(0)
    const noSnap = [{ week: 1, teamAggregates: {}, rows: { p1: { team: 'A', stats: { gp: 1 } } } }]
    expect(computeUsageCounts(accumulateUsage(noSnap, 'p1'), rz, 'RB').snap).toBeNull()
  })
  it('not played -> every count null', () => {
    const none = computeUsageCounts({ played: false, rushAtt: 0, rec: 0, recTgt: 0, snapObservations: 0 }, { played: false }, 'RB')
    expect(Object.values(none).every(v => v === null)).toBe(true)
  })
})
