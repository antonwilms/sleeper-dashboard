// V1 — pure helpers comparing the app's weekly fantasy points with Sleeper's matchup points.
import { calculateFantasyPoints } from '../../../src/utils/fantasyPoints.js'

const EPS = 1e-9
export const MATCH_TOL = 0.01
export const DELTA_BUCKETS = ['<=0.01', '<=0.1', '<=0.5', '<=1', '<=2', '>2']

// One player × season × week. `appRow` is the rescored season row (or undefined when the id has no
// season-totals row at all). Δ = appPts − sleeperPts.
export function compareWeeklyPoints({ sleeperPts, appRow, week }) {
  if (!appRow) return { class: 'app-no-row', appPts: null, method: null, delta: null }
  const method = appRow.weeklyPointsMethod ?? null
  const wp = appRow.weeklyPoints
  const raw = wp == null ? undefined : (Array.isArray(wp) ? wp[week - 1] : wp[week])
  const appPts = raw == null ? null : raw
  if (appPts == null) {
    return { class: sleeperPts === 0 ? 'app-missing-zero' : 'app-missing-nonzero', appPts: null, method, delta: null }
  }
  const delta = appPts - sleeperPts
  return { class: Math.abs(delta) <= MATCH_TOL + EPS ? 'match' : 'diff', appPts, method, delta }
}

// Why does a diff / missing row disagree? `served` = the served weeklyStats[w] (or {}), `live` =
// Sleeper's current stats for that week (or null when the player is absent from the response).
export function attributeKeys({ served, live, settings, sleeperPts, appPts, method }) {
  const servedStats = served ?? {}
  const liveStats = live ?? {}
  const staleKeys = []
  for (const [key, mult] of Object.entries(settings)) {
    if (mult == null) continue
    const l = liveStats[key] ?? 0
    const s = servedStats[key] ?? 0
    if (l !== s) staleKeys.push({ key, live: l, served: s, pts: (l - s) * mult })
  }
  const liveScore = calculateFantasyPoints(liveStats, settings)
  const residual = Math.round((sleeperPts - liveScore) * 100) / 100
  const staleSum = staleKeys.reduce((a, k) => a + k.pts, 0)
  const app = appPts ?? 0
  let cause
  if (live == null) cause = 'unexplained'
  else if (Math.abs(residual) > MATCH_TOL + EPS) cause = 'scoring-model'
  else if (Math.abs(app + staleSum - sleeperPts) <= MATCH_TOL + EPS) cause = 'stale-capture'
  else if (method === 'scaled') cause = 'app-branch'
  else cause = 'unexplained'
  return { staleKeys, liveScore, residual, cause, liveMissing: live == null }
}

// Count |Δ| values per bucket (inclusive upper edges).
export function bucketDiffs(deltas) {
  const out = Object.fromEntries(DELTA_BUCKETS.map(b => [b, 0]))
  for (const d of deltas) {
    const a = Math.abs(d)
    if (a <= 0.01 + EPS) out['<=0.01']++
    else if (a <= 0.1 + EPS) out['<=0.1']++
    else if (a <= 0.5 + EPS) out['<=0.5']++
    else if (a <= 1 + EPS) out['<=1']++
    else if (a <= 2 + EPS) out['<=2']++
    else out['>2']++
  }
  return out
}

// Exact-match rate = match / (match + diff), grouped by keyFn(row).
export function rateBy(rows, keyFn) {
  const groups = {}
  for (const r of rows) {
    if (r.class !== 'match' && r.class !== 'diff') continue
    const k = keyFn(r) ?? 'unknown'
    const g = groups[k] ?? (groups[k] = { match: 0, diff: 0 })
    g[r.class]++
  }
  for (const g of Object.values(groups)) g.rate = g.match + g.diff > 0 ? g.match / (g.match + g.diff) : null
  return groups
}

export function countClasses(rows) {
  const c = { match: 0, diff: 0, 'app-missing-zero': 0, 'app-missing-nonzero': 0, 'app-no-row': 0 }
  for (const r of rows) c[r.class]++
  return c
}
