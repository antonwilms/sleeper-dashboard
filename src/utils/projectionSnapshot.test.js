import { describe, it, expect, vi } from 'vitest'

// cache.js uses idb (IndexedDB); mock it so Node can import projectionSnapshot.js
// without requiring a browser environment. Only buildProjectionSnapshot is under test;
// writeProjectionSnapshot (which calls getCacheRecord/setCache) is deferred to Slice 3.
vi.mock('./cache', () => ({
  getCacheRecord: vi.fn(),
  setCache:       vi.fn(),
}))

import { buildProjectionSnapshot, shouldWriteProjectionSnapshot } from './projectionSnapshot.js'

// Minimal playersMap players
function makePlayer(team, position = 'WR') {
  return { team, position, status: 'Active', depth_chart_order: 1 }
}

// Simple scoringSettings
const PPR_SCORING = { rec: 1, pass_yd: 0.04 }

describe('deriveScoringBasis (via buildProjectionSnapshot)', () => {
  function scoreFor(scoringSettings) {
    return buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap:    null,
      playerRows: [],
      scoringSettings,
      leagueId:  'L1',
    }).scoringBasis
  }

  it('null scoringSettings → unknown', () => {
    expect(scoreFor(null)).toBe('unknown')
  })

  it('{ rec: 1 } → ppr', () => {
    expect(scoreFor({ rec: 1 })).toBe('ppr')
  })

  it('{ rec: 1, bonus_rec_te: 0.5 } → te_premium (checked before plain ppr)', () => {
    expect(scoreFor({ rec: 1, bonus_rec_te: 0.5 })).toBe('te_premium')
  })

  it('{ rec: 0.5 } → half_ppr', () => {
    expect(scoreFor({ rec: 0.5 })).toBe('half_ppr')
  })

  it('{ rec: 0 } → standard', () => {
    expect(scoreFor({ rec: 0 })).toBe('standard')
  })

  it('{ rec: 0.75 } → custom', () => {
    expect(scoreFor({ rec: 0.75 })).toBe('custom')
  })

  it('{ rec: 1, bonus_rec_fd: 0.5 } → custom (FD bonus disqualifies plain PPR)', () => {
    expect(scoreFor({ rec: 1, bonus_rec_fd: 0.5 })).toBe('custom')
  })
})

