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
