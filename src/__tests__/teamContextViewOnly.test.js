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

describe('teamcontext stays view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} does not import api/teamContext or playerTeam`, () => {
      const src = readFileSync(f, 'utf8')
      // Path-qualified (per D5): src/utils/teamContext.js legitimately imports './teamContext'
      // within the pipeline — a bare /teamContext/ regex would false-positive on that.
      expect(src).not.toMatch(/from\s+['"][^'"]*api\/teamContext['"]/)
      expect(src).not.toMatch(/loadTeamContext|getTeamSeasonRows|getTeamWeekRow/)
      expect(src).not.toMatch(/from\s+['"][^'"]*playerTeam['"]/)
      expect(src).not.toMatch(/resolvePlayerTeam/)
    })
  }

  it('src/api/teamContext.js does not import these four projection/scoring modules', () => {
    const src = readFileSync('src/api/teamContext.js', 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*(seasonProjection|dynastyScore|projectionSignals|usageMetrics)['"]/)
  })

  it('src/utils/playerTeam.js does not import these four projection/scoring modules', () => {
    const src = readFileSync('src/utils/playerTeam.js', 'utf8')
    expect(src).not.toMatch(/from\s+['"][^'"]*(seasonProjection|dynastyScore|projectionSignals|usageMetrics)['"]/)
  })
})
