import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { deriveDataSeason } from '../utils/environment'

// in-season-app-read.md §3/§5 — the isolation guarantee that is the whole point of the slice:
// careerStats is not touched, dataSeason is not touched, and no scoring module reads
// currentSeasonTotals. This is the regression guard for the entire slice.

// All projection/scoring modules in src/utils — the complete list, same as the other view-only
// guards (opponentStrengthViewOnly.test.js, teamContextViewOnly.test.js, etc). A missed module is a
// hole in the decoupling contract.
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

describe('deriveDataSeason is provably independent of currentSeasonTotals', () => {
  it('takes careerStats alone (arity 1) — there is no second parameter for it to read', () => {
    expect(deriveDataSeason.length).toBe(1)
  })

  it('still returns the last COMPLETED season — careerStats is built s < currentSeason, so the live season is absent by construction regardless of what currentSeasonTotals holds', () => {
    const careerStats = { 2023: {}, 2024: {}, 2025: {} }
    expect(deriveDataSeason(careerStats)).toBe(2025)
    // Passing a currentSeasonTotals-shaped extra argument changes nothing — the function reads
    // only its first parameter.
    expect(deriveDataSeason(careerStats, { players: { x: {} }, season: 2026, complete: true })).toBe(2025)
  })
})

describe('no projection/scoring module reads currentSeasonTotals or the live-season loader', () => {
  for (const f of PIPELINE) {
    it(`${f} does not reference currentSeasonTotals / loadCurrentSeasonTotals`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/currentSeasonTotals/)
      expect(src).not.toMatch(/loadCurrentSeasonTotals/)
    })
  }
})

describe('careerStats is never written from the currentSeasonTotals loader path', () => {
  it('loadCurrentSeasonTotals never imports or calls the careerStats setter', () => {
    const src = readFileSync('src/api/sleeperStats.js', 'utf8')
    // loadCareerHistory/getSeasonTotals (the careerStats-populating functions) are defined in this
    // same file but are separate exports — assert the new loader's own body, isolated by slicing
    // from its declaration to the next top-level export, never mentions careerStats.
    const start = src.indexOf('export async function loadCurrentSeasonTotals')
    const end = src.indexOf('export async function loadCareerHistory')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const body = src.slice(start, end)
    expect(body).not.toMatch(/careerStats/)
  })

  it("App.jsx's currentSeasonTotals effect only calls setCurrentSeasonTotals, never setCareerStats", () => {
    const src = readFileSync('src/App.jsx', 'utf8')
    const start = src.indexOf('loadCurrentSeasonTotals(season)')
    expect(start).toBeGreaterThan(-1)
    // The effect body is short — bound the slice to the next `}, [` dependency-array close, which
    // every useEffect in this file ends with.
    const end = src.indexOf('}, [', start) + 200
    const body = src.slice(start, end)
    expect(body).toMatch(/setCurrentSeasonTotals/)
    expect(body).not.toMatch(/setCareerStats/)
  })
})
