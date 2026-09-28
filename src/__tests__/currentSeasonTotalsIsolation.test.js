import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import { deriveDataSeason } from '../utils/environment'
import { computeNextSeasonProjection } from '../utils/seasonProjection'
import { computeDynastyScore } from '../utils/dynastyScore'
import { computeQBQualityByTeam } from '../utils/teamContext'
import { buildScoringPosteriors, applyInSeasonProjection, buildInSeasonLevel, withBaseDynastyScores } from '../utils/inSeasonScoring'
import { buildProjectionSnapshot } from '../utils/projectionSnapshot'
import {
  makeVet, makeRookie, makeSeasonEntry, defaultCurves, DEFAULT_PEAK_PPG, defaultPPRScoring,
} from '../__fixtures__/factories'

// in-season-evidence-2b-2 — the live season reaches scoring only through src/utils/inSeasonScoring.js,
// and the snapshot's `projection` is byte-identical with the live season loaded or not. History: this
// file began (in-season-app-read.md) as "no scoring module reads currentSeasonTotals"; 2b-2 turned scoring
// on through one named seam, so the guard now pins the seam's exact reach: the displayed projection
// (applyInSeasonProjection), the dynasty level of the standard and SHORT-recent populations
// (buildInSeasonLevel → computeDynastyScore's inSeasonLevel) and the prospect score of years_exp 0/1
// players (buildProspectLevel → computeDynastyScore's prospectLevel), and nothing else. The name is kept for history continuity.

// All projection/scoring modules in src/utils — the complete list, same as the other view-only
// guards (opponentStrengthViewOnly.test.js, teamContextViewOnly.test.js, etc). A missed module is a
// hole in the decoupling contract.
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

// Copied from inSeasonEvidenceViewOnly.test.js: every module specifier of a file.
const MODULE_SPEC_RE = /(?:from|import)\s*['"]([^'"]+)['"]/g
const moduleSpecifiers = src => [...src.matchAll(MODULE_SPEC_RE)].map(m => m[1])

// Copied from projectionInputsGuard.test.js: the balanced-paren argument list of the FIRST `name(` call.
function extractCall(source, name, from = 0) {
  const start = source.indexOf(`${name}(`, from)
  if (start === -1) throw new Error(`${name}( not found in src/App.jsx`)
  let depth = 0
  let i = start + name.length
  const argsStart = i
  for (; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')') {
      depth--
      if (depth === 0) return { text: source.slice(argsStart, i + 1), end: i + 1 }
    }
  }
  throw new Error(`unbalanced parens reading ${name}( call in src/App.jsx`)
}
const callArgs = (source, name) => extractCall(source, name).text
const allCallArgs = (source, name) => {
  const out = []
  for (let from = 0; source.indexOf(`${name}(`, from) !== -1;) {
    const c = extractCall(source, name, from)
    out.push(c.text); from = c.end
  }
  return out
}

describe('the pipeline modules see the live season only through dynastyScore.js\'s inSeasonLevel', () => {
  for (const f of PIPELINE) {
    it(`${f} does not reference currentSeasonTotals / loadCurrentSeasonTotals, nor import the seam modules`, () => {
      const src = readFileSync(f, 'utf8')
      expect(src).not.toMatch(/currentSeasonTotals/)
      expect(src).not.toMatch(/loadCurrentSeasonTotals/)
      expect(moduleSpecifiers(src).filter(m => /inSeasonScoring$|inSeasonEvidence$|frozenPrior$|inSeasonConstants$/.test(m)), f).toEqual([])
    })
  }

  it('dynastyScore.js matches /inSeasonLevel/ and no other pipeline module does', () => {
    const withLevel = PIPELINE.filter(f => /inSeasonLevel/.test(readFileSync(f, 'utf8')))
    expect(withLevel).toEqual(['src/utils/dynastyScore.js'])
  })
})

