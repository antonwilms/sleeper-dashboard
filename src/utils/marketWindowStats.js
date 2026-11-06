// View-only, pure. Never feeds projectedPPG, the dynasty score, any `factors` entry or a snapshot,
// and never writes into `careerStats`, `currentSeasonTotals` or any row (guarded by
// marketWindowStatsViewOnly.test.js and the frozen-input tests).
//
// Per-window (live / single season / last 3 / career) skill-player stats for the Market surface.
// Components are summed across the window and rates are rebuilt from the sums — never averaged
// (CR-10). A stat key that no skill row carries in a season ("untracked") contributes nothing to
// either side of a ratio for that season; a tracked key absent on one row counts 0 (Sleeper omits
// zeros). Live usability arrives as the caller's `liveUsable`; this module never re-derives it
// (the view-only in-season module — Market and the pop-up only — cannot be imported here).
// Team shares are games-played shares over marketWeekly.js's team-week totals.
import { passerRating } from './efficiencyMetrics'
import {
  windowSeasonRows, playedWeeks, weekTeamIndex, makeWeekTeam, buildTeamWeekTotals, FIELD_KEYS,
} from './marketWeekly'

const SKILL = ['QB', 'RB', 'WR', 'TE']
const fpOf = row => (Number.isFinite(row.fantasyPoints) ? row.fantasyPoints : 0)
export const WINDOW_TOTAL_KEYS = [
  'pass_att','pass_cmp','pass_yd','pass_td','pass_int','pass_sack','pass_air_yd',
  'rush_att','rush_yd','rush_td','rush_yac','rush_btkl','rush_rz_att',
  'rec_tgt','rec','rec_yd','rec_td','rec_air_yd','rec_rz_tgt','rec_drop',
  'fum_lost','rush_fd','rec_fd','off_snp','tm_off_snp',
]

export function availableWindows({ careerStats, currentSeasonTotals, liveUsable } = {}) {
  const completed = Object.keys(careerStats ?? {}).map(Number).filter(Number.isFinite).sort((a, b) => b - a)
  const S = currentSeasonTotals?.season
  const live = liveUsable === true && Number.isFinite(S)
  const out = []
  if (live) out.push({ id: 'live', kind: 'live', seasons: [S], label: `${S} so far` })
  for (const y of completed) out.push({ id: String(y), kind: 'season', seasons: [y], label: String(y) })
  const last3 = live ? [S, ...completed.slice(0, 2)] : completed.slice(0, 3)
  if (last3.length) out.push({ id: 'last3', kind: 'last3', seasons: last3, label: 'Last 3 seasons' })
  const career = live ? [S, ...completed] : completed
  if (career.length) out.push({ id: 'career', kind: 'career', seasons: career, label: 'Career' })
  return out
}

export function defaultWindow(windows) {
  return windows.find(w => w.kind === 'live') ?? windows.find(w => w.kind === 'season') ?? null
}

// entries: [{ y, row, s }] (one per season); keys must all be tracked for a season to count.
function aligned(entries, tracked, keys) {
  const sums = Object.fromEntries(keys.map(k => [k, 0]))
  let gp = 0, n = 0
  for (const e of entries) {
    if (!keys.every(k => tracked[e.y].has(k))) continue
    for (const k of keys) sums[k] += e.s[k] ?? 0
    gp += e.row.gamesPlayed
    n += 1
  }
  return { sums, gp, n }
}

// Games-played shares: Σ player ÷ Σ his team's weekly totals over his played weeks, each week credited to the
// team he played for that week. A season counts when it is covered and every numerator key is tracked.
// [name, numerator stat keys (or a function of position; null = the week's FP), team-week field].
export const SHARES = [
  ['tgtShare', ['rec_tgt'], 'recTgt'],
  ['carryShare', ['rush_att'], 'rushAtt'],
  ['aySh', ['rec_air_yd'], 'recAirYd'],
  ['rzTgtShare', ['rec_rz_tgt'], 'recRz'],
  ['rzRushShare', ['rush_rz_att'], 'rushRz'],
  ['fpShare', null, 'fp'],
  ['tdShare', pos => (pos === 'QB' ? ['pass_td', 'rush_td'] : ['rush_td', 'rec_td']), 'td'],
  ['scrimYdShare', ['rush_yd', 'rec_yd'], 'scrimYd'],
]

