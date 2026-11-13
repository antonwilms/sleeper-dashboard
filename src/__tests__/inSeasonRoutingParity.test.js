import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, it, expect } from 'vitest'
import {
  classifyInSeasonPopulation, posteriorOf, buildQbLiveStates, buildScoringPosteriors,
} from '../utils/inSeasonScoring.js'
import {
  K_ROS_POINTS, K_ROS_POINTS_SHORT, K_ROS_POINTS_ROOKIE0, K_ROS_POINTS_ROOKIE1P,
} from '../utils/inSeasonConstants.js'
import { buildPreseasonQbShares } from '../utils/qbTakeover.js'
import { computeNextSeasonProjection } from '../utils/seasonProjection.js'
import { makeVet } from '../__fixtures__/factories.js'

// LP-1b parity fixture: a byte copy of the data repo's test/fixtures/learned-panel/inseason-routing-parity-2026-11-13.json — LP-1b's
// hand-built routing scenario and this app's outputs on it (CR-25, CR-27). The data repo's test/learned-bench.test.mjs pins the
// same SHA-256 and checks its replay (lib/learnedBench.mjs) against these outputs. Rebuild both together or neither.
const FIXTURE = 'src/__fixtures__/inseason-routing-parity-2026-11-13.json'
const FIXTURE_SHA256 = '95c356fbd95b681b1b49bfc5b67e9d750e3206907d2db37a548db83707c52841'

const raw = readFileSync(FIXTURE)
const fx = JSON.parse(raw.toString('utf8'))
const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x instanceof Map ? [...x] : x)))

// strings / integers / booleans / null exact; non-integer numbers to 1e-12
function expectSame(actual, expected, path = '') {
  if (expected === null || typeof expected !== 'object') {
    if (typeof expected === 'number' && !Number.isInteger(expected)) {
      expect(typeof actual, path).toBe('number')
      expect(Math.abs(actual - expected), `${path}: ${actual} vs ${expected}`).toBeLessThanOrEqual(1e-12)
    } else expect(actual, path).toBe(expected)
    return
  }
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true)
    expect(actual.length, `${path} length`).toBe(expected.length)
    expected.forEach((e, i) => expectSame(actual[i], e, `${path}[${i}]`))
    return
  }
  expect(actual && typeof actual === 'object', path).toBe(true)
  expect(Object.keys(actual).sort(), `${path} keys`).toEqual(Object.keys(expected).sort())
  for (const k of Object.keys(expected)) expectSame(actual[k], expected[k], `${path}.${k}`)
}

describe('LP-1b in-season routing parity — app side (T-APP-1)', () => {
  it('pins the fixture bytes to the data repo copy by SHA-256', () => {
    expect(createHash('sha256').update(raw).digest('hex')).toBe(FIXTURE_SHA256)
  })

  it('reproduces the stored app outputs at every checkpoint (population, live states, posteriors, omissions)', () => {
    expect(fx.cases.map(c => c.w)).toEqual(fx.scenario.checkpoints)
    for (const c of fx.cases) {
      const { qbLiveStatesArgs, scoringArgs } = c.appInputs
      const live = buildQbLiveStates({ ...qbLiveStatesArgs })
      const posteriors = buildScoringPosteriors({ ...scoringArgs, qbLiveStates: live })
      const population = {}
      for (const [id, info] of Object.entries(scoringArgs.playerMap)) {
        population[id] = classifyInSeasonPopulation({
          playerId: id, careerStats: scoringArgs.careerStats, dataSeason: scoringArgs.dataSeason, yearsExp: info.years_exp ?? null,
        })
      }
      expectSame(population, c.app.population, `w${c.w} population`)
      expectSame(plain([...live]), c.app.liveStates, `w${c.w} liveStates`)
      expectSame(
        plain([...posteriors].map(([id, r]) => [id, { population: r.population, ros: { k: r.ros.k, value: r.ros.value }, ...(r.start ? { start: r.start } : {}) }])),
        c.app.posteriors, `w${c.w} posteriors`,
      )
      expectSame(Object.keys(scoringArgs.seasonProjections).filter(id => !posteriors.has(id)), c.app.omitted, `w${c.w} omitted`)
    }
  })

  it('re-derives the posterior null rules and the pinned K_ROS tables', () => {
    for (const { args, value } of fx.posteriorOf) expectSame(posteriorOf(...args)?.value ?? null, value, `posteriorOf(${args})`)
    expect(fx.kTables).toEqual({ standard: K_ROS_POINTS, SHORT: K_ROS_POINTS_SHORT, ROOKIE0: K_ROS_POINTS_ROOKIE0, ROOKIE1P: K_ROS_POINTS_ROOKIE1P })
  })
})

