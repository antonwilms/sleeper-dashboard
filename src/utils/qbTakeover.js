// QB backup→starter takeover model (P6b Stage A) — pure; imports ./qbTakeoverConstants only.
// A two-state weekly Markov chain over a team's game sequence: hazard `pUp` (a non-starter QB is the
// team's primary passer in game g) and stickiness `pStay` (a backup-origin starter stays primary).
// `expectedStarts` is a verbatim port of sleeper-dashboard-data lib/qbTakeover.mjs @ c3f16f8 (CR-27);
// the models are fixed to the pinned constants. Port the code, do not re-derive it.
//
// Pre-kickoff rule (CR-21 invariant): buildPreseasonQbShares reads NO live-season input — the chart is
// Sleeper's current `depth_chart_order` and the incumbent's prior is the last COMPLETED season.

import {
  QB_LEVELS, QB_HAZARD, QB_STICK, QB_DEFS,
} from './qbTakeoverConstants'

export const REG_SEASON_TEAM_GAMES = 17                 // 2021+; the live seasons this app scores

const COEF_NAME = {}
for (const [k, lv] of Object.entries(QB_LEVELS)) COEF_NAME[k] = lv.map(l => `${k}=${l}`)

const bnCode = c => (c <= 2 ? 0 : c <= 7 ? 1 : 2)
const wkCode = g => (g <= 6 ? 0 : g <= 12 ? 1 : 2)
const stCode = s => (s <= 1 ? 0 : s <= 3 ? 1 : 2)

// QB_LEVELS.dp = [d2, d1, d3]; a null / ≥ 3 order is d3.
export const dpCode = order => (order === 1 ? 1 : order === 2 ? 0 : 2)

// null / median ≤ 0 → 3 (unknown); rel < weakCut → 1 (weak); rel > strongCut → 2 (strong); else 0 (mid).
export function iqCode(ppg, median) {
  if (ppg == null || median == null || !(median > 0)) return 3
  const rel = ppg / median
  return rel < QB_DEFS.weakCut ? 1 : rel > QB_DEFS.strongCut ? 2 : 0
}

// gp ≥ 4 and finite fantasyPoints → fp/gp, else null.
export function priorPPG(row) {
  const gp = row?.gamesPlayed
  if (!(gp >= QB_DEFS.priorMinGames) || !Number.isFinite(row?.fantasyPoints)) return null
  return row.fantasyPoints / gp
}

// Fixed k; no prior → the mean of the observations when there are at least obsMinGamesNoPrior, else null.
export function incPPG(prior, obs) {
  const n = obs.length
  const sum = obs.reduce((a, b) => a + b, 0)
  if (prior != null) return n === 0 ? prior : (prior * QB_DEFS.incK + sum) / (QB_DEFS.incK + n)
  return n >= QB_DEFS.obsMinGamesNoPrior ? sum / n : null
}

function predictPinned(model, codes) {
  let z = model.coef.intercept
  for (const k of model.features) {
    const c = codes?.[k]
    if (!Number.isInteger(c) || c < 0 || c >= QB_LEVELS[k].length) {
      throw new Error(`[qbTakeover] feature ${k} needs an integer code in 0..${QB_LEVELS[k].length - 1}, got ${c}`)
    }
    if (c > 0) z += model.coef[COEF_NAME[k][c]]
  }
  return 1 / (1 + Math.exp(-z))
}

export const pUpOf = codes => predictPinned(QB_HAZARD, codes)
export const pStayOf = codes => predictPinned(QB_STICK, codes)

/**
 * Exact forward recursion over 54 states (role, ps, c, s). `start` = { ps, c, g, hazardCodes, stickCodes,
 * role = 'B', s = 1 }.
 */