describe('App.jsx call sites route the live season only through the seam', () => {
  const app = readFileSync('src/App.jsx', 'utf8')
  const LIVE = /currentSeasonTotals|scoringPosteriors|frozenPrior|inSeasonLevel|prospectLevel|scoredSeasonProjections|liveSeasonUsable/g
  const liveIds = text => [...new Set(text.match(LIVE) ?? [])].sort()

  it('the main computeDynastyScore( call receives inSeasonLevel and no other live-season identifier', () => {
    const call = callArgs(app, 'computeDynastyScore')
    expect(call).toMatch(/\binSeasonLevel\b/)
    expect(call).not.toMatch(/currentSeasonTotals|scoringPosteriors|frozenPrior|scoredSeasonProjections/)
  })

  it('the QB-quality base call passes literal null for the level, and there are exactly three calls', () => {
    const calls = allCallArgs(app, 'computeDynastyScore')
    expect(calls.length).toBe(3)
    expect(calls[0]).toMatch(/inSeasonLevel/)
    expect(calls[0]).not.toMatch(/prospectLevel/)
    expect(calls[1]).not.toMatch(/inSeasonLevel|prospectLevel|currentSeasonTotals|scoringPosteriors|frozenPrior/)
    expect(calls[1].replace(/\s+/g, ' ')).toMatch(/positionBasisScale, null,? ?\)$/)
    // the playerRowsWithProspect call: literal null level, prospectLevel, and no other live identifier
    expect(calls[2].replace(/\s+/g, ' ')).toMatch(/positionBasisScale, null, prospectLevel,? ?\)$/)
    expect(calls[2]).not.toMatch(/inSeasonLevel|currentSeasonTotals|scoringPosteriors|frozenPrior|scoredSeasonProjections/)
  })

  it('prospectLevel is read by dynastyScore.js alone among the pipeline modules', () => {
    expect(readFileSync('src/utils/dynastyScore.js', 'utf8')).toMatch(/prospectLevel/)
    expect(PIPELINE.filter(f => f !== 'src/utils/dynastyScore.js' && /prospectLevel/.test(readFileSync(f, 'utf8')))).toEqual([])
  })

  it('buildProspectLevel( receives only currentSeasonTotals; buildRookieDynastyPriors( receives no live identifier, ktcMap or collegeStats', () => {
    expect(liveIds(callArgs(app, 'buildProspectLevel'))).toEqual(['currentSeasonTotals'])
    const rp = callArgs(app, 'buildRookieDynastyPriors')
    expect(liveIds(rp)).toEqual([])
    expect(rp).not.toMatch(/ktcMap|collegeStats/)
  })

  it('prospectPrior.js forces ktcMap and collegeStats to null after the spread', () => {
    const src = readFileSync('src/utils/prospectPrior.js', 'utf8')
    expect(callArgs(src, 'computeNextSeasonProjection')).toMatch(/\.\.\.projectionArgs,[^}]*ktcMap: null, collegeStats: null/)
  })

  it('computeNextSeasonProjection( receives none of the live-season identifiers', () => {
    expect(liveIds(callArgs(app, 'computeNextSeasonProjection'))).toEqual([])
  })

  it('writeProjectionSnapshot( and buildScoringPosteriors( receive the RAW seasonProjections, never the scored copy', () => {
    for (const name of ['writeProjectionSnapshot', 'buildScoringPosteriors']) {
      const call = callArgs(app, name)
      expect(call, name).toMatch(/\bseasonProjections,/)
      expect(call, name).not.toMatch(/scoredSeasonProjections/)
    }
  })

  it('the live-data identifiers passed to each seam builder are exactly the allowed ones', () => {
    // scoringPosteriors is applyInSeasonProjection's input by design (it is the seam's own output).
    expect(liveIds(callArgs(app, 'buildInSeasonLevel'))).toEqual(['currentSeasonTotals'])
    expect(liveIds(callArgs(app, 'buildScoringPosteriors'))).toEqual(['currentSeasonTotals', 'frozenPrior'])
    expect(liveIds(callArgs(app, 'applyInSeasonProjection'))).toEqual(['currentSeasonTotals', 'scoringPosteriors'])
  })
})

