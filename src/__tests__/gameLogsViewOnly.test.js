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

describe('gamelogs stays view-only (C1)', () => {
  for (const f of PIPELINE) {
    it(`${f} does not import nflGameLogs / loadNflGameLogs`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*nflGameLogs['"]/)
      expect(src).not.toMatch(/loadNflGameLogs/)
    })
  }

  it('nflGameLogs.js imports nothing from projection/scoring', () => {
    const src = readFileSync('src/api/nflGameLogs.js', 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*(seasonProjection|dynastyScore|projectionSignals|usageMetrics)['"]/)
  })
})
