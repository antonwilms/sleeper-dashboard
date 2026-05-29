import { describe, it, expect, vi } from 'vitest'

// cache.js uses idb (IndexedDB); mock it so Node can import projectionSnapshot.js
// without requiring a browser environment. Only buildProjectionSnapshot is under test;
// writeProjectionSnapshot (which calls getCacheRecord/setCache) is deferred to Slice 3.
vi.mock('./cache', () => ({
  getCacheRecord: vi.fn(),
  setCache:       vi.fn(),
}))

import { buildProjectionSnapshot } from './projectionSnapshot.js'

// Minimal playersMap players
function makePlayer(team, position = 'WR') {
  return { team, position, status: 'Active', depth_chart_order: 1 }
}

// Simple scoringSettings
const PPR_SCORING = { rec: 1, pass_yd: 0.04 }

// A ktcMap with one entry
function makeKtcMap(playerId, value) {
  return new Map([[playerId, { value, confidence: 'high' }]])
}

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
  it('happy path — teamless player excluded; schemaVersion=1; capturedAt is ISO string', () => {
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
    expect(snap.schemaVersion).toBe(1)
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
})
