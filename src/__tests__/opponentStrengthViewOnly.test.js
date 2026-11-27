import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// All projection/scoring modules in src/utils — the complete list.
// A missed module is a hole in the decoupling contract. Add any new
// projection/scoring modules here when they are introduced.
const PIPELINE = [
  // Core projection and dynasty pipeline
  'src/utils/seasonProjection.js',
  'src/utils/dynastyScore.js',
  'src/utils/prospectPrior.js',
  'src/utils/projectionSignals.js',
  'src/utils/usageMetrics.js',
  'src/utils/teamContext.js',
  // Supporting projection/scoring modules
  'src/utils/compsIntegration.js',
  'src/utils/efficiencyMetrics.js',
  'src/utils/momentum.js',
  'src/utils/regressionSignals.js',
  'src/utils/durabilitySignals.js',
  'src/utils/careerComps.js',
  'src/utils/teamRzShare.js',
  'src/utils/ageCurve.js',
  'src/utils/dynastyLabel.js',
  'src/utils/ktcHistory.js',
  'src/utils/qbTakeover.js',
  'src/utils/qbTakeoverConstants.js',
]

// opponentStrength.js (fpa-defense-ranking.md) computes fantasy points allowed by position — the
// repo's own research doc (docs/prediction-research-eval.md:175-186) places opponent strength
// explicitly out of scope for projectedPPG. This guard keeps it out regardless of who renders it.
describe('opponentStrength stays view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} does not import opponentStrength`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*opponentStrength['"]/)
      expect(src).not.toMatch(/buildFpaTable|rankFpaTable|computeFpaPerGame/)
      expect(src).not.toMatch(/buildDefenceSeasonAllowed|computeYardsPerGame|defenceLoadPlan|loadDefenceWeeklyRows|defenceWeekly/)
    })
  }

  it('opponentStrength.js imports nothing from projection/scoring', () => {
    const src = readFileSync('src/utils/opponentStrength.js', 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*(seasonProjection|dynastyScore|projectionSignals|usageMetrics)['"]/)
  })

  // defence-numbers-rebuild.md §9.8 — App.jsx may hold `defenceAllowed` only as its own memo and
  // as the prop to the three view surfaces; nothing in the playerRows chain may read it.
  it('App.jsx references defenceAllowed only in its memo and the three view-surface props', () => {
    const lines = readFileSync('src/App.jsx', 'utf8').split('\n')
      .filter(l => l.includes('defenceAllowed') && !/^\s*(\/\/|\{?\/\*)/.test(l))
    const offenders = lines.filter(l => l.trim() !== 'const defenceAllowed = useMemo(() => {'
      && l.trim() !== 'defenceAllowed={defenceAllowed}')
    expect(offenders).toEqual([])
    expect(lines.filter(l => l.trim() === 'defenceAllowed={defenceAllowed}').length).toBe(3)
  })
})

// W2b-1 — the league-starter percentile basis is view-only too.
describe('percentile modules stay view-only', () => {
  // T25
  for (const f of PIPELINE) {
    it(`${f} does not import starterPercentiles, percentileColour or usagePercentiles`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*(starterPercentiles|percentileColour|usagePercentiles)['"]/)
    })
  }

  // T25b — App.jsx may hold the basis only in its own memos/effect and the two view props (/week's
  // and My Team's); nothing in the playerRows chain may read it.
  it('App.jsx references the starter basis only in its memos, effect guard and the /week and My Team props', () => {
    const lines = readFileSync('src/App.jsx', 'utf8').split('\n')
      .filter(l => /\b(liveStarterPool|priorStarterPool|starterPercentiles|starterNeedsPrior)\b/.test(l) && !/^\s*(\/\/|\{?\/\*)/.test(l))
      .map(l => l.trim())
    expect(lines).toEqual([
      "} from './utils/starterPercentiles'",
      'const liveStarterPool = useMemo(() => {',
      'const priorStarterPool = useMemo(() => {',
      'const starterPercentiles = useMemo(() => {',
      'live: liveStarterPool, prior: priorStarterPool,',
      '}, [selectedLeague, liveStarterPool, priorStarterPool, nflState, priorStarterWeeks, leagueData, careerStats, defenceWeeklyByYear])',
      'const starterNeedsPrior = starterPercentiles.needsPrior',
      'if (!starterNeedsPrior || !leagueId || !prevId) return',
      '}, [selectedLeague, starterNeedsPrior])',
      'percentileBasis={starterPercentiles}',
      'percentileBasis={starterPercentiles}',
    ])
  })
})
