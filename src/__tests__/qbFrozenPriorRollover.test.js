// P11 (frozen-qb-chain-prior.md) — simulates the first season a frozen prior can pass the
// model gate (2027): a QB captured as a backup (`chain`) before kickoff and promoted after it must be valued
// at his starter rate, from the frozen read-back through the seam to /week OURS.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))
vi.mock('../api/dataStore', () => ({
  isDataStoreReady: vi.fn(),
  listManifestPaths: vi.fn(),
  tryDataStore: vi.fn(),
  isValidProjectionSnapshot: vi.fn(() => true),
}))

import { getCache } from '../utils/cache'
import { isDataStoreReady, listManifestPaths, tryDataStore } from '../api/dataStore'
import { loadFrozenPrior } from '../api/frozenPrior'
import {
  buildScoringPosteriors, applyInSeasonProjection, selectFrozenPriorCandidate,
} from '../utils/inSeasonScoring'
import { buildOwnProjections } from '../utils/weeklyOwnProjection'
import { PRIOR_MODEL_FROM, K_ROS_POINTS } from '../utils/inSeasonConstants'

const manifest = ['snapshots/2026-09-09.json', 'snapshots/2027-09-08.json', 'snapshots/2027-09-10.json']
const loaderArgs = { liveSeason: 2027, kickoffDate: '2027-09-09', leagueId: 'L1', projectionBasis: 'league' }

const rawCapture = () => ({
  capturedAt: '2027-09-08T10:00:00Z', leagueId: 'L1', targetSeason: 2027, projectionBasis: 'league',
  players: {
    qbX: { projection: { projectedPPG: 2.6, factors: { qbStarterPPG: 16.25, qbStartShare: 0.16, qbTakeoverBasis: 'chain' } } },
    qbI: { projection: { projectedPPG: 18, factors: { qbStarterPPG: 18.034, qbTakeoverBasis: 'incumbent' } } },
  },
})

const seasonProjections = {
  qbX: { projectedPPG: 17.1, projectedGames: 17, factors: { qbStarterPPG: 17.1, qbTakeoverBasis: 'incumbent' } },
  qbI: { projectedPPG: 18.2, projectedGames: 17, factors: { qbStarterPPG: 18.2, qbTakeoverBasis: 'incumbent' } },
}
const playerMap = {
  qbX: { position: 'QB', years_exp: 4, team: 'KC', depth_chart_order: 1, injury_status: null },
  qbI: { position: 'QB', years_exp: 7, team: 'BUF', depth_chart_order: 1, injury_status: null },
}
const careerStats = { 2026: { qbX: { gamesPlayed: 9, fantasyPoints: 60 }, qbI: { gamesPlayed: 17, fantasyPoints: 340 } } }
const currentSeasonTotals = {
  season: 2027, complete: true,
  players: {
    qbX: { gamesPlayed: 1, fantasyPoints: 20, scoringBasis: 'league' },
    qbI: { gamesPlayed: 1, fantasyPoints: 22, scoringBasis: 'league' },
  },
}
const liveStates = () => new Map([['qbX', {
  kind: 'original', team: 'KC', gamesPlayed: 1, remaining: 16, pNext: null, expected: null, fraction: null,
  starts: 1, startPoints: 20, seasonPoints: 20, residual: null, satLonger: null,
}]])

const posteriors = (frozenPrior, qbLiveStates = liveStates()) => buildScoringPosteriors({
  seasonProjections, careerStats, dataSeason: 2026, playerMap, currentSeasonTotals,
  projectionBasis: 'league', frozenPrior, qbLiveStates,
})

beforeEach(() => {
  vi.clearAllMocks()
  isDataStoreReady.mockResolvedValue(true)
  listManifestPaths.mockResolvedValue(manifest)
  getCache.mockResolvedValue(null)
  tryDataStore.mockResolvedValue(rawCapture())
})

describe('the 2027 frozen-prior rollover', () => {
  it("the 2027 candidate passes the model gate (2026's would not)", () => {
    expect(selectFrozenPriorCandidate({ manifestPaths: manifest, kickoffDate: '2027-09-09' }))
      .toMatchObject({ dateKey: '2027-09-08', reason: null })
    expect(selectFrozenPriorCandidate({ manifestPaths: manifest, kickoffDate: '2026-09-10' }))
      .toMatchObject({ dateKey: '2026-09-09', reason: 'model-changed' })
    expect('2027-09-08' >= PRIOR_MODEL_FROM).toBe(true)
  })

  it("the read-back returns the capture's chain set", async () => {
    const r = await loadFrozenPrior(loaderArgs)
    expect(r.status).toBe('ok')
    expect(r.dateKey).toBe('2027-09-08')
    expect(r.players).toEqual({ qbX: 2.6, qbI: 18 })
    expect(r.starterPPG).toEqual({ qbX: 16.25, qbI: 18.034 })
    expect(r.qbChain).toEqual({ qbX: true })
  })

  it('a promoted frozen-chain QB is valued at his starter rate through ROS and OURS', async () => {
    const frozenPrior = await loadFrozenPrior(loaderArgs)
    const k = K_ROS_POINTS.QB
    const m = posteriors(frozenPrior)
    const { ros, frozen, priorSource } = m.get('qbX')
    expect(frozen).toBe(true)
    expect(priorSource).toBe('snapshot:2027-09-08')
    expect(ros.prior).toBe(16.25)
    expect(ros.value).toBe(Math.round(((16.25 * k + 20 * 1) / (k + 1)) * 100) / 100)
    expect(ros.value).toBeGreaterThan(10)

    const scored = applyInSeasonProjection(seasonProjections, m, currentSeasonTotals)
    expect(scored.qbX.projectedPPG).toBe(Math.round(ros.value * 10) / 10)

    const own = buildOwnProjections({
      rows: [{ player_id: 'qbX', team: 'KC' }], seasonProjections: scored, impliedIndex: null, currentWeek: 2, playerMap,
    }).qbX
    expect(own.qbRole).toBe('starter')
    expect(own.base).toBe(scored.qbX.projectedPPG)
    expect(own.baseKind).toBe('ros')
  })

  it('the same promotion with no live state (qbWeekly incomplete) also uses the starter rate', async () => {
    const frozenPrior = await loadFrozenPrior(loaderArgs)
    const m = posteriors(frozenPrior, new Map())
    expect(m.has('qbX')).toBe(true)
    expect(m.get('qbX').ros.prior).toBe(16.25)
  })

  it('a frozen incumbent keeps his frozen projectedPPG', async () => {
    const frozenPrior = await loadFrozenPrior(loaderArgs)
    expect(posteriors(frozenPrior).get('qbI').ros.prior).toBe(18)
  })
})
