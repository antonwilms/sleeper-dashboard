import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// All projection/scoring modules in src/utils — the complete list.
// A missed module is a hole in the decoupling contract. Add any new
// projection/scoring modules here when they are introduced.
const PIPELINE = [
  // Core projection and dynasty pipeline
  'src/utils/seasonProjection.js',
  'src/utils/dynastyScore.js',
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
]

// advStats gained its first UI consumer in dp-v2 Slice 5b — market/Market.jsx's Efficiency column
// set renders RACR for WR/TE (AdvancedStatsPanel.jsx, the Explorer's original renderer, was
// deleted in 1b Slice viii; targetShare/airYardsShare/wopr are still unrendered). The guard still
// matters just as much with a real renderer in place: it keeps the family out of
// projection/scoring regardless of who renders it, and none of Market's rendering code lives in
// PIPELINE above, so this test is unaffected by that new consumer and stays green unchanged.
describe('advstats stay view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} does not import advStats / AdvancedStatsPanel`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*advStats['"]/)
      expect(src).not.toMatch(/AdvancedStatsPanel/)
      expect(src).not.toMatch(/loadAdvStats/)
    })
  }

  it('advStats.js imports nothing from projection/scoring', () => {
    const src = readFileSync('src/api/advStats.js', 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*(seasonProjection|dynastyScore|projectionSignals|usageMetrics)['"]/)
  })
})