// ─── T-APP-2: the chain basis against the real seasonProjection ─────────────────────────────────
const round4 = (x) => Math.round(x * 10000) / 10000
const careerWithStats = (cs) => Object.fromEntries(Object.entries(cs).map(([y, rows]) => [y, Object.fromEntries(
  Object.entries(rows).map(([id, r]) => [id, { ...r, dnpWeeks: 0, stats: { pass_att: 0, pass_yd: 0, pass_td: 0, pass_int: 0, rush_att: 0, rush_yd: 0, rush_td: 0, rec_tgt: 0, rec: 0, rec_yd: 0, rec_td: 0 } }]),
)]))

function projectAll(input) {
  const qbTakeover = buildPreseasonQbShares({ playerMap: input.playerMap, careerStats: input.careerStats, dataSeason: input.dataSeason, games: input.games })
  const careerStats = careerWithStats(input.careerStats)
  const out = {}
  for (const [id, info] of Object.entries(input.playerMap)) {
    const opts = makeVet({
      playerId: id,
      player: { position: info.position, team: info.team, depth_chart_order: info.depth_chart_order, years_exp: info.years_exp },
      careerStats,
      depthMap: { [id]: { depthOrder: info.depth_chart_order } },
      qbTakeover,
      currentSeason: input.dataSeason,
    }).asOptions()
    out[id] = computeNextSeasonProjection(opts)
  }
  return { qbTakeover, projections: out }
}

describe('LP-1b chain basis against the real app (T-APP-2)', () => {
  const sets = [['pre', fx.chainInputs.pre, fx.chain.pre], ['pre16', fx.chainInputs.pre16, fx.chain.pre16]]

  for (const [name, input, expected] of sets) {
    it(`${name}: basis, room role, share and the projectedPPG product equal the fixture`, () => {
      const { qbTakeover, projections } = projectAll(input)
      for (const [id, e] of Object.entries(expected)) {
        const proj = projections[id]
        expect(proj, `${name} ${id}: a non-null projection`).not.toBeNull()
        expect(proj.factors.qbTakeoverBasis, `${name} ${id} basis`).toBe(e.basis)
        expect(qbTakeover[id].role, `${name} ${id} role`).toBe(e.role)
        if (e.role === 'backup') expect(Math.abs(qbTakeover[id].share - e.share), `${name} ${id} share`).toBeLessThanOrEqual(1e-12)
        if (e.basis === 'chain') {
          expect(proj.factors.qbStartShare, `${name} ${id} qbStartShare`).toBe(round4(e.share))
          expect(Math.abs(proj.projectedPPG - proj.factors.qbStarterPPG * proj.factors.qbStartShare), `${name} ${id} product`).toBeLessThanOrEqual(0.051)
        } else expect(proj.factors.qbStartShare, `${name} ${id} qbStartShare`).toBeNull()
      }
    })
  }

  for (const w of Object.keys(fx.chainInputs.live)) {
    it(`live w=${w}: basis equals the fixture`, () => {
      const { projections } = projectAll(fx.chainInputs.live[w])
      for (const [id, basis] of Object.entries(fx.chain.live[w])) {
        expect(projections[id], `live ${w} ${id}: a non-null projection`).not.toBeNull()
        expect(projections[id].factors.qbTakeoverBasis, `live ${w} ${id} basis`).toBe(basis)
      }
    })
  }
})
