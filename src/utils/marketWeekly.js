// View-only, pure. Never feeds projectedPPG, the dynasty score, any `factors` entry or a snapshot, and never
// writes into `careerStats`, `currentSeasonTotals` or any row (guarded by marketWindowStatsViewOnly.test.js).
//
// Market's weekly layer: per player, per window season, the played weeks (weeklyStatus 'P') with that week's
// stat line (weeklyStats; a played week absent from it is all-zero, D-47) and league-basis FP (the row's own
// weeklyPoints, already scored by rescoreSeasonTotals — no scoring here). Live rows are read from
// currentSeasonTotals beside careerStats, never merged into it.

const EMPTY = Object.freeze({})
const isPlain = o => o != null && typeof o === 'object' && !Array.isArray(o)

// CR-34: every served weeklyStats key Market reads. The data repo must keep each one (not denylisted) with its
// weeks summing to the season stats value. Extend this list whenever a new weekly reader is added.
export const WEEKLY_KEYS = Object.freeze([
  'pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_sack',
  'rush_att', 'rush_yd', 'rush_td', 'rush_btkl', 'rush_fd',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td', 'rec_fd',
])

// moved verbatim from marketWindowStats.js `rowsFor` (only the name and `export` change)
export function windowSeasonRows(y, careerStats, currentSeasonTotals) {
  if (careerStats?.[y]) return careerStats[y]
  if (currentSeasonTotals?.complete === true && currentSeasonTotals.season === y) {
    return currentSeasonTotals.players ?? {}
  }
  return {}
}

// One row's played weeks, in week order. `s` is null when the row carries no weeklyStats (not covered);
// `fp` is null when the week's league-basis points are missing or non-finite.
export function playedWeeks(row) {
  const status = Array.isArray(row?.weeklyStatus) ? row.weeklyStatus : []
  const stats = isPlain(row?.weeklyStats) ? row.weeklyStats : null
  const pts = isPlain(row?.weeklyPoints) ? row.weeklyPoints : null
  const out = []
  for (let i = 0; i < status.length; i++) {
    if (status[i] !== 'P') continue
    const w = i + 1
    // PROVISIONAL(heuristic): a week's points are ratio-scaled when the row's weeklyPointsMethod is 'scaled' · the row has no served weeklyStats, or they did not sum to the season · weeklyStats on every played row (D-47)
    const fp = pts && Number.isFinite(pts[w]) ? pts[w] : null
    out.push({ w, s: stats ? (stats[w] ?? EMPTY) : null, fp })
  }
  return out
}

// Per pid in `pids`: { weeks: [{ y, w, s, fp }], statsCovered, fpCovered, mismatched }. A season counts when
// the pid's row has gamesPlayed >= 1 (buildWindowStats' entry rule). statsCovered: every counted season's 'P'
// count equals its gamesPlayed and every week's `s` is non-null; fpCovered: the same count check and every `fp`
// non-null. mismatched: a Set of the WEEKLY_KEYS whose PLAYED weeks' stat lines (`playedWeeks`' `s`, never a
// weeklyStats entry for a non-'P' week), in some counted season with weeklyStats, do not sum to that row's stats
// value (|Σ s[k] − (row.stats?.[k] ?? 0)| > 1e-6; an absent key on both sides is 0 = 0).
// A pid with no counted season gets no entry.
export function buildWindowWeeks({ window, careerStats, currentSeasonTotals, pids } = {}) {
  const result = new Map()
  const seasons = window?.seasons ?? []
  const sources = {}
  for (const y of seasons) sources[y] = windowSeasonRows(y, careerStats, currentSeasonTotals)
  for (const pid of pids ?? []) {
    const weeks = []
    let statsCovered = true
    let fpCovered = true
    const mismatched = new Set()
    let counted = 0
    for (const y of seasons) {
      const row = sources[y][pid]
      if (!row || !(row.gamesPlayed >= 1)) continue
      counted += 1
      const played = playedWeeks(row)
      const countOk = played.length === row.gamesPlayed
      if (!countOk) { statsCovered = false; fpCovered = false }
      for (const pw of played) {
        weeks.push({ y, w: pw.w, s: pw.s, fp: pw.fp })
        if (pw.s == null) statsCovered = false
        if (pw.fp == null) fpCovered = false
      }
      if (played.length > 0 && played.every(pw => pw.s != null)) {
        for (const k of WEEKLY_KEYS) {
          const sum = played.reduce((a, pw) => a + (pw.s[k] ?? 0), 0)
          if (Math.abs(sum - (row.stats?.[k] ?? 0)) > 1e-6) mismatched.add(k)
        }
      }
    }
    if (counted === 0) continue
    result.set(pid, { weeks, statsCovered, fpCovered, mismatched })
  }
  return result
}

// Lower/upper middle averaged for an even count; null for an empty list. Does not mutate its input.
export function median(xs) {
  if (!Array.isArray(xs) || xs.length === 0) return null
  const sorted = [...xs].sort((a, b) => a - b)
  const mid = sorted.length >> 1
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

// One week's value for a perGame metric: the week's fp for week 'fp', else Σ over metric.week of (s[k] ?? 0).
// The single per-week rule — weeklyMedians and W6 both call it.
export function weekValue(metric, week) {
  if (metric.week === 'fp') return week.fp
  return metric.week.reduce((a, k) => a + (week.s?.[k] ?? 0), 0)
}

// { [metric.id]: number|null } for every metric with kind 'perGame' in `metrics`: the median of weekValue over
// entry.weeks. null when entry.weeks is empty; for week 'fp' when !entry.fpCovered; for a key list when
// !entry.statsCovered or any of its keys is in entry.mismatched.
export function weeklyMedians(entry, metrics) {
  const out = {}
  for (const m of metrics) {
    if (m.kind !== 'perGame') continue
    let ok = !!entry && entry.weeks.length > 0
    if (ok) {
      ok = m.week === 'fp'
        ? entry.fpCovered
        : entry.statsCovered && !m.week.some(k => entry.mismatched.has(k))
    }
    out[m.id] = ok ? median(entry.weeks.map(wk => weekValue(m, wk))) : null
  }
  return out
}
