import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'
import {
  QB_TAKEOVER_SOURCE, QB_LEVELS, QB_HAZARD, QB_STICK, QB_DEFS,
} from '../utils/qbTakeoverConstants'

// P6b — provenance oracle for the QB takeover constants (CR-27). The fixture is a byte copy of the data
// repo's backtests/2026-10-03-qb-takeover-constants.json at the pinned commit; nothing below may be
// hand-edited — a re-fit writes a new dated file and the app re-pins by byte copy.
const fixture = JSON.parse(readFileSync(QB_TAKEOVER_SOURCE.fixture, 'utf8'))

describe('QB takeover constants — fixture provenance', () => {
  it('the fixture names the pinned source and generation time, on the half-PPR basis', () => {
    expect(fixture.source.startsWith(QB_TAKEOVER_SOURCE.file)).toBe(true)
    expect(fixture.generatedAt).toBe(QB_TAKEOVER_SOURCE.generatedAt)
    expect(fixture.basis).toBe('half_ppr')
  })

  it('QB_HAZARD / QB_STICK features and coefficients deep-equal the fixture', () => {
    expect(QB_HAZARD.features).toEqual(fixture.hazard.features)
    expect(QB_HAZARD.coef).toEqual(fixture.hazard.coef)
    expect(QB_STICK.features).toEqual(fixture.stickiness.features)
    expect(QB_STICK.coef).toEqual(fixture.stickiness.coef)
  })

  it('QB_LEVELS deep-equals definitions.bins.levels; QB_DEFS equals the incPPG definition and the iq cuts', () => {
    expect(QB_LEVELS).toEqual(fixture.definitions.bins.levels)
    const inc = fixture.definitions.incPPG
    expect({ incK: QB_DEFS.incK, priorMinGames: QB_DEFS.priorMinGames, obsMinGamesNoPrior: QB_DEFS.obsMinGamesNoPrior })
      .toEqual({ incK: inc.k, priorMinGames: inc.priorMinGames, obsMinGamesNoPrior: inc.obsMinGamesNoPrior })
    // the cuts are stated in the data's QB_TAKEOVER_DEFAULTS (weakCut 0.85, strongCut 1.10) and echoed in the iq definition
    const iq = fixture.definitions.bins.iq
    expect(iq).toContain(`weak < ${QB_DEFS.weakCut}`)
    expect(iq).toContain(`${QB_DEFS.strongCut} < strong`)
  })
})

// Test-local port of data lib/qbTakeover.mjs fitLogistic (ridge Newton–Raphson, intercept unpenalised).
function solveLinear(A, b) {
  const n = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let c = 0; c < n; c++) {
    let piv = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r
    if (Math.abs(M[piv][c]) < 1e-14) throw new Error('singular Hessian')
    if (piv !== c) [M[piv], M[c]] = [M[c], M[piv]]
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / M[c][c]
      if (f === 0) continue
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n]
    for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k]
    x[r] = s / M[r][r]
  }
  return x
}

function fitLogistic(patterns, usedKeys, { lambda, maxIter = 100, tol = 1e-10 }) {
  const names = ['intercept']
  const colOf = {}
  for (const k of usedKeys) colOf[k] = QB_LEVELS[k].map((l, code) => (code === 0 ? -1 : names.push(`${k}=${l}`) - 1))
  const p = names.length
  let N = 0, E = 0
  const P = patterns.map(pt => {
    const idx = [0]
    for (const k of usedKeys) { const col = colOf[k][pt.c[k]]; if (col > 0) idx.push(col) }
    N += pt.n; E += pt.e
    return { idx, n: pt.n, e: pt.e }
  })
  const beta = new Array(p).fill(0)
  beta[0] = Math.log((E + 0.5) / (N - E + 0.5))
  let converged = false
  for (let it = 1; it <= maxIter; it++) {
    const grad = new Array(p).fill(0)
    const H = Array.from({ length: p }, () => new Array(p).fill(0))
    for (const pt of P) {
      let z = 0
      for (const j of pt.idx) z += beta[j]
      const mu = 1 / (1 + Math.exp(-z))
      const w = pt.n * mu * (1 - mu)
      const r = pt.e - pt.n * mu
      for (const j of pt.idx) { grad[j] += r; for (const k of pt.idx) H[j][k] += w }
    }
    for (let j = 1; j < p; j++) { grad[j] -= lambda * beta[j]; H[j][j] += lambda }
    const delta = solveLinear(H, grad)
    let maxD = 0
    for (let j = 0; j < p; j++) { beta[j] += delta[j]; maxD = Math.max(maxD, Math.abs(delta[j])) }
    if (maxD < tol) { converged = true; break }
  }
  if (!converged) throw new Error('did not converge')
  const coef = {}
  names.forEach((nm, j) => { coef[nm] = beta[j] })
  return coef
}

// pooled fixture rows are [...codes(keys), trials, events]; aggregate over the used keys
function aggregate(rows, keys, usedKeys) {
  const pos = usedKeys.map(k => keys.indexOf(k))
  const m = new Map()
  for (const row of rows) {
    const codes = pos.map(p => row[p])
    const key = codes.join(',')
    let e = m.get(key)
    if (!e) { e = { c: Object.fromEntries(usedKeys.map((k, i) => [k, codes[i]])), n: 0, e: 0 }; m.set(key, e) }
    e.n += row[row.length - 2]
    e.e += row[row.length - 1]
  }
  return [...m.values()]
}

describe('QB takeover constants — re-derivation from the pooled pattern tables', () => {
  const round4 = b => Math.round(b * 1e4) / 1e4
  const lambda = fixture.definitions.lambda

  for (const [name, model, keys, rows] of [
    ['hazard', QB_HAZARD, fixture.fixture.hazardKeys, fixture.fixture.hazardPatterns],
    ['stickiness', QB_STICK, fixture.fixture.stickKeys, fixture.fixture.stickPatterns],
  ]) {
    it(`the ${name} ridge-logistic fit (λ = ${lambda}) re-derives every pinned coefficient at 4 dp`, () => {
      const coef = fitLogistic(aggregate(rows, keys, model.features), model.features, { lambda })
      expect(Object.keys(coef).sort()).toEqual(Object.keys(model.coef).sort())
      for (const [k, v] of Object.entries(model.coef)) expect(round4(coef[k]), `${name} ${k}`).toBe(v)
    })
  }
})
