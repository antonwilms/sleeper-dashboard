import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'

// weekly-decision-1-lineup.md §8/§4 — view-only guard for the new /week surface. Modelled on
// currentSeasonTotalsIsolation.test.js: no projection/scoring module may import any module this
// slice adds, and no src/components/week/ module may be imported outside its own folder,
// src/App.jsx, and its own tests.

// The complete PIPELINE list — REUSED VERBATIM from currentSeasonTotalsIsolation.test.js. A missed
// module is a hole in the decoupling contract; do not hand-maintain a second copy that can drift.
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

describe('the weekly-decision surface stays view-only', () => {
  for (const f of PIPELINE) {
    it(`${f} does not reference blendWeights / weeklyUsage / weeklyLineup / weeklySchedule / rosterSlots / useWeeklyDecision / getWeeklyStatRows / getWeeklyProjectionRows`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/from\s+['"][^'"]*blendWeights['"]/)
      expect(src).not.toMatch(/from\s+['"][^'"]*weeklyUsage['"]/)
      expect(src).not.toMatch(/from\s+['"][^'"]*weeklyLineup['"]/)
      expect(src).not.toMatch(/from\s+['"][^'"]*weeklySchedule['"]/)
      expect(src).not.toMatch(/from\s+['"][^'"]*rosterSlots['"]/)
      expect(src).not.toMatch(/from\s+['"][^'"]*useWeeklyDecision['"]/)
      expect(src).not.toMatch(/getWeeklyStatRows/)
      expect(src).not.toMatch(/getWeeklyProjectionRows/)
    })
  }
})

describe('no unrendered lineup is computed in the background (weekly-decision-2a-lineup-truth.md §0)', () => {
  const files = [
    'src/utils/weeklyLineup.js',
    'src/hooks/useWeeklyDecision.js',
    ...readdirSync('src/components/week').filter(f => f.endsWith('.jsx') || f.endsWith('.js')).map(f => `src/components/week/${f}`),
  ]
  for (const f of files) {
    it(`${f} does not reference buildBestLineup`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/buildBestLineup/)
    })
  }
})

describe('src/components/week/ is imported only from its own folder, App.jsx, and its own tests', () => {
  const weekDir = 'src/components/week'
  const weekFiles = readdirSync(weekDir).filter(f => f.endsWith('.jsx') || f.endsWith('.js'))
  const weekModuleNames = weekFiles.map(f => f.replace(/\.jsx?$/, ''))

  function listSrcFiles(dir) {
    const out = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) out.push(...listSrcFiles(full))
      else if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.jsx'))) out.push(full)
    }
    return out
  }

  const allSrcFiles = listSrcFiles('src')
  const outsideFiles = allSrcFiles.filter(f => {
    if (f.startsWith(`${weekDir}/`)) return false // its own folder (incl. its own tests)
    if (f === 'src/App.jsx') return false
    return true
  })

  for (const moduleName of weekModuleNames) {
    it(`${moduleName} is not imported outside src/components/week/ or src/App.jsx`, () => {
      const offenders = []
      for (const f of outsideFiles) {
        const src = readFileSync(f, 'utf8')
        const re = new RegExp(`from\\s+['"][^'"]*${moduleName}['"]`)
        if (re.test(src)) offenders.push(f)
      }
      expect(offenders).toEqual([])
    })
  }
})
