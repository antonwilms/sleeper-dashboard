import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// COPY of the PIPELINE list in src/__tests__/scheduleViewOnly.test.js (the original) — equality is
// asserted below so the two cannot drift.
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

describe('oline / depth chart stay view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} does not import nflOline / depthChart or name loadNflOline`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*(nflOline|depthChart)['"]/)
      expect(src).not.toMatch(/loadNflOline/)
    })
  }

  for (const f of ['src/api/nflOline.js', 'src/utils/depthChart.js']) {
    it(`${f} imports nothing from the PIPELINE`, () => {
      const src = readFileSync(f, 'utf8')
      const imports = [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map(m => m[1])
      for (const p of PIPELINE) {
        const base = p.split('/').pop().replace(/\.js$/, '')
        expect(imports.some(i => i.split('/').pop() === base)).toBe(false)
      }
    })
  }

  it('PIPELINE equals scheduleViewOnly.test.js\'s PIPELINE (the original)', () => {
    const orig = readFileSync('src/__tests__/scheduleViewOnly.test.js', 'utf8')
    const block = orig.match(/const PIPELINE = (\[[\s\S]*?\n\])/)[1]
    const list = [...block.matchAll(/'([^']+)'/g)].map(m => m[1])
    expect(PIPELINE).toEqual(list)
  })
})
