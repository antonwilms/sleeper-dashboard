import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// in-season-evidence-1-view.md §6.2 — the structural guarantee that Market's in-season display module
// (inSeasonEvidence, opportunity-only since 2b-2) is view-only: nothing it computes reaches
// `seasonProjections`, `playerRows`, a snapshot or a score. in-season-evidence-2b-1 §7.6 added the
// controlled seam beside it — inSeasonScoring is the one route by which the live season reaches scoring —
// and 2b-2 §5.1 widened that seam block to the display and dynasty-level consumers it now feeds.

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

  it('inSeasonEvidence.js imports exactly ./blendWeights and ./inSeasonConstants', () => {
    const src = readFileSync('src/utils/inSeasonEvidence.js', 'utf8')
    expect(moduleSpecifiers(src)).toEqual(['./blendWeights', './inSeasonConstants'])
  })

  it('the extractor can see a multi-line import and an inline export…from (self-check)', () => {
    const sample = `import {\n  a,\n  b,\n} from './multi'\nexport { c } from './inline'\nimport './sideEffect'`
    expect(moduleSpecifiers(sample)).toEqual(['./multi', './inline', './sideEffect'])
  })
})

// in-season-evidence-2b-1 §7.6, extended by 2b-2 §5.1 — the in-season scoring seam.
describe('the in-season scoring seam (2b-1, 2b-2)', () => {
  const nonTestFiles = () => {
    const files = []
    const walk = dir => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name)
        if (e.isDirectory()) walk(full)
        else if (/\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name)) files.push(full)
      }
    }
    walk('src')
    return files
  }
  const app = readFileSync('src/App.jsx', 'utf8')
  // The slice from `start` to the close of the first `])` after the next `}, [` (a useMemo/useEffect with its deps).
  const hookSlice = start => {
    const s = app.indexOf(start)
    expect(s, start).toBeGreaterThan(-1)
    return [s, app.indexOf('])', app.indexOf('}, [', s)) + 2]
  }

  // The scored-projection memo is a one-expression useMemo (no `}, [` deps close): slice to its own `])`.
  const scoredStart = app.indexOf('const scoredSeasonProjections = useMemo(')
  const scoredMemoSlice = [scoredStart, app.indexOf('])', scoredStart) + 2]

  it('the only non-test importers of inSeasonScoring are App.jsx and api/frozenPrior.js — Market gets records as props', () => {
    const importers = nonTestFiles()
      .filter(f => moduleSpecifiers(readFileSync(f, 'utf8')).some(s => /inSeasonScoring(\.js)?$/.test(s)))
      .sort()
    expect(importers).toEqual(['src/App.jsx', 'src/api/frozenPrior.js'])
    expect(moduleSpecifiers(readFileSync('src/components/market/Market.jsx', 'utf8')).filter(s => /inSeasonScoring/.test(s))).toEqual([])
  })

  it('inSeasonScoring.js imports exactly ./inSeasonConstants', () => {
    expect(moduleSpecifiers(readFileSync('src/utils/inSeasonScoring.js', 'utf8'))).toEqual(['./inSeasonConstants'])
  })

  it('in App.jsx the identifier scoringPosteriors appears only in its memo, the scored-projection memo, the snapshot effect and the <Market element', () => {
    const allowed = [
      hookSlice('const scoringPosteriors = useMemo('),
      scoredMemoSlice,                                             // applyInSeasonProjection's args
      hookSlice('shouldWriteProjectionSnapshot({'),
    ]
    const mStart = app.search(/^\s*<Market\s*$/m)      // the JSX element, not a comment naming it
    expect(mStart).toBeGreaterThan(-1)
    allowed.push([mStart, app.indexOf('/>', mStart) + 2])         // the <Market element's props
    allowed.sort((x, y) => x[0] - y[0])
    let outside = '', cursor = 0
    for (const [s, e] of allowed) { outside += app.slice(cursor, s); cursor = e }
    outside += app.slice(cursor)
    // comments may name the identifier; code may not
    const code = outside.split('\n').filter(l => !/^\s*(\/\/|\{\/\*|\*)/.test(l)).join('\n')
    expect(code.match(/\bscoringPosteriors\b/g) ?? []).toEqual([])
    // ...and each allowed site genuinely uses it (the guard is not vacuous)
    for (const [s, e] of allowed) expect(app.slice(s, e)).toMatch(/\bscoringPosteriors\b/)
  })

  it("writeProjectionSnapshot's argument object still passes the raw seasonProjections map", () => {
    const start = app.indexOf('writeProjectionSnapshot({')
    expect(start).toBeGreaterThan(-1)
    const body = app.slice(start, app.indexOf('})', start))
    expect(body).toMatch(/\bseasonProjections,/)
    expect(body).not.toMatch(/scoredSeasonProjections/)
  })

  it('no PIPELINE module imports inSeasonScoring, inSeasonConstants or frozenPrior', () => {
    for (const f of PIPELINE) {
      const specs = moduleSpecifiers(readFileSync(f, 'utf8'))
      expect(specs.filter(s => /inSeasonScoring|inSeasonConstants|frozenPrior/.test(s)), f).toEqual([])
    }
  })
})