export function expectedStarts({ start, remaining }) {
  const C = QB_DEFS.bnCap + 1, SC = QB_DEFS.streakCap
  const bIdx = (ps, c) => ps * C + c
  const sIdx = (c, s) => 2 * C + c * SC + (s - 1)
  const NS = 2 * C + C * SC
  let mass = new Float64Array(NS)
  const role = start.role ?? 'B'
  if (role === 'B') mass[bIdx(start.ps, Math.min(start.c, QB_DEFS.bnCap))] = 1
  else mass[sIdx(Math.min(start.c, QB_DEFS.bnCap), Math.min(start.s ?? 1, SC))] = 1

  const stickCodes = { ...start.stickCodes }
  if (start.hazardCodes?.og === 1) stickCodes.dq = QB_LEVELS.dq.indexOf('unknown')
  const pStay = [0, 1, 2].map(st => pStayOf({ ...stickCodes, st }))

  const perGame = [], massPerGame = []
  for (let j = 0; j < remaining; j++) {
    const wk = wkCode(start.g + j)
    const pUp = new Map()
    const up = (ps, c) => {
      const key = ps * 3 + bnCode(c)
      if (!pUp.has(key)) pUp.set(key, pUpOf({ ...start.hazardCodes, ps, bn: bnCode(c), wk }))
      return pUp.get(key)
    }
    const next = new Float64Array(NS)
    for (let ps = 0; ps < 2; ps++) {
      for (let c = 0; c < C; c++) {
        const m = mass[bIdx(ps, c)]
        if (m === 0) continue
        const p = up(ps, c)
        next[sIdx(c, 1)] += m * p
        next[bIdx(ps, Math.min(c + 1, QB_DEFS.bnCap))] += m * (1 - p)
      }
    }
    for (let c = 0; c < C; c++) {
      for (let s = 1; s <= SC; s++) {
        const m = mass[sIdx(c, s)]
        if (m === 0) continue
        const q = pStay[stCode(s)]
        next[sIdx(c, Math.min(s + 1, SC))] += m * q
        next[bIdx(1, c)] += m * (1 - q)
      }
    }
    let pS = 0, tot = 0
    for (let i = 0; i < NS; i++) { tot += next[i]; if (i >= 2 * C) pS += next[i] }
    perGame.push(pS); massPerGame.push(tot)
    mass = next
  }
  const expected = perGame.reduce((a, b) => a + b, 0)
  return { perGame, expected, fraction: remaining > 0 ? expected / remaining : NaN, massPerGame }
}

function medianOf(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * The g = 1 rule over the league-wide Sleeper chart: every QB → { role, team, incumbentId, … }.
 * role ∈ incumbent | backup | no-team | no-chart; a backup also carries codes, pUp, share, perGame, games.
 */
export function buildPreseasonQbShares({ playerMap, careerStats, dataSeason, games = REG_SEASON_TEAM_GAMES }) {
  const out = {}
  const byTeam = new Map()
  for (const [id, info] of Object.entries(playerMap ?? {})) {
    if (info?.position !== 'QB') continue
    const T = info.team ?? null
    if (T == null || T === 'FA') { out[id] = { role: 'no-team', team: T, incumbentId: null }; continue }
    if (!byTeam.has(T)) byTeam.set(T, [])
    byTeam.get(T).push({ id, info })
  }

  const incumbentOf = new Map()
  const incPrior = new Map()
  for (const [T, qbs] of byTeam) {
    const order1 = qbs.filter(q => q.info.depth_chart_order === 1).map(q => q.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    if (!order1.length) {
      for (const q of qbs) out[q.id] = { role: 'no-chart', team: T, incumbentId: null }
      continue
    }
    incumbentOf.set(T, order1[0])
    incPrior.set(T, priorPPG(careerStats?.[dataSeason]?.[order1[0]]))
  }
  const median = medianOf([...incPrior.values()].filter(v => v != null))

  for (const [T, incumbentId] of incumbentOf) {
    for (const { id, info } of byTeam.get(T)) {
      if (id === incumbentId) { out[id] = { role: 'incumbent', team: T, incumbentId }; continue }
      const codes = {
        dp: dpCode(info.depth_chart_order ?? null),
        og: 0,
        rk: info.years_exp === 0 ? 1 : 0,
        iq: iqCode(incPrior.get(T), median),
      }
      const r = expectedStarts({
        start: { role: 'B', ps: 0, c: 0, g: 1, hazardCodes: codes, stickCodes: {} },
        remaining: games,
      })
      out[id] = {
        role: 'backup', team: T, incumbentId, codes, pUp: pUpOf(codes), share: r.fraction, perGame: r.perGame, games,
      }
    }
  }
  return out
}