export function buildWindowStats({ window, careerStats, currentSeasonTotals, playerMap, gameLogsByYear } = {}) {
  const result = new Map()
  const pm = playerMap ?? {}
  const seasons = window?.seasons ?? []
  const sources = {}
  for (const y of seasons) sources[y] = windowSeasonRows(y, careerStats, currentSeasonTotals)

  const isPool = (pid, row) => SKILL.includes(pm[pid]?.position) && (row?.gamesPlayed ?? 0) >= 1

  const tracked = {}
  for (const y of seasons) {
    const set = new Set()
    for (const [pid, row] of Object.entries(sources[y])) {
      if (!isPool(pid, row)) continue
      for (const k of WINDOW_TOTAL_KEYS) if (row.stats && k in row.stats) set.add(k)
    }
    tracked[y] = set
  }

  const pids = new Set()
  for (const y of seasons) for (const [pid, row] of Object.entries(sources[y])) if (isPool(pid, row)) pids.add(pid)
  if (pids.size === 0) return result

  const weekTeam = makeWeekTeam(sources, weekTeamIndex(gameLogsByYear, seasons))
  const { totals: teamWeek, covered, mismatched } = buildTeamWeekTotals(sources, pm, weekTeam)

  for (const pid of pids) {
    const position = pm[pid].position
    const entries = []
    for (const y of seasons) {
      const row = sources[y][pid]
      if (!row || (row.gamesPlayed ?? 0) < 1) continue
      entries.push({ y, row, s: row.stats ?? {} })
    }
    if (!entries.length) continue

    const gp = entries.reduce((a, e) => a + e.row.gamesPlayed, 0)
    const gs = entries.reduce((a, e) => a + (e.row.gamesStarted ?? 0), 0)
    const fp = entries.reduce((a, e) => a + fpOf(e.row), 0)

    const totals = {}
    for (const k of WINDOW_TOTAL_KEYS) {
      const t = entries.filter(e => tracked[e.y].has(k))
      totals[k] = t.length ? t.reduce((a, e) => a + (e.s[k] ?? 0), 0) : null
    }

    const basisGp = {}
    const ratio = (name, keys, num, den = a => a.sums[keys[0]]) => {
      const a = aligned(entries, tracked, keys)
      basisGp[name] = a.gp
      const d = den(a)
      return a.n > 0 && d > 0 ? num(a) / d : null
    }
    const rates = {
      cmpPct: ratio('cmpPct', ['pass_cmp', 'pass_att'], a => a.sums.pass_cmp, a => a.sums.pass_att),
      ypa: ratio('ypa', ['pass_yd', 'pass_att'], a => a.sums.pass_yd, a => a.sums.pass_att),
      passTdRate: ratio('passTdRate', ['pass_td', 'pass_att'], a => a.sums.pass_td, a => a.sums.pass_att),
      intRate: ratio('intRate', ['pass_int', 'pass_att'], a => a.sums.pass_int, a => a.sums.pass_att),
      sackRate: ratio('sackRate', ['pass_sack', 'pass_att'], a => a.sums.pass_sack, a => a.sums.pass_att + a.sums.pass_sack),
      passerRating: null,
      passAdot: ratio('passAdot', ['pass_air_yd', 'pass_att'], a => a.sums.pass_air_yd, a => a.sums.pass_att),
      ypc: ratio('ypc', ['rush_yd', 'rush_att'], a => a.sums.rush_yd, a => a.sums.rush_att),
      yacoPerAtt: ratio('yacoPerAtt', ['rush_yac', 'rush_att'], a => a.sums.rush_yac, a => a.sums.rush_att),
      ybcPerAtt: ratio('ybcPerAtt', ['rush_yd', 'rush_yac', 'rush_att'], a => a.sums.rush_yd - a.sums.rush_yac, a => a.sums.rush_att),
      btklRate: ratio('btklRate', ['rush_btkl', 'rush_att'], a => a.sums.rush_btkl, a => a.sums.rush_att),
      catchPct: ratio('catchPct', ['rec', 'rec_tgt'], a => a.sums.rec, a => a.sums.rec_tgt),
      ypr: ratio('ypr', ['rec_yd', 'rec'], a => a.sums.rec_yd, a => a.sums.rec),
      ypt: ratio('ypt', ['rec_yd', 'rec_tgt'], a => a.sums.rec_yd, a => a.sums.rec_tgt),
      aDOT: ratio('aDOT', ['rec_air_yd', 'rec_tgt'], a => a.sums.rec_air_yd, a => a.sums.rec_tgt),
      dropRate: ratio('dropRate', ['rec_drop', 'rec_tgt'], a => a.sums.rec_drop, a => a.sums.rec_tgt),
    }
    {
      const PR = ['pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_int']
      const a = aligned(entries, tracked, PR)
      basisGp.passerRating = a.gp
      rates.passerRating = a.n > 0 ? passerRating(a.sums) : null
    }

    const usage = {}
    {
      const a = aligned(entries, tracked, ['off_snp', 'tm_off_snp'])
      basisGp.snapPct = a.gp
      usage.snapSeasons = a.n
      usage.snapPct = a.n > 0 && a.sums.tm_off_snp > 0 ? a.sums.off_snp / a.sums.tm_off_snp : null
    }
    // CR-25's opportunity definition (duplicated; that module cannot be imported here).
    const opp = position === 'QB'
      ? (totals.pass_att ?? 0) + (totals.rush_att ?? 0)
      : (totals.rush_att ?? 0) + (totals.rec_tgt ?? 0)
    usage.oppPerG = opp / gp
    // Looks: pass attempts + carries + targets for every position — Market's own volume measure, deliberately
    // not CR-25's opportunity definition above (the Model view's Opp shift keeps that one).
    usage.looksPerG = ((totals.pass_att ?? 0) + (totals.rush_att ?? 0) + (totals.rec_tgt ?? 0)) / gp

    // One pass per player: each covered season's played weeks with that week's team.
    const seasonWeeks = entries.map(e => ({
      e,
      weeks: covered[e.y] ? playedWeeks(e.row).map(x => ({ ...x, team: weekTeam(pid, e.y, x.w) })) : [],
    }))
    for (const [name, keysOf, field] of SHARES) {
      const keys = typeof keysOf === 'function' ? keysOf(position) : keysOf
      const guarded = [...(keys ?? []), ...FIELD_KEYS[field]]
      let num = 0, den = 0, g = 0
      for (const { e, weeks } of seasonWeeks) {
        if (keys && !keys.every(k => tracked[e.y].has(k))) continue
        if (guarded.some(k => mismatched[e.y]?.has(k))) continue
        for (const { w, s, fp, team } of weeks) {
          if (!team) continue
          num += keys ? keys.reduce((a, k) => a + (s?.[k] ?? 0), 0) : (fp ?? 0)
          den += teamWeek[e.y]?.[w]?.[team]?.[field] ?? 0
          g += 1
        }
      }
      basisGp[name] = g
      usage[name] = g > 0 && den > 0 ? num / den : null
    }

    result.set(pid, {
      pid,
      position,
      team: entries[0].row.team ?? null,
      seasons: entries.map(e => e.y),
      gp,
      gs,
      fp,
      fpPerG: fp / gp,
      leagueScored: entries.every(e => e.row.scoringBasis === 'league'),
      totals,
      rates,
      usage,
      basisGp,
    })
  }
  return result
}
