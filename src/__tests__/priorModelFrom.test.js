// in-season-evidence-2b-1-constants-snapshot.md §7.5 — the model-pin guard (§0 design rule 4).
// A frozen in-season prior pins the projection MODEL, not just its inputs: the k were fitted on this
// model's errors, and the live projection a frozen prior stands in for is this model's output. This is a
// golden-output characterisation test over a fixed fixture set, keyed to PRIOR_MODEL_FROM. Any change to
// the model's output on these fixtures reds it; the fix is to re-record GOLDEN.outputs AND bump
// PRIOR_MODEL_FROM together (GOLDEN.recordedUnder must equal it, so re-recording without a bump is
// visible in review). It catches output changes on these fixtures, not every conceivable change —
// CR-15's Mirror remains the second line. A bump does not re-fit the k (CR-25).
import { describe, it, expect, vi } from 'vitest'

vi.mock('../utils/cache', () => ({
  getCache:         vi.fn(() => Promise.resolve(null)),
  setCache:         vi.fn(() => Promise.resolve()),
  getCacheRecord:   vi.fn(() => Promise.resolve(null)),
  setCacheWithMeta: vi.fn(() => Promise.resolve()),
}))

import { computeNextSeasonProjection } from '../utils/seasonProjection'
import { PRIOR_MODEL_FROM } from '../utils/inSeasonConstants'
import { makeVet, makeRookie, clampHiCareerStats, breakoutCurves } from '../__fixtures__/factories'

// Fixture set (fixed). Unique player ids: careerComps/efficiency keep module-level caches.
function fixtures() {
  return {
    vetRB: makeVet({ playerId: 'P_PMF_VET_RB' }),
    vetWR_clampHi: makeVet({
      playerId: 'P_PMF_VET_WR', player: { position: 'WR' },
      careerStats: clampHiCareerStats('P_PMF_VET_WR'),
    }),
    // breakoutCurves() replaces only the RB curve; age 23 puts a 14-PPG back inside the breakout window
    vetRB_breakout: makeVet({
      playerId: 'P_PMF_VET_BRK', player: { age: 23 },
      careerStats: clampHiCareerStats('P_PMF_VET_BRK'), empiricalCurves: breakoutCurves(),
    }),
    vetTE: makeVet({ playerId: 'P_PMF_VET_TE', player: { position: 'TE' } }),
    // no draft match, nflDraftYears null → 'unknown' draft capital
    rookieWR: makeRookie({ playerId: 'P_PMF_ROO_WR' }),
    // undrafted: absent from nflDraftMatches, entry year (currentSeason + 1 − years_exp = 2026) is a loaded draft year
    rookieRB_undrafted: makeRookie({
      playerId: 'P_PMF_ROO_UND', player: { position: 'RB' }, nflDraftMatches: {}, nflDraftYears: [2026],
    }),
    // day-3 QB: a matched round-5 pick
    rookieQB_day3: makeRookie({
      playerId: 'P_PMF_ROO_QB', player: { position: 'QB' },
      nflDraftMatches: { P_PMF_ROO_QB: { year: 2026, round: 5, pick: 150 } }, nflDraftYears: [2026],
    }),
  }
}

// Recorded 2026-09-27 by running the code once on the 2026-09-13 model (no output change since 7b5b055
// other than 47af353's basis rescale, which leaves scoringSettings: null fixtures unchanged).
const GOLDEN = {
  recordedUnder: '2026-09-13',
  outputs: {
    vetRB:              { projectedPPG: 11.7, projectedGames: 14 },
    vetWR_clampHi:      { projectedPPG: 17.4, projectedGames: 13 },
    vetRB_breakout:     { projectedPPG: 19.3, projectedGames: 13 },
    vetTE:              { projectedPPG: 14.3, projectedGames: 14 },
    rookieWR:           { projectedPPG: 7.4,  projectedGames: 6 },
    rookieRB_undrafted: { projectedPPG: 3.1,  projectedGames: 4 },
    rookieQB_day3:      { projectedPPG: 9.3,  projectedGames: 2 },
  },
}

describe('the projection model matches its recorded output (PRIOR_MODEL_FROM guard)', () => {
  const outputs = {}
  for (const [name, f] of Object.entries(fixtures())) {
    const r = computeNextSeasonProjection(f.asOptions())
    outputs[name] = r == null ? null : { projectedPPG: r.projectedPPG, projectedGames: r.projectedGames }
  }

  it('every fixture yields a real projection', () => {
    for (const [name, o] of Object.entries(outputs)) {
      expect(o, name).not.toBeNull()
      expect(Number.isFinite(o.projectedPPG), `${name} projectedPPG`).toBe(true)
      expect(Number.isFinite(o.projectedGames), `${name} projectedGames`).toBe(true)
    }
  })

  it('GOLDEN was recorded under the current PRIOR_MODEL_FROM', () => {
    expect(GOLDEN.recordedUnder).toBe(PRIOR_MODEL_FROM)
  })

  it('projectedPPG / projectedGames equal the golden values', () => {
    expect(
      outputs,
      'Projection model output changed: re-record GOLDEN and bump PRIOR_MODEL_FROM (inSeasonConstants.js) in the same commit — a frozen prior pins the model.',
    ).toEqual(GOLDEN.outputs)
  })
})