describe('buildProjectionSnapshot', () => {
  it('happy path — teamless player excluded; schemaVersion=3; capturedAt is ISO string', () => {
    const seasonProjections = {
      P1: { projectedPPG: 12 },
      P2: { projectedPPG: 10 },
      P3: { projectedPPG:  8 },  // no team → excluded
    }
    const playerMap = {
      P1: makePlayer('SF'),
      P2: makePlayer('KC'),
      P3: { position: 'WR', team: null },  // teamless
    }
    const snap = buildProjectionSnapshot({
      seasonProjections,
      playerMap,
      ktcMap:    null,
      playerRows: [],
      scoringSettings: PPR_SCORING,
      leagueId: 'L42',
    })
    expect(snap.schemaVersion).toBe(3)
    expect(typeof snap.capturedAt).toBe('string')
    // ISO 8601 format
    expect(snap.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
    // P3 excluded (no team)
    expect(Object.keys(snap.players)).toContain('P1')
    expect(Object.keys(snap.players)).toContain('P2')
    expect(Object.keys(snap.players)).not.toContain('P3')
  })

  it('teamsInSnapshot covers only included players teams', () => {
    const seasonProjections = { P1: { projectedPPG: 12 }, P2: { projectedPPG: 10 } }
    const playerMap = { P1: makePlayer('SF'), P2: makePlayer('KC') }
    const snap = buildProjectionSnapshot({
      seasonProjections, playerMap, ktcMap: null, playerRows: [], scoringSettings: PPR_SCORING, leagueId: 'L1',
    })
    // teamDepthCharts should have SF and KC entries (empty since no players in playerRows)
    expect(Object.keys(snap.teamDepthCharts)).toContain('SF')
    expect(Object.keys(snap.teamDepthCharts)).toContain('KC')
  })

  it('now override → capturedAt matches provided date', () => {
    const now = new Date('2026-05-24T00:00:00.000Z')
    const snap = buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap:    null,
      playerRows: [],
      scoringSettings: PPR_SCORING,
      leagueId:  'L1',
      now,
    })
    expect(snap.capturedAt).toBe('2026-05-24T00:00:00.000Z')
  })

  it('no KTC entry — player not in ktcMap → players[id].ktc === null', () => {
    const snap = buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap:    null,  // no ktcMap at all
      playerRows: [],
      scoringSettings: PPR_SCORING,
      leagueId:  'L1',
    })
    expect(snap.players.P1.ktc).toBeNull()
  })

  it('KTC present — ktc.value and positionPercentile populated', () => {
    // Need 5+ WRs in ktcMap for percentile to be non-null (computeKTCPositionPercentile requires ≥5)
    const ktcMap = new Map([
      ['P1', { value: 5000 }],
      ['W2', { value: 4000 }],
      ['W3', { value: 3000 }],
      ['W4', { value: 2000 }],
      ['W5', { value: 1000 }],
    ])
    const playerMap = {
      P1: makePlayer('SF', 'WR'),
      W2: makePlayer('KC', 'WR'),
      W3: makePlayer('DAL', 'WR'),
      W4: makePlayer('GB',  'WR'),
      W5: makePlayer('NYG', 'WR'),
    }
    const snap = buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 12 } },
      playerMap,
      ktcMap,
      playerRows: [],
      scoringSettings: PPR_SCORING,
      leagueId:  'L1',
    })
    expect(snap.players.P1.ktc).not.toBeNull()
    expect(snap.players.P1.ktc.value).toBe(5000)
    expect(typeof snap.players.P1.ktc.positionPercentile).toBe('number')
  })

  it('targetSeason = currentSeason + 1 and currentSeason stored', () => {
    const snap = buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap:    null,
      playerRows: [],
      scoringSettings: PPR_SCORING,
      leagueId:  'L1',
      currentSeason: 2025,
    })
    expect(snap.targetSeason).toBe(2026)
    expect(snap.currentSeason).toBe(2025)
  })

  it('schemaVersion is 3', () => {
    const snap = buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap:    null,
      playerRows: [],
      scoringSettings: PPR_SCORING,
      leagueId:  'L1',
      currentSeason: 2025,
    })
    expect(snap.schemaVersion).toBe(3)
  })

  it('scoringSettings stored verbatim; scoringBasis still derived alongside', () => {
    const customScoring = { rec: 1, pass_yd: 0.04, bonus_rec_te: 0.5 }
    const snap = buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap:    null,
      playerRows: [],
      scoringSettings: customScoring,
      leagueId:  'L1',
      currentSeason: 2025,
    })
    expect(snap.scoringSettings).toEqual(customScoring)
    expect(snap.scoringBasis).toBe('te_premium')
  })

  it('null scoringSettings → scoringSettings: null and scoringBasis: unknown', () => {
    const snap = buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap:    null,
      playerRows: [],
      scoringSettings: null,
      leagueId:  'L1',
      currentSeason: 2025,
    })
    expect(snap.scoringSettings).toBeNull()
    expect(snap.scoringBasis).toBe('unknown')
    expect(snap.targetSeason).toBe(2026)
  })

  it('missing currentSeason → targetSeason: null, currentSeason: null (no NaN)', () => {
    const snap = buildProjectionSnapshot({
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap:    null,
      playerRows: [],
      scoringSettings: PPR_SCORING,
      leagueId:  'L1',
    })
    expect(snap.targetSeason).toBeNull()
    expect(snap.currentSeason).toBeNull()
  })
})

describe('shouldWriteProjectionSnapshot', () => {
  function base() {
    return {
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap:         { P1: { team: 'SF' } },
      ktcMap:            new Map(),
      scoringSettings:   { rec: 1 },
      leagueId:          'L1',
      careerStats:       { 2025: {} },
      collegeSettled:    true,
      nflDraftSettled:   true,
      priorTeamSettled:  true,
    }
  }

  it('normal cold load — all present, all three settled', () => {
    expect(shouldWriteProjectionSnapshot(base())).toBe(true)
  })

  it('warm load, college unsettled', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), collegeSettled: false })).toBe(false)
  })

  it('warm load, draft unsettled', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), nflDraftSettled: false })).toBe(false)
  })

  it('warm load, priorTeam unsettled', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), priorTeamSettled: false })).toBe(false)
  })

  it('all three unsettled', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), collegeSettled: false, nflDraftSettled: false, priorTeamSettled: false })).toBe(false)
  })

  it('disabled / legitimate-null — all settled, data absent', () => {
    // CFBD/data-store disabled and no prior snapshot: flags are true (settled), data never arrived.
    // Must still return true — neutral college/draft and null prior-team are the correct permanent truths.
    expect(shouldWriteProjectionSnapshot({ ...base(), collegeSettled: true, nflDraftSettled: true, priorTeamSettled: true })).toBe(true)
  })

  it('no seasonProjections', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), seasonProjections: null })).toBe(false)
  })

  it('no ktcMap', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), ktcMap: null })).toBe(false)
  })

  it('no scoringSettings', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), scoringSettings: null })).toBe(false)
  })

  it('no playerMap', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), playerMap: null })).toBe(false)
  })

  it('no leagueId', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), leagueId: undefined })).toBe(false)
  })

  it('no careerStats', () => {
    expect(shouldWriteProjectionSnapshot({ ...base(), careerStats: null })).toBe(false)
  })
})

