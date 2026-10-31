import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// outlookPositionStatsViewOnly.test.js's PIPELINE, plus the snapshot/in-season/badge modules and App.jsx.
const PIPELINE = [
  'src/utils/seasonProjection.js',
  'src/utils/dynastyScore.js',
  'src/utils/prospectPrior.js',
  'src/utils/projectionSignals.js',
  'src/utils/usageMetrics.js',
  'src/utils/teamContext.js',
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
  'src/utils/projectionSnapshot.js',
  'src/utils/inSeasonScoring.js',
  'src/utils/dynastySignalBadges.js',
  'src/App.jsx',
]

describe('twoYearBaseline stays view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} imports neither twoYearBaseline nor TwoYearRank`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*twoYearBaseline['"]/)
      expect(src).not.toMatch(/from\s+['"][^'"]*TwoYearRank['"]/)
    })
  }

  const importsOf = f => [...readFileSync(f, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1])
  it('twoYearBaseline.js imports only ./environment', () => {
    expect(importsOf('src/utils/twoYearBaseline.js')).toEqual(['./environment'])
  })
  it('TwoYearRank.jsx imports only DefinitionPopover, twoYearBaseline', () => {
    expect(importsOf('src/components/dp/TwoYearRank.jsx').sort())
      .toEqual(['../../utils/twoYearBaseline', './DefinitionPopover'])
  })
})
