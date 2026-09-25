import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// in-season-evidence-1-view.md §6.2 — the Phase 1 structural guarantee that no posterior reaches
// `seasonProjections`, `playerRows` or a snapshot (a posterior in a snapshot writes a contaminated
// 2026 projection that can never be removed). Phase 2 rewrites this into a controlled seam
// alongside currentSeasonTotalsIsolation.test.js — rewrite it, do not delete it.

// REUSED VERBATIM from currentSeasonTotalsIsolation.test.js:12-27 — a missed module is a hole.
const PIPELINE = [
  'src/utils/seasonProjection.js',
  'src/utils/dynastyScore.js',
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
  'src/utils/ktcHistory.js',
]
const FORBIDDEN = /inSeasonEvidence|buildInSeasonPosteriors/

// fix pass 1, item 6 — one regex over the whole file text collects every module specifier: a
// multi-line `import … from '…'`, an `export … from '…'`, and a bare `import '…'`.
const MODULE_SPEC_RE = /(?:from|import)\s*['"]([^'"]+)['"]/g
function moduleSpecifiers(src) {
  return [...src.matchAll(MODULE_SPEC_RE)].map(m => m[1])
}

describe('the in-season evidence layer stays view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} does not reference inSeasonEvidence / buildInSeasonPosteriors`, () => {
      expect(readFileSync(f, 'utf8')).not.toMatch(FORBIDDEN)
    })
  }

  it('App.jsx and projectionSnapshot.js do not reference it either', () => {
    expect(readFileSync('src/App.jsx', 'utf8')).not.toMatch(FORBIDDEN)
    expect(readFileSync('src/utils/projectionSnapshot.js', 'utf8')).not.toMatch(FORBIDDEN)
  })

  it('the only non-test file importing inSeasonEvidence is market/Market.jsx', () => {
    const files = []
    const walk = dir => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name)) files.push(full)
      }
    }
    walk('src')
    const isImporter = f => moduleSpecifiers(readFileSync(f, 'utf8')).some(s => /inSeasonEvidence(\.js)?$/.test(s))
    const importers = files.filter(isImporter)
    expect(importers).toEqual(['src/components/market/Market.jsx'])
  })

  it('inSeasonEvidence.js imports nothing but ./blendWeights', () => {
    const src = readFileSync('src/utils/inSeasonEvidence.js', 'utf8')
    expect(moduleSpecifiers(src)).toEqual(['./blendWeights'])
  })

  it('the extractor can see a multi-line import and an inline export…from (self-check)', () => {
    const sample = `import {\n  a,\n  b,\n} from './multi'\nexport { c } from './inline'\nimport './sideEffect'`
    expect(moduleSpecifiers(sample)).toEqual(['./multi', './inline', './sideEffect'])
  })
})
