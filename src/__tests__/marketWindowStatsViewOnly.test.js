import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

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

const MODULE_SPEC_RE = /(?:from|import)\s*['"]([^'"]+)['"]/g
const specs = f => [...readFileSync(f, 'utf8').matchAll(MODULE_SPEC_RE)].map(m => m[1])

describe('marketWindowStats / marketMetrics stay view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} imports neither module`, () => {
      expect(specs(f).filter(s => /marketWindowStats|marketMetrics/.test(s))).toEqual([])
    })
  }
  it('marketWindowStats.js imports exactly its four utils', () => {
    expect(specs('src/utils/marketWindowStats.js').sort())
      .toEqual(['./efficiencyMetrics', './outlookPositionStats', './playerTeam', './teamContext'])
  })
  it('marketMetrics.js imports nothing', () => {
    expect(specs('src/utils/marketMetrics.js')).toEqual([])
  })
  it('neither imports the in-season modules or the api layer', () => {
    for (const f of ['src/utils/marketWindowStats.js', 'src/utils/marketMetrics.js']) {
      expect(specs(f).filter(s => /inSeasonEvidence|inSeasonScoring|\/api\//.test(s))).toEqual([])
    }
  })
})
