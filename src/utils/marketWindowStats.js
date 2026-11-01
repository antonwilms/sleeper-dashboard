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
import { passerRating } from './efficiencyMetrics'
import { buildTeamShareTotals } from './outlookPositionStats'
import { resolvePlayerTeam } from './playerTeam'
import { computeHistoricalTeamTotals } from './teamContext'

const SKILL = ['QB', 'RB', 'WR', 'TE']
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

function rowsFor(y, careerStats, currentSeasonTotals) {
  if (careerStats?.[y]) return careerStats[y]
  if (currentSeasonTotals?.complete === true && currentSeasonTotals.season === y) {
    return currentSeasonTotals.players ?? {}
  }
  return {}
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

export function buildWindowStats({ window, careerStats, currentSeasonTotals, playerMap } = {}) {
  const result = new Map()
  const pm = playerMap ?? {}
  const seasons = window?.seasons ?? []
  const sources = {}
  for (const y of seasons) sources[y] = rowsFor(y, careerStats, currentSeasonTotals)

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

  const teamShare = buildTeamShareTotals(sources, pm)
  const rz = computeHistoricalTeamTotals(sources, pm)

  const SHARES = [
    ['tgtShare', 'rec_tgt', (y, t) => teamShare[y]?.[t]?.recTgt],
    ['carryShare', 'rush_att', (y, t) => teamShare[y]?.[t]?.rushAtt],
    ['aySh', 'rec_air_yd', (y, t) => teamShare[y]?.[t]?.recAirYd],
    ['rzTgtShare', 'rec_rz_tgt', (y, t) => rz[y]?.[t]?.recRz],
    ['rzRushShare', 'rush_rz_att', (y, t) => rz[y]?.[t]?.rushRz],
  ]

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
    const fp = entries.reduce((a, e) => a + (Number.isFinite(e.row.fantasyPoints) ? e.row.fantasyPoints : 0), 0)

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

    for (const [name, numKey, denOf] of SHARES) {
      let num = 0, den = 0, g = 0
      for (const e of entries) {
        if (!tracked[e.y].has(numKey)) continue
        const team = resolvePlayerTeam({ careerStats: sources }, pid, e.y)
        if (!team) continue
        const d = denOf(e.y, team)
        if (!(d > 0)) continue
        num += e.s[numKey] ?? 0
        den += d
        g += e.row.gamesPlayed
      }
      basisGp[name] = g
      usage[name] = g > 0 ? num / den : null
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
