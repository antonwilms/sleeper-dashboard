// Golden generator core for the data repo's dynasty-score mirror (CR-32). Pure: no I/O.
// Runs the app's OWN functions on a fixed input and returns what the mirror (data repo
// lib/dynastyMirror.mjs) must reproduce. Never imported by src/.
import { computeDynastyScore, computeEmpiricalAgeCurves } from '../../../src/utils/dynastyScore.js'
import {
  computeTeamContext, computeHistoricalTeamTotals, computeHistoricalShares,
  applyQBQualityModifier, isTeamAggregateId,
} from '../../../src/utils/teamContext.js'

const MODES = ['current-team', 'per-season-team']
const QB_QUALITY_LEVELS = [30, 85]

// Runs fn with Date's no-argument construction and Date.now() pinned to `${year}-06-01T12:00:00Z`
// (computeEmpiricalAgeCurves reads the wall-clock year) and console.log/warn/info silenced; always restores.
function withPinnedEnv(year, fn) {
  const RealDate = globalThis.Date
  const fixed = RealDate.parse(`${year}-06-01T12:00:00Z`)
  class PinnedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed)
      else super(...args)
    }
    static now() { return fixed }
  }
  const saved = { log: console.log, warn: console.warn, info: console.info }
  globalThis.Date = PinnedDate
  console.log = () => {}
  console.warn = () => {}
  console.info = () => {}
  try {
    return fn()
  } finally {
    globalThis.Date = RealDate
    console.log = saved.log
    console.warn = saved.warn
    console.info = saved.info
  }
}

// inputs: { S, currentYear, scoringSettings, playersMap, depthMap, careerStats }
export function buildDynastyGolden(inputs) {
  const { S, currentYear, scoringSettings, playersMap, depthMap, careerStats } = inputs
  return withPinnedEnv(currentYear, () => {
    const { curves, positionPeakPPG, positionPeakAge, positionBasisScale } = computeEmpiricalAgeCurves(careerStats, playersMap)

    // The app function has no TEAM_* filter in computeTeamContext; the per-season-team golden is the app
    // function on input with season S's TEAM_* rows removed (the mirror's deliberate fix).
    const statsWithoutAggS = { ...careerStats, [S]: Object.fromEntries(Object.entries(careerStats[S] ?? {}).filter(([id]) => !isTeamAggregateId(id))) }

    const teamContext = {}
    const historicalShares = {}
    const scores = {}
    for (const mode of MODES) {
      const tcStats = mode === 'per-season-team' ? statsWithoutAggS : careerStats
      teamContext[mode] = computeTeamContext(tcStats, playersMap, S, { attribution: mode })
      const totals = computeHistoricalTeamTotals(careerStats, playersMap, { attribution: mode })
      historicalShares[mode] = computeHistoricalShares(careerStats, playersMap, totals, { attribution: mode })
      scores[mode] = {}
      for (const pid of Object.keys(playersMap)) {
        scores[mode][pid] = computeDynastyScore(
          pid, playersMap, careerStats, curves, positionPeakPPG, null, scoringSettings, null,
          teamContext[mode], depthMap, historicalShares[mode], positionPeakAge, positionBasisScale, null, null,
        )
      }
    }

    // QB-quality modifier on every components-path non-QB row of the per-season-team scores.
    const teams = [...new Set(Object.values(playersMap).map(p => p.team).filter(Boolean))]
    const qbMod = {}
    for (const level of QB_QUALITY_LEVELS) {
      const map = Object.fromEntries(teams.map(t => [t, level]))
      qbMod[level] = {}
      for (const [pid, res] of Object.entries(scores['per-season-team'])) {
        const p = playersMap[pid]
        if (!res.components || p.position === 'QB') continue
        const row = { position: p.position, nfl_team: p.team, dynastyScore: res }
        qbMod[level][pid] = applyQBQualityModifier(row, map).dynastyScore
      }
    }

    return { S, curves, positionPeakPPG, positionPeakAge, positionBasisScale, teamContext, historicalShares, scores, qbMod }
  })
}