// The firewall: computeQBQualityByTeam reads a QB row's dynastyScore.score, and its two maps feed
// computeNextSeasonProjection (Step 7b) and the dynasty QB modifier. If a QB's level-adjusted score
// reached either map the live season would move the raw projection and the snapshot's `projection`.
describe('QB-quality firewall', () => {
  const app = readFileSync('src/App.jsx', 'utf8')

  it('playerRowsWithProspect maps playerRowsWithKTC; playerRowsWithQBMod reads it, never playerRowsWithKTC', () => {
    expect(app).toMatch(/const playerRowsWithProspect = useMemo\([\s\S]*?playerRowsWithKTC\.map\(/)
    const start = app.indexOf('const playerRowsWithQBMod = useMemo')
    const end = app.indexOf('[playerRowsWithProspect, qbQualityByTeam])', start)
    expect(end).toBeGreaterThan(start)
    const body = app.slice(start, end)
    expect(body).toMatch(/playerRowsWithProspect/)
    expect(body).not.toMatch(/playerRowsWithKTC/)
  })

  it('both computeQBQualityByTeam( memos read qbQualityRows, never the level-adjusted rows', () => {
    const calls = allCallArgs(app, 'computeQBQualityByTeam')
    expect(calls.length).toBe(2)
    for (const c of calls) {
      expect(c).toMatch(/^\(qbQualityRows,/)
      expect(c).not.toMatch(/playerRowsWithKTC|playerRows\b/)
    }
  })

  it('qbQualityRows is built by withBaseDynastyScores(, and dynastyScoreBase is read nowhere else', () => {
    expect(app).toMatch(/const qbQualityRows = useMemo\(\s*\(\) => withBaseDynastyScores\(playerRowsWithKTC\),/)
    const readers = readFileSync('src/App.jsx', 'utf8').split('\n').filter(l => /dynastyScoreBase/.test(l) && !/^\s*\/\//.test(l))
    // the declaration and the row push — two code lines; the qbQualityRows memo now reads it only
    // indirectly through withBaseDynastyScores in inSeasonScoring.js
    expect(readers.length).toBe(2)
    for (const f of ['src/utils/teamContext.js', 'src/utils/seasonProjection.js', 'src/utils/dynastyScore.js', 'src/components/market/Market.jsx']) {
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/dynastyScoreBase/)
    }
  })

  it('the dynastyScoreBase condition is the Map-existence form, not per-entry gating (fix pass 2 item 1)', () => {
    // A regression to `.has(playerId)` reopens the QB-quality leak (Verification record): a level-free
    // QB1's score would then leak into qbQualityByTeamRostered/qbQualityByTeam because it would never
    // get a dynastyScoreBase, so qbQualityRows would carry its level-adjusted dynastyScore instead.
    const start = app.indexOf('const dynastyScoreBase =')
    expect(start).toBeGreaterThan(-1)
    const end = app.indexOf(': null', start) + ': null'.length
    expect(end).toBeGreaterThan(start)
    const expr = app.slice(start, end)
    expect(expr).toMatch(/inSeasonLevel != null && inSeasonLevel\.size > 0/)
    expect(expr).not.toMatch(/\.has\(playerId\)/)
  })

  it('behaviour: the pool couples all QBs — a level-free QB1 still moves via peers, so the firewall must key on the Map\'s existence, not membership', () => {
    // Three same-position QBs, all components-path (S-1 gp >= 8). Two land in the level Map at raised
    // values; the third is absent from the Map entirely, but its percentile is still ranked against the
    // other two's updated levels (recencyWeightedPPG's pool, dynastyScore.js §3).
    const playersMap = {
      qb1: { position: 'QB', age: 26, years_exp: 5 },
      qb2: { position: 'QB', age: 27, years_exp: 6 },
      qb3: { position: 'QB', age: 28, years_exp: 7 },
    }
    const careerStats = {
      2023: { qb1: makeSeasonEntry(280, 14), qb2: makeSeasonEntry(260, 14), qb3: makeSeasonEntry(300, 14) },
      2024: { qb1: makeSeasonEntry(250, 14), qb2: makeSeasonEntry(240, 14), qb3: makeSeasonEntry(230, 14) },
    }
    const level = new Map([['qb1', 30], ['qb2', 28]])  // qb3 absent — its own level never moves
    const scoreOf = (id, lvl) => computeDynastyScore(id, playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG, null,
      defaultPPRScoring(), null, null, { [id]: { depthOrder: 1 } }, null, null, null, lvl)

    // As App does: dynastyScore uses the shared level Map; dynastyScoreBase is computed with null
    // whenever ANY level exists — including for qb3, which is not itself in the Map.
    const ids = ['qb1', 'qb2', 'qb3']
    const rows = ids.map((id, i) => ({
      player_id: id, position: 'QB', nfl_team: `T${i}`, ownerTeamName: 'Me', currentSeasonPPG: 18,
      dynastyScore: scoreOf(id, level),
      dynastyScoreBase: scoreOf(id, null),
    }))
    const noLiveRows = rows.map(r => ({ ...r, dynastyScore: r.dynastyScoreBase }))

    expect(computeQBQualityByTeam(withBaseDynastyScores(rows), null, true))
      .toEqual(computeQBQualityByTeam(noLiveRows, null, true))

    // Proves the test exercises the pool: qb3's own level never took live input, yet its with-Map
    // score (ranked against qb1/qb2's raised levels) differs from its level-free base.
    const qb3 = rows.find(r => r.player_id === 'qb3')
    expect(qb3.dynastyScore.score).not.toBe(qb3.dynastyScoreBase.score)
  })
})

// The snapshot's `projection` is the raw prior: applying the seam to the DISPLAY map must not touch it.
describe('the snapshot projection is byte-identical with the live season loaded or not', () => {
  const deepFreeze = o => { Object.values(o).forEach(v => v && typeof v === 'object' && deepFreeze(v)); return Object.freeze(o) }
  const vet = makeVet({ playerId: 'V1' })
  const rookie = makeRookie({ playerId: 'R1' })
  const playerMap = { ...vet.asOptions().playersMap, ...rookie.asOptions().playersMap }
  const seasonProjections = {
    V1: computeNextSeasonProjection(vet.asOptions()),
    R1: computeNextSeasonProjection(rookie.asOptions()),
  }
  const careerStats = vet.asOptions().careerStats
  const liveSeason = { season: 2025, complete: true, players: {
    V1: { gamesPlayed: 3, fantasyPoints: 90, scoringBasis: 'league' },     // 30 ppg — far from any prior
    R1: { gamesPlayed: 3, fantasyPoints: 60, scoringBasis: 'league' },
  } }
  const posteriors = buildScoringPosteriors({
    seasonProjections, careerStats, dataSeason: 2024, playerMap, currentSeasonTotals: liveSeason,
    projectionBasis: 'league', frozenPrior: { status: 'none', reason: 'no-snapshot' },
  })
  const snapArgs = extra => ({
    seasonProjections, playerMap, ktcMap: null, playerRows: [], scoringSettings: null, leagueId: 'L1',
    currentSeason: 2024, now: new Date('2026-09-27T12:00:00Z'), ...extra,
  })

  it('fixtures are live: both players have records and the vet is a standard veteran', () => {
    expect(posteriors.size).toBe(2)
    expect(posteriors.get('V1').population).toBe('standard')
    expect(posteriors.get('R1').population).toBe('ROOKIE0')
    expect(seasonProjections.V1.projectedPPG).toBeGreaterThan(0)
  })

  it('every snapshot players[id].projection is JSON-identical, and stripping inSeason from B gives A', () => {
    const A = buildProjectionSnapshot(snapArgs({}))
    deepFreeze(seasonProjections); deepFreeze(liveSeason); deepFreeze(posteriors.get('V1')); deepFreeze(posteriors.get('R1'))
    const scored = applyInSeasonProjection(seasonProjections, posteriors, liveSeason)     // frozen inputs: throws if it mutates
    const B = buildProjectionSnapshot(snapArgs({ scoringPosteriors: posteriors }))
    for (const id of Object.keys(A.players)) {
      expect(JSON.stringify(B.players[id].projection), id).toBe(JSON.stringify(A.players[id].projection))
    }
    const stripped = JSON.parse(JSON.stringify(B))
    for (const p of Object.values(stripped.players)) delete p.inSeason
    expect(stripped).toEqual(JSON.parse(JSON.stringify(A)))
    // ...and the seam did something: the DISPLAY map moved while the snapshot stayed put.
    expect(scored.V1.projectedPPG).not.toBe(seasonProjections.V1.projectedPPG)
    expect(scored.R1.projectedPPG).not.toBe(seasonProjections.R1.projectedPPG)
    expect(B.players.V1.projection.projectedPPG).toBe(seasonProjections.V1.projectedPPG)
    expect(B.players.V1.inSeason.ros.value).toBe(scored.V1.inSeason.ros.value)
  })
})

describe('the dynasty score is unchanged at n = 0', () => {
  const playersMap = { tgt: { position: 'RB', age: 26, years_exp: 5 }, pa: { position: 'RB', age: 26, years_exp: 5 } }
  const careerStats = {
    2023: { tgt: makeSeasonEntry(140, 14), pa: makeSeasonEntry(112, 14) },
    2024: { tgt: makeSeasonEntry(168, 14), pa: makeSeasonEntry(126, 14) },
  }
  const score = level => computeDynastyScore('tgt', playersMap, careerStats, defaultCurves(), DEFAULT_PEAK_PPG, null,
    defaultPPRScoring(), null, null, { tgt: { depthOrder: 1 } }, null, null, null, level)

  it('null, an empty Map and a Map at exactly the player\'s S-1 PPG return the same result', () => {
    const base = score(null)
    expect(score(new Map())).toEqual(base)
    expect(score(new Map([['tgt', 12]]))).toEqual(base)          // 168 / 14
  })

  it('buildInSeasonLevel omits an n = 0 SHORT-recent id', () => {
    const cs = { 2023: { tgt: makeSeasonEntry(140, 14) }, 2024: { tgt: makeSeasonEntry(40, 5) } }
    const m = buildInSeasonLevel({
      careerStats: cs, dataSeason: 2024, playerMap: playersMap, projectionBasis: 'league',
      currentSeasonTotals: { season: 2025, complete: true, players: { tgt: { gamesPlayed: 0, fantasyPoints: 0, scoringBasis: 'league' } } },
    })
    expect(m.size).toBe(0)
  })

  it('buildInSeasonLevel omits n = 0 ids, so an unplayed veteran is never in the Map', () => {
    const m = buildInSeasonLevel({
      careerStats, dataSeason: 2024, playerMap: playersMap, projectionBasis: 'league',
      currentSeasonTotals: { season: 2025, complete: true, players: { tgt: { gamesPlayed: 0, fantasyPoints: 0, scoringBasis: 'league' } } },
    })
    expect(m.size).toBe(0)
  })
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
    const start = src.indexOf('loadCurrentSeasonTotals(season,')
    expect(start).toBeGreaterThan(-1)
    // The effect body is short — bound the slice to the next `}, [` dependency-array close, which
    // every useEffect in this file ends with.
    const end = src.indexOf('}, [', start) + 200
    const body = src.slice(start, end)
    expect(body).toMatch(/setCurrentSeasonTotals/)
    expect(body).not.toMatch(/setCareerStats/)
  })
})

// season-rescore.md fix pass 1, item 2 — live-season rows are now league-scoped (rescored with
// leagueData.scoringSettings), so every place App.jsx resets careerStats on a league change must
// also reset currentSeasonTotals, and the loader effect must wait for leagueData and pass its
// scoring settings through.
describe('live-season rows are league-scoped (season-rescore)', () => {
  it('every careerStats reset also clears the live rows', () => {
    const src = readFileSync('src/App.jsx', 'utf8')
    const resetLines = src.split('\n').filter(line => line.includes('setCareerStats(null)'))
    expect(resetLines.length).toBe(3)
    for (const line of resetLines) {
      expect(line).toMatch(/setCurrentSeasonTotals\(null\)/)
    }
  })

  it('the effect waits for the league and passes its scoring settings', () => {
    const src = readFileSync('src/App.jsx', 'utf8')
    const callIdx = src.indexOf('loadCurrentSeasonTotals(season,')
    expect(callIdx).toBeGreaterThan(-1)
    const effectStart = src.lastIndexOf('useEffect(() => {', callIdx)
    expect(effectStart).toBeGreaterThan(-1)
    const depsStart = src.indexOf('}, [', callIdx)
    expect(depsStart).toBeGreaterThan(-1)
    const depsEnd = src.indexOf('])', depsStart)
    expect(depsEnd).toBeGreaterThan(depsStart)
    const slice = src.slice(effectStart, depsEnd + 2)
    expect(slice).toMatch(/!leagueData/)
    expect(slice).toMatch(/loadCurrentSeasonTotals\(season, leagueData\.scoringSettings, leagueData\.playerMap\)/)
    expect(slice).toMatch(/\}, \[nflState, leagueData\]\)/)
  })
})
