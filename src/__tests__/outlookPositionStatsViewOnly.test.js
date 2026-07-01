import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// All projection/scoring modules in src/utils — the complete list.
// outlookPositionStats.js imports from efficiencyMetrics.js (a projection module),
// so the reverse-coupling guard (no projection module imports back) matters here.
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

describe('outlookPositionStats stays view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} does not import outlookPositionStats`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*outlookPositionStats['"]/)
    })
  }
})
