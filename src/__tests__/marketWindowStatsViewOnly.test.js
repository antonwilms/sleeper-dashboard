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

describe('marketWindowStats / marketMetrics / marketAdvanced stay view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} imports neither module`, () => {
      expect(specs(f).filter(s => /marketWindowStats|marketMetrics|marketAdvanced|marketWeekly/.test(s))).toEqual([])
    })
    it(`${f} imports neither fact-view file`, () => {
      expect(specs(f).filter(s => /factViews|FactTable/.test(s))).toEqual([])
    })
  }
  it('marketWindowStats.js imports exactly ./efficiencyMetrics and ./marketWeekly', () => {
    expect(specs('src/utils/marketWindowStats.js').sort()).toEqual(['./efficiencyMetrics', './marketWeekly'])
  })
  it('marketWeekly.js imports exactly ./playerTeam and ./teamContext, naming only resolvePlayerTeam and isTeamAggregateId', () => {
    const src = readFileSync('src/utils/marketWeekly.js', 'utf8')
    expect(specs('src/utils/marketWeekly.js').sort()).toEqual(['./playerTeam', './teamContext'])
    const named = [...src.matchAll(/import\s*\{([^}]*)\}\s*from/g)]
      .flatMap(m => m[1].split(',').map(n => n.trim()).filter(Boolean)).sort()
    expect(named).toEqual(['isTeamAggregateId', 'resolvePlayerTeam'])
  })
  it('marketMetrics.js imports exactly ./metricGlossary (pure copy, no imports of its own)', () => {
    expect(specs('src/utils/marketMetrics.js')).toEqual(['./metricGlossary'])
    expect(specs('src/utils/metricGlossary.js')).toEqual([])
  })
  it('marketAdvanced.js imports exactly ./liveAdvStats', () => {
    expect(specs('src/utils/marketAdvanced.js')).toEqual(['./liveAdvStats'])
  })
  it('none of the four imports the in-season modules or the api layer', () => {
    for (const f of ['src/utils/marketWindowStats.js', 'src/utils/marketMetrics.js', 'src/utils/marketAdvanced.js', 'src/utils/marketWeekly.js']) {
      expect(specs(f).filter(s => /inSeasonEvidence|inSeasonScoring|\/api\//.test(s))).toEqual([])
    }
  })
  it('factViews.js imports exactly marketMetrics and metricGlossary', () => {
    expect(specs('src/components/market/factViews.js').sort()).toEqual(['../../utils/marketMetrics', '../../utils/metricGlossary'])
  })
  it('FactTable.jsx imports exactly its table, cells, sort util, descriptors and react', () => {
    expect(specs('src/components/market/FactTable.jsx').sort())
      .toEqual(['../../utils/sortUtils', '../dp/MarketTable', '../dp/cells', './factViews', 'react'])
  })
  it('the fact-view files never import the in-season modules, the api layer or marketWindowStats', () => {
    for (const f of ['src/components/market/factViews.js', 'src/components/market/FactTable.jsx']) {
      expect(specs(f).filter(s => /inSeasonEvidence|inSeasonScoring|\/api\/|marketWindowStats/.test(s))).toEqual([])
    }
  })
})
