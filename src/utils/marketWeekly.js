// View-only, pure. Never feeds projectedPPG, the dynasty score, any `factors` entry or a snapshot, and never
// writes into `careerStats`, `currentSeasonTotals` or any row (guarded by marketWindowStatsViewOnly.test.js).
//
// Market's weekly layer: per player, per window season, the played weeks (weeklyStatus 'P') with that week's
// stat line (weeklyStats; a played week absent from it is all-zero, D-47) and league-basis FP (the row's own
// weeklyPoints, already scored by rescoreSeasonTotals — no scoring here). Live rows are read from
// currentSeasonTotals beside careerStats, never merged into it.
// Team-week totals for Market's games-played shares; week team from gamelogs, else the season team.
import { resolvePlayerTeam } from './playerTeam'
import { isTeamAggregateId } from './teamContext'

const EMPTY = Object.freeze({})
const isPlain = o => o != null && typeof o === 'object' && !Array.isArray(o)

// CR-34: every served weeklyStats key Market reads. The data repo must keep each one (not denylisted) with its
// weeks summing to the season stats value. Extend this list whenever a new weekly reader is added.
export const WEEKLY_KEYS = Object.freeze([
  'pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_sack',
  'rush_att', 'rush_yd', 'rush_td', 'rush_btkl', 'rush_fd',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td', 'rec_fd',
  'rec_air_yd', 'rec_rz_tgt', 'rush_rz_att',
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

const NON_OFFENCE = new Set(['K', 'P', 'DEF'])

// D1's offence gate (moved from marketWindowStats.js offenceTeamTotals, unchanged): played, not a TEAM_*
// aggregate, not a known K/P/DEF, and offensive volume. Retired ids (absent from playerMap) pass.
export function isOffenceRow(pid, row, pm) {
  if ((row?.gamesPlayed ?? 0) < 1 || isTeamAggregateId(pid)) return false
  if (NON_OFFENCE.has(pm?.[pid]?.position)) return false
  const s = row.stats ?? {}
  return (s.pass_att ?? 0) + (s.rush_att ?? 0) + (s.rec_tgt ?? 0) > 0
}

// { [season]: { [pid]: { [week]: team } } } over REG games, for each season in `seasons` whose gamelogs are
// complete. Each game's team is resolved ONCE here, era-accurate, through the week grain:
// resolvePlayerTeam({ gameLogPlayers: { [pid]: { games: [g] } } }, pid, y, g.week); a null result is not stored.
// Seasons without complete logs are absent.
export function weekTeamIndex(gameLogsByYear, seasons) {
  const index = {}
  for (const y of seasons ?? []) {
    const logs = gameLogsByYear?.[y]
    if (logs?.complete !== true) continue
    const bySeason = {}
    for (const [pid, p] of Object.entries(logs.players ?? {})) {
      for (const g of p?.games ?? []) {
        if (g?.seasonType !== 'REG') continue
        const team = resolvePlayerTeam({ gameLogPlayers: { [pid]: { games: [g] } } }, pid, y, g.week)
        if (!team) continue
        const byWeek = bySeason[pid] ?? (bySeason[pid] = {})
        byWeek[g.week] = team
      }
    }
    index[y] = bySeason
  }
  return index
}

// (pid, season, week) → era-accurate team or null. The single week-team rule (decision 2). No allocation per call.
export function makeWeekTeam(sources, index) {
  return (pid, y, w) => {
    const fromLogs = index[y]?.[pid]?.[w] ?? null
    // PROVISIONAL(heuristic): the season team stands in for the week's team · that season's gamelogs are not in use (not loaded/complete or not settled), or omit the player or week · a per-week team on season-totals rows, or complete logs
    return fromLogs ?? resolvePlayerTeam({ careerStats: sources }, pid, y)
  }
}

// Each team-week field's component stat keys — the ONE definition of every non-fp field: buildTeamWeekTotals
// computes each such field as Σ over FIELD_KEYS[field] of (s[k] ?? 0), and decision 10's guard checks the same
// keys. fp has none (it is the week's fp).
export const FIELD_KEYS = Object.freeze({
  recTgt: ['rec_tgt'], rushAtt: ['rush_att'], recAirYd: ['rec_air_yd'], recRz: ['rec_rz_tgt'],
  rushRz: ['rush_rz_att'], fp: [], td: ['rush_td', 'rec_td'], scrimYd: ['rush_yd', 'rec_yd'],
})

// { totals: { [season]: { [week]: { [team]: { recTgt, rushAtt, recAirYd, recRz, rushRz, fp, td, scrimYd } } } },
//   covered: { [season]: boolean }, mismatched: { [season]: Set<key> } } over offence rows' played weeks
// (decisions 3–5, 10). Every field except fp is Σ FIELD_KEYS[field] (so td = rush_td + rec_td, scrimYd =
// rush_yd + rec_yd) — loop over FIELD_KEYS, never restate a formula; fp = week fp ?? 0. A season is covered
// when every offence row has weeklyStats; mismatched holds the WEEKLY_KEYS whose weeks do not sum to the row's
// stats value on some covered offence row of that season.
export function buildTeamWeekTotals(sources, pm, weekTeam) {
  const totals = {}
  const covered = {}
  const mismatched = {}
  const fields = Object.keys(FIELD_KEYS)
  for (const [yKey, rows] of Object.entries(sources ?? {})) {
    const y = Number(yKey)
    const byWeek = {}
    const bad = new Set()
    let allCovered = true
    for (const [pid, row] of Object.entries(rows ?? {})) {
      if (!isOffenceRow(pid, row, pm)) continue
      if (!isPlain(row.weeklyStats)) { allCovered = false; continue }
      const played = playedWeeks(row)
      for (const k of WEEKLY_KEYS) {
        const sum = played.reduce((a, pw) => a + (pw.s?.[k] ?? 0), 0)
        if (Math.abs(sum - (row.stats?.[k] ?? 0)) > 1e-6) bad.add(k)
      }
      for (const { w, s, fp } of played) {
        const team = weekTeam(pid, y, w)
        if (!team) continue
        const wk = byWeek[w] ?? (byWeek[w] = {})
        const t = wk[team] ?? (wk[team] = Object.fromEntries(fields.map(f => [f, 0])))
        for (const f of fields) {
          t[f] += f === 'fp'
            ? (Number.isFinite(fp) ? fp : 0)
            : FIELD_KEYS[f].reduce((a, k) => a + (s?.[k] ?? 0), 0)
        }
      }
    }
    totals[yKey] = byWeek
    covered[yKey] = allCovered
    mismatched[yKey] = bad
  }
  return { totals, covered, mismatched }
}

// Window seasons whose gamelogs are not complete (window order) — the caption's "not split" list.
export function seasonsWithoutWeekTeams(seasons, gameLogsByYear) {
  return (seasons ?? []).filter(y => gameLogsByYear?.[y]?.complete !== true)
}