// ─── D1a — inputStatus (schema v3) ──────────────────────────────────────────

describe('buildProjectionSnapshot — inputStatus', () => {
  function baseArgs(overrides = {}) {
    return {
      seasonProjections: { P1: { projectedPPG: 10 } },
      playerMap: { P1: makePlayer('SF') },
      ktcMap: null,
      playerRows: [],
      scoringSettings: PPR_SCORING,
      leagueId: 'L1',
      currentSeason: 2025,
      careerStats: { 2024: {}, 2025: {} },
      ...overrides,
    }
  }

  it('all six inputStatus entries are present with loaded boolean and count number-or-null', () => {
    const snap = buildProjectionSnapshot(baseArgs())
    for (const key of ['college', 'nflDraft', 'ktc', 'priorSnapshotTeams', 'depthChart', 'careerStats']) {
      expect(snap.inputStatus).toHaveProperty(key)
      expect(typeof snap.inputStatus[key].loaded).toBe('boolean')
      expect(snap.inputStatus[key].count === null || typeof snap.inputStatus[key].count === 'number').toBe(true)
    }
  })

  it('every v2 field survives with its v2 value alongside the new inputStatus key', () => {
    const snap = buildProjectionSnapshot(baseArgs())
    expect(snap.schemaVersion).toBe(3)
    expect(snap.targetSeason).toBe(2026)
    expect(snap.currentSeason).toBe(2025)
    expect(snap.leagueId).toBe('L1')
    expect(snap.players.P1).toBeDefined()
  })

  it('ktc.count equals ktcMap.size for a real Map — correction 1 regression guard', () => {
    // A fixture built as a plain object would pass while the shipped code (ktcMap.size on an
    // object) returns 0 — this must be a real Map.
    const ktcMap = new Map([
      ['P1', { value: 5000 }], ['W2', { value: 4000 }], ['W3', { value: 3000 }],
      ['W4', { value: 2000 }], ['W5', { value: 1000 }],
    ])
    const playerMap = {
      P1: makePlayer('SF', 'WR'), W2: makePlayer('KC', 'WR'), W3: makePlayer('DAL', 'WR'),
      W4: makePlayer('GB', 'WR'), W5: makePlayer('NYG', 'WR'),
    }
    const snap = buildProjectionSnapshot(baseArgs({
      playerMap,
      ktcMap,
      seasonProjections: { P1: { projectedPPG: 12 } },
      ktcRowCount: 541,
    }))
    expect(snap.inputStatus.ktc.count).toBe(5)
    expect(snap.inputStatus.ktc.detail.rows).toBe(541)
  })

  it('college.loaded === false when any year × category has zero players; detail.years names exactly those years (2026-09-03 reproduction)', () => {
    const collegeCoverage = {
      2024: { receiving: 100, rushing: 80, passing: 30 },
      2025: { receiving: 0,   rushing: 75, passing: 28 },  // one empty category
    }
    const snap = buildProjectionSnapshot(baseArgs({ collegeCoverage }))
    expect(snap.inputStatus.college.loaded).toBe(false)
    expect(snap.inputStatus.college.detail.years).toEqual([2025])
  })

  it('college.loaded === true when every year × category is non-empty', () => {
    const collegeCoverage = {
      2024: { receiving: 100, rushing: 80, passing: 30 },
      2025: { receiving: 90,  rushing: 75, passing: 28 },
    }
    const snap = buildProjectionSnapshot(baseArgs({ collegeCoverage }))
    expect(snap.inputStatus.college.loaded).toBe(true)
    expect(snap.inputStatus.college.detail.years).toEqual([])
    expect(snap.inputStatus.college.count).toBe(90 + 75 + 28)
  })

  it('nflDraft.detail.years reflects the store\'s year list; loaded === false on the empty-{} store-unavailable path', () => {
    const snap = buildProjectionSnapshot(baseArgs({ nflDraftCoverage: {}, nflDraftMatches: null }))
    expect(snap.inputStatus.nflDraft.loaded).toBe(false)
    expect(snap.inputStatus.nflDraft.detail.years).toEqual([])
    expect(snap.inputStatus.nflDraft.count).toBe(0)
  })

  it('nflDraft.loaded === false on the fully-keyed-but-all-empty store-unavailable path', () => {
    const nflDraftCoverage = { 2024: 0, 2025: 0, 2026: 0 }
    const snap = buildProjectionSnapshot(baseArgs({ nflDraftCoverage, nflDraftMatches: null }))
    expect(snap.inputStatus.nflDraft.loaded).toBe(false)
    expect(snap.inputStatus.nflDraft.detail.years).toEqual([])
  })

  it('nflDraft.loaded === true when the target class (targetSeason) has picks', () => {
    const nflDraftCoverage = { 2024: 250, 2025: 260, 2026: 40 }  // targetSeason = 2026
    const nflDraftMatches = { P10: {}, P11: {} }
    const snap = buildProjectionSnapshot(baseArgs({ nflDraftCoverage, nflDraftMatches }))
    expect(snap.inputStatus.nflDraft.loaded).toBe(true)
    expect(snap.inputStatus.nflDraft.count).toBe(250 + 260 + 40)
    expect(snap.inputStatus.nflDraft.detail.years).toEqual([2024, 2025, 2026])
    expect(snap.inputStatus.nflDraft.detail.matched).toBe(2)
  })

  it('detail.years.includes(targetSeason) — the documented exclusion-rule predicate itself (fix pass 1 item 1)', () => {
    // Regression guard for the string/number mismatch: an array-shape assertion (as above) would
    // pass even when the shipped code returned string years, silently breaking this predicate.
    const loaded = buildProjectionSnapshot(baseArgs({
      nflDraftCoverage: { 2024: 259, 2025: 257, 2026: 257 },  // targetSeason = 2026
      nflDraftMatches: { P10: {} },
    }))
    expect(loaded.inputStatus.nflDraft.detail.years.includes(loaded.targetSeason)).toBe(true)

    const noPicksForTarget = buildProjectionSnapshot(baseArgs({
      nflDraftCoverage: { 2024: 259, 2025: 257, 2026: 0 },  // target class has no picks yet
      nflDraftMatches: { P10: {} },
    }))
    expect(noPicksForTarget.inputStatus.nflDraft.detail.years.includes(noPicksForTarget.targetSeason)).toBe(false)
  })

  it('priorSnapshotTeams.loaded === false with count: 0 when priorTeamByPlayer is null; snapshot still built', () => {
    const snap = buildProjectionSnapshot(baseArgs({ priorTeamByPlayer: null }))
    expect(snap.inputStatus.priorSnapshotTeams).toEqual({ loaded: false, count: 0 })
    expect(snap.players.P1).toBeDefined()
  })

  it('priorSnapshotTeams.count reflects players with a prior team', () => {
    const snap = buildProjectionSnapshot(baseArgs({ priorTeamByPlayer: { P1: 'SF', P9: 'KC' } }))
    expect(snap.inputStatus.priorSnapshotTeams).toEqual({ loaded: true, count: 2 })
  })

  it('careerStats.detail.provenance carries one entry per season in detail.seasons, single vocabulary', () => {
    const snap = buildProjectionSnapshot(baseArgs({
      careerStats: { 2024: {}, 2025: {} },
      careerProvenance: { 2024: 'cache-hit', 2025: 'live-api' },
    }))
    expect(snap.inputStatus.careerStats.detail.seasons).toEqual([2024, 2025])
    expect(snap.inputStatus.careerStats.detail.provenance).toEqual({ 2024: 'cache-hit', 2025: 'live-api' })
  })

  it('careerStats.detail.provenance records null for a season with no known path — seasons and provenance stay equal length (fix pass 1 item 3)', () => {
    const snap = buildProjectionSnapshot(baseArgs({
      careerStats: { 2023: {}, 2024: {}, 2025: {} },
      careerProvenance: { 2024: 'cache-hit' },  // 2023 and 2025 never reported a path
    }))
    expect(snap.inputStatus.careerStats.detail.seasons).toEqual([2023, 2024, 2025])
    expect(Object.keys(snap.inputStatus.careerStats.detail.provenance).length)
      .toBe(snap.inputStatus.careerStats.detail.seasons.length)
    expect(snap.inputStatus.careerStats.detail.provenance).toEqual({
      2023: null, 2024: 'cache-hit', 2025: null,
    })
  })

  it('a rejected college or draft loader still produces { loaded: false, count: 0 } with no entry omitted', () => {
    const snap = buildProjectionSnapshot(baseArgs({ collegeCoverage: null, nflDraftCoverage: null, nflDraftMatches: null }))
    expect(snap.inputStatus.college.loaded).toBe(false)
    expect(snap.inputStatus.college.count).toBe(0)
    expect(snap.inputStatus.nflDraft.loaded).toBe(false)
    expect(snap.inputStatus.nflDraft.count).toBe(0)
  })

  it('depthChart.count counts only players rows with depthChartOrder != null, over the snapshot\'s own player set', () => {
    const seasonProjections = { P1: { projectedPPG: 12 }, P2: { projectedPPG: 10 } }
    const playerMap = {
      P1: { team: 'SF', position: 'WR', status: 'Active', depth_chart_order: 1 },
      P2: { team: 'KC', position: 'WR', status: 'Active', depth_chart_order: null },
    }
    const snap = buildProjectionSnapshot(baseArgs({ seasonProjections, playerMap }))
    expect(snap.inputStatus.depthChart).toEqual({ loaded: true, count: 1 })
  })
})
