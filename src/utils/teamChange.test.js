/**
 * src/utils/teamChange.test.js
 *
 * Unit tests for team-change handling (Sub-A depth staleness + Sub-B-capture/neutralize)
 * and the loadPriorSnapshotTeams loader. Exercises computeNextSeasonProjection directly
 * with hand-crafted fixtures.
 *
 * Cases:
 *  1. Depth staleness — penalty suppressed (order 3 + gamesStarted 15)
 *  2. Depth staleness — penalty applies   (order 3 + gamesStarted 2)
 *  3. Depth null — unchanged
 *  4. Starter boost unaffected             (order 1)
 *  5. Team change detected → neutralize   (isTeamChange true, shareTrend+teamRzShare)
 *  6. Team change unknown (no prior snap)  (isTeamChange null, byte-identical to baseline)
 *  7. Same team → no neutralize           (isTeamChange false)
 *  8. Rookie path team-change keys present (no depthStale)
 *  9. loadPriorSnapshotTeams              (mock listCacheRecords / getCacheRecord)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// Hoist mock functions so they are accessible inside vi.mock factory.
const { mockListCacheRecords, mockGetCacheRecord } = vi.hoisted(() => ({
  mockListCacheRecords: vi.fn(),
  mockGetCacheRecord:   vi.fn(),
}))

// Mock cache so IndexedDB is never opened.
vi.mock('./cache', () => ({
  getCache:          vi.fn(() => Promise.resolve(null)),
  setCache:          vi.fn(() => Promise.resolve()),
  getCacheRecord:    mockGetCacheRecord,
  setCacheWithMeta:  vi.fn(() => Promise.resolve()),
  listCacheRecords:  mockListCacheRecords,
}))

import { computeNextSeasonProjection } from './seasonProjection.js'
import { loadPriorSnapshotTeams } from './projectionSnapshot.js'

// ── Shared season-entry builder ───────────────────────────────────────────────

function season(fp, gp, extra = {}) {
  return {
    fantasyPoints: fp,
    gamesPlayed:   gp,
    gamesStarted:  extra.gamesStarted ?? gp,   // default: all games started
    dnpWeeks:      0,
    stats: {
      rush_att: 20, rush_yd: 100, rush_td: 1,
      rush_rz_att: 2,
      rec_tgt: 15, rec: 10, rec_yd: 80, rec_td: 0,
      rec_rz_tgt: 2,
      ...extra.stats,
    },
  }
}

// Five-season WR career at 12 PPG used by depth tests.
function vetCareer(id, lastGamesStarted = 14, lastStats = {}) {
  const s = () => season(168, 14)
  return {
    2020: { [id]: s() },
    2021: { [id]: s() },
    2022: { [id]: s() },
    2023: { [id]: s() },
    2024: { [id]: season(168, 14, { gamesStarted: lastGamesStarted, stats: lastStats }) },
  }
}

function baseOptions(id, overrides = {}) {
  return {
    playerId:         id,
    playersMap:       { [id]: { position: 'WR', age: 26, years_exp: 5, team: 'KC', depth_chart_order: 1 }, ...overrides.playersMap },
    careerStats:      overrides.careerStats ?? vetCareer(id),
    empiricalCurves:  {},
    positionPeakPPG:  { QB: 20, RB: 18, WR: 18, TE: 14 },
    historicalShares: overrides.historicalShares ?? {},
    depthMap:         overrides.depthMap ?? { [id]: { depthOrder: 1 } },
    teamContext:      { teamOffense: { KC: { rank: 8 }, NYJ: { rank: 14 } } },
    scoringSettings:  null,
    ktcMap:           null,
    collegeStats:     null,
    currentSeason:    2025,
    qbQualityByTeam:  null,
    ktcHistory:       null,
    nflDraftMatches:  null,
    historicalTeamTotals: overrides.historicalTeamTotals ?? null,
    priorTeamByPlayer:    overrides.priorTeamByPlayer    ?? null,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('depth-chart staleness (Sub-A)', () => {

  it('1. penalty suppressed — order 3, gamesStarted 15', () => {
    const id = 'TC_DEPTH_SUPP'
    const r  = computeNextSeasonProjection(baseOptions(id, {
      careerStats: vetCareer(id, 15),
      depthMap:    { [id]: { depthOrder: 3 } },
    }))

    expect(r).not.toBeNull()
    expect(r.factors.depthFactor).toBe(1.0)
    expect(r.factors.depthStale).toBe(true)
    expect(r.adjustmentSummary).toContain('Depth chart unconfirmed — penalty held')
    // penalty-suppressed → "Not confirmed starter" line must NOT fire
    expect(r.adjustmentSummary).not.toContain('Not confirmed starter ↓')
  })

  it('2. penalty applies — order 3, gamesStarted 2', () => {
    const id = 'TC_DEPTH_PEN'
    const r  = computeNextSeasonProjection(baseOptions(id, {
      careerStats: vetCareer(id, 2),
      depthMap:    { [id]: { depthOrder: 3 } },
    }))

    expect(r).not.toBeNull()
    expect(r.factors.depthFactor).toBe(0.68)
    expect(r.factors.depthStale).toBe(false)
    expect(r.adjustmentSummary).toContain('Not confirmed starter ↓')
    expect(r.adjustmentSummary).not.toContain('Depth chart unconfirmed — penalty held')
  })

  it('3. depth null — neutral, depthStale false', () => {
    const id = 'TC_DEPTH_NULL'
    const r  = computeNextSeasonProjection(baseOptions(id, {
      careerStats: vetCareer(id),
      depthMap:    {},
    }))

    expect(r).not.toBeNull()
    expect(r.factors.depthFactor).toBe(1.0)
    expect(r.factors.depthStale).toBe(false)
  })

  it('4. starter boost unaffected — order 1', () => {
    const id = 'TC_DEPTH_START'
    const r  = computeNextSeasonProjection(baseOptions(id, {
      careerStats: vetCareer(id, 14),
      depthMap:    { [id]: { depthOrder: 1 } },
    }))

    expect(r).not.toBeNull()
    expect(r.factors.depthFactor).toBe(1.05)
    expect(r.factors.depthStale).toBe(false)
  })

})

// ── Team-change setup helpers ─────────────────────────────────────────────────

// Build a career with share history that gives a 'growing' trend (shareTrendRaw 1.08).
// historicalShares: [priorShare, priorShare, recentHighShare] → trend > 0.20 → 'growing'
function growingShareCareer(id) {
  const s = () => season(168, 14)
  return {
    2020: { [id]: s() },
    2021: { [id]: s() },
    2022: { [id]: s() },
    2023: { [id]: s() },
    // Last season: WR with rec_tgt=40 for teamRzShare eligibility
    2024: { [id]: season(168, 14, { stats: { rec_tgt: 40, rec_rz_tgt: 8, rec: 25, rec_yd: 300, rec_td: 2, rush_att: 0, rush_rz_att: 0 } }) },
  }
}

// Build careerStats for a WR that yields a non-neutral teamRzShareFactor.
// Player is on 'NYJ' (old team 'GB'). Cohort WRs on 'KC' have low share.
function teamChangeCareer(id) {
  const cohortWRs = {}
  for (let i = 0; i < 5; i++) {
    cohortWRs[`tc_cohort_wr_${i}`] = {
      fantasyPoints: 100, gamesPlayed: 14, dnpWeeks: 0,
      stats: { rec_tgt: 25, rec_rz_tgt: 2, rec: 15, rec_yd: 150, rec_td: 1, rush_att: 0 },
    }
  }
  return {
    2020: { [id]: season(168, 14) },
    2021: { [id]: season(168, 14) },
    2022: { [id]: season(168, 14) },
    2023: { [id]: season(168, 14) },
    2024: {
      [id]: season(168, 14, { stats: { rec_tgt: 40, rec_rz_tgt: 8, rec: 25, rec_yd: 300, rec_td: 2, rush_att: 0, rush_rz_att: 0 } }),
      ...cohortWRs,
    },
  }
}

function teamChangePlayersMap(id) {
  const m = { [id]: { position: 'WR', age: 26, years_exp: 5, team: 'NYJ', depth_chart_order: 1 } }
  for (let i = 0; i < 5; i++) {
    m[`tc_cohort_wr_${i}`] = { position: 'WR', age: 25, years_exp: 3, team: 'KC' }
  }
  return m
}

// historicalTeamTotals: player's team (NYJ) has recRz=20; cohort team (KC) also has recRz=20.
// Player rec_rz_tgt=8, NYJ recRz=20 → share=0.40. Cohort: rec_rz_tgt=2, KC recRz=20 → share=0.10.
// Player is well above cohort → teamRzShareFactor > 1.0.
const TEAM_TOTALS_WITH_RZ = {
  2024: {
    NYJ: { rushRz: 0, recRz: 20 },
    KC:  { rushRz: 0, recRz: 20 },
  },
}

const GROWING_SHARES = (id) => ({
  [id]: [
    { share: 0.18 },
    { share: 0.18 },
    { share: 0.42 },
  ],
})

describe('team-change detection + neutralization (Sub-B)', () => {

  it('5. team change detected → share-trend and teamRzShare neutralized', () => {
    const id = 'TC_CHANGE_DET'
    const r  = computeNextSeasonProjection({
      ...baseOptions(id, {
        careerStats:          teamChangeCareer(id),
        historicalShares:     GROWING_SHARES(id),
        historicalTeamTotals: TEAM_TOTALS_WITH_RZ,
        depthMap:             { [id]: { depthOrder: 1 } },
      }),
      playersMap: teamChangePlayersMap(id),
      teamContext: { teamOffense: { NYJ: { rank: 14 }, KC: { rank: 8 } } },
      priorTeamByPlayer: { [id]: 'GB' },
    })

    expect(r).not.toBeNull()
    expect(r.factors.isTeamChange).toBe(true)
    expect(r.factors.prevTeam).toBe('GB')
    expect(r.factors.newTeam).toBe('NYJ')

    // Share trend neutralized to 1.0 regardless of historical share
    expect(r.factors.shareTrend).toBe(1.0)

    // teamRzShare neutralized
    expect(r.factors.teamRzShareFactor).toBe(1.0)
    expect(r.factors.teamRzShare).toBeNull()

    expect(r.adjustmentSummary).toContain('Team change — old-team signals neutralized')
  })

  it('5b. baseline without team change has non-neutral shareTrend and teamRzShareFactor', () => {
    // Verify the same fixture yields non-neutral values when no team change is present,
    // confirming that test 5's assertions are meaningful.
    const id = 'TC_CHANGE_BASE'
    const r  = computeNextSeasonProjection({
      ...baseOptions(id, {
        careerStats:          teamChangeCareer(id),
        historicalShares:     GROWING_SHARES(id),
        historicalTeamTotals: TEAM_TOTALS_WITH_RZ,
        depthMap:             { [id]: { depthOrder: 1 } },
      }),
      playersMap: { [id]: { position: 'WR', age: 26, years_exp: 5, team: 'NYJ', depth_chart_order: 1 },
                   ...(() => { const m = {}; for (let i=0;i<5;i++) m[`tc_cohort_wr_${i}`]={position:'WR',age:25,years_exp:3,team:'KC'}; return m })() },
      teamContext: { teamOffense: { NYJ: { rank: 14 }, KC: { rank: 8 } } },
      priorTeamByPlayer: { [id]: 'NYJ' },   // same team → isTeamChange false
    })

    expect(r).not.toBeNull()
    expect(r.factors.isTeamChange).toBe(false)
    // Share trend should be non-1.0 (growing history)
    expect(r.factors.shareTrend).not.toBe(1.0)
    // teamRzShare should be non-null (valid data)
    expect(r.factors.teamRzShare).not.toBeNull()
    expect(r.factors.teamRzShareFactor).not.toBe(1.0)
  })

  it('6. team change unknown (no prior snapshot) — byte-identical to no-priorTeam baseline', () => {
    const id = 'TC_UNKNOWN'
    const opts = baseOptions(id, {
      careerStats:      growingShareCareer(id),
      historicalShares: GROWING_SHARES(id),
    })

    const withNull    = computeNextSeasonProjection({ ...opts, priorTeamByPlayer: null })
    const withMissing = computeNextSeasonProjection(opts)   // priorTeamByPlayer defaults null

    expect(withNull).not.toBeNull()
    expect(withNull.factors.isTeamChange).toBeNull()
    expect(withNull.factors.prevTeam).toBeNull()
    expect(withNull.factors.newTeam).toBe('KC')    // player.team from baseOptions

    // byte-identical to not passing priorTeamByPlayer at all
    expect(withNull.projectedPPG).toBe(withMissing.projectedPPG)
    expect(withNull.factors.shareTrend).toBe(withMissing.factors.shareTrend)
  })

  it('7. same team → isTeamChange false, signals untouched', () => {
    const id = 'TC_SAME_TEAM'
    const r  = computeNextSeasonProjection(baseOptions(id, {
      careerStats:      growingShareCareer(id),
      historicalShares: GROWING_SHARES(id),
      priorTeamByPlayer: { [id]: 'KC' },   // same as player.team in baseOptions
    }))

    expect(r).not.toBeNull()
    expect(r.factors.isTeamChange).toBe(false)
    expect(r.factors.prevTeam).toBe('KC')
    expect(r.factors.newTeam).toBe('KC')
    // Share trend NOT neutralized — should reflect the growing history
    expect(r.factors.shareTrend).not.toBe(1.0)
    expect(r.adjustmentSummary).not.toContain('Team change — old-team signals neutralized')
  })

  it('8. rookie path: isTeamChange/prevTeam/newTeam present; depthStale absent', () => {
    const id = 'TC_ROOKIE_TC'
    const r  = computeNextSeasonProjection({
      playerId:             id,
      playersMap:           { [id]: { position: 'WR', age: 22, years_exp: 0, team: 'KC', depth_chart_order: 1 } },
      careerStats:          {},
      empiricalCurves:      {},
      positionPeakPPG:      { QB: 20, RB: 18, WR: 18, TE: 14 },
      historicalShares:     {},
      depthMap:             {},
      teamContext:          {},
      scoringSettings:      null,
      ktcMap:               null,
      collegeStats:         null,
      currentSeason:        2025,
      qbQualityByTeam:      null,
      ktcHistory:           null,
      nflDraftMatches:      null,
      historicalTeamTotals: null,
      priorTeamByPlayer:    null,
    })

    expect(r).not.toBeNull()
    expect(r.confidence).toBe('rookie')

    const keys = Object.keys(r.factors)
    expect(keys).toContain('isTeamChange')
    expect(keys).toContain('prevTeam')
    expect(keys).toContain('newTeam')
    // depthStale is vet-only — must not appear on rookie path
    expect(keys).not.toContain('depthStale')

    // Rookie with null priorTeamByPlayer → isTeamChange null
    expect(r.factors.isTeamChange).toBeNull()
    expect(r.factors.prevTeam).toBeNull()
    expect(r.factors.newTeam).toBe('KC')
  })

})

// ── loadPriorSnapshotTeams unit tests ─────────────────────────────────────────

describe('loadPriorSnapshotTeams', () => {

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('9a. picks the latest date strictly before now and maps nfl_team', async () => {
    const now = new Date('2025-06-10T12:00:00Z')

    mockListCacheRecords.mockResolvedValue([
      { key: 'projection-snapshots/2025-06-07', data: null },
      { key: 'projection-snapshots/2025-06-09', data: null },
      { key: 'projection-snapshots/2025-06-08', data: null },
    ])

    const snapshotData = {
      players: {
        'player-1': { nfl_team: 'KC', status: 'Active' },
        'player-2': { nfl_team: 'SF', status: 'Active' },
        'player-3': { nfl_team: null  },   // null team → excluded
      },
    }

    mockGetCacheRecord.mockResolvedValue({ data: snapshotData, expiresAt: Date.now() + 1e9 })

    const result = await loadPriorSnapshotTeams(now)

    // Should have loaded from 2025-06-09 (latest strictly before 2025-06-10)
    expect(mockGetCacheRecord).toHaveBeenCalledWith('projection-snapshots/2025-06-09')

    expect(result).toEqual({
      'player-1': 'KC',
      'player-2': 'SF',
    })
    // player-3 excluded (nfl_team null)
    expect(Object.keys(result ?? {})).not.toContain('player-3')
  })

  it('9b. returns null when no snapshot date precedes now', async () => {
    const now = new Date('2025-06-05T00:00:00Z')

    mockListCacheRecords.mockResolvedValue([
      { key: 'projection-snapshots/2025-06-05', data: null },  // same day → skip
      { key: 'projection-snapshots/2025-06-06', data: null },  // future → skip
    ])

    const result = await loadPriorSnapshotTeams(now)

    expect(result).toBeNull()
    expect(mockGetCacheRecord).not.toHaveBeenCalled()
  })

  it('9c. returns null when listCacheRecords returns empty', async () => {
    mockListCacheRecords.mockResolvedValue([])

    const result = await loadPriorSnapshotTeams(new Date('2025-06-10T00:00:00Z'))

    expect(result).toBeNull()
  })

})
