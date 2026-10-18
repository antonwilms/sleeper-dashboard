// V2 — the stats feeding the grades (2020–2025, regular season) vs an nflverse rebuild.
// Pure: runV2 takes already-loaded inputs. Tolerances are fixed by the plan and not tunable here.
import { computeHistoricalTeamTotals, computeHistoricalShares, computeTeamContext, resolveAttributedTeam } from '../../../src/utils/teamContext.js'
import { computeEfficiencyFactor, passerRating } from '../../../src/utils/efficiencyMetrics.js'
import { computeUsageFactors } from '../../../src/utils/usageMetrics.js'
import {
  rebuildPlayerSeasons, rebuildTeamTotals, teamWeeksPlayed, teamRedZoneTotals, refTeam,
} from './nflverseRebuild.mjs'

const EPS = 1e-9
export const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])

// ── tolerance rules ─────────────────────────────────────────────────────────
// kinds: abs (|Δ| ≤ value) · yards (|Δ| ≤ max(5, 1% of ref)) · exact · rel (|Δ|/ref ≤ value)
export function inTolerance(rule, app, ref) {
  const d = Math.abs(app - ref)
  switch (rule.kind) {
    case 'abs': return d <= rule.value + EPS
    case 'yards': return d <= Math.max(5, 0.01 * Math.abs(ref)) + EPS
    case 'exact': return d <= EPS
    case 'rel': return ref === 0 ? d <= EPS : d / Math.abs(ref) <= rule.value + EPS
    default: throw new Error(`unknown rule ${rule.kind}`)
  }
}

// V2.4 team total: out when |Δ|/ref > 1%; ratio in [1.9, 2.1] is a `doubling`.
export function compareTeamTotal(app, ref) {
  if (ref === 0) return { ratio: null, out: app !== 0, doubling: false }
  const ratio = app / ref
  return { ratio, out: !inTolerance({ kind: 'rel', value: 0.01 }, app, ref), doubling: ratio >= 1.9 - EPS && ratio <= 2.1 + EPS }
}

// Rows: { out, traded }. G3 (traded) rows are excluded from outRate; they are reported separately.
export function tallyOutRate(rows) {
  let compared = 0, out = 0
  for (const r of rows) {
    if (r.traded) continue
    compared++
    if (r.out) out++
  }
  return { compared, out, rate: compared > 0 ? out / compared : null }
}

export function signedDistribution(values) {
  const n = values.length
  const hist = { '<=-3': 0, '-2': 0, '-1': 0, '0': 0, '1': 0, '2': 0, '>=3': 0 }
  for (const v of values) {
    const k = v <= -3 ? '<=-3' : v >= 3 ? '>=3' : String(Math.round(v))
    hist[k] = (hist[k] ?? 0) + 1
  }
  const sorted = [...values].sort((a, b) => a - b)
  return {
    n, hist,
    neg: values.filter(v => v < 0).length, zero: values.filter(v => v === 0).length, pos: values.filter(v => v > 0).length,
    min: n ? sorted[0] : null, max: n ? sorted[n - 1] : null,
    median: n ? sorted[Math.floor(n / 2)] : null,
  }
}

export function median(values) {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

const r3 = v => Math.round(v * 1000) / 1000

// Reference efficiency ratios from summed gamelog components (3 dp, like the app). null when the
// metric's opportunity denominator is zero.
export function refEfficiency(pos, t) {
  const out = {}
  if (pos === 'QB') {
    out.passerRating = t.attempts > 0
      ? r3(passerRating({ pass_att: t.attempts, pass_cmp: t.completions, pass_yd: t.passingYards, pass_td: t.passingTds, pass_int: t.passingInterceptions }))
      : null
    out.completionPct = t.attempts > 0 ? r3(t.completions / t.attempts) : null
  } else if (pos === 'RB') {
    out.ypc = t.carries > 0 ? r3(t.rushingYards / t.carries) : null
    out.rushTdRate = t.carries > 0 ? r3(t.rushingTds / t.carries) : null
  } else {
    out.ypt = t.targets > 0 ? r3(t.receivingYards / t.targets) : null
    out.catchRate = t.targets > 0 ? r3(t.receptions / t.targets) : null
    out.ypr = t.receptions > 0 ? r3(t.receivingYards / t.receptions) : null
    out.recTdRate = t.targets > 0 ? r3(t.receivingTds / t.targets) : null
  }
  return out
}

export const EFF_TOL = {
  ypc: 0.05, ypt: 0.05, ypr: 0.05, catchRate: 0.005, completionPct: 0.005,
  rushTdRate: 0.003, recTdRate: 0.003, passerRating: 0.5,
}

const COUNT_METRICS = [
  { app: 'rush_att', ref: 'carries', rule: { kind: 'abs', value: 1 } },
  { app: 'rec_tgt', ref: 'targets', rule: { kind: 'abs', value: 1 } },
  { app: 'rec', ref: 'receptions', rule: { kind: 'abs', value: 1 } },
  { app: 'pass_att', ref: 'attempts', rule: { kind: 'abs', value: 1 } },
  { app: 'pass_cmp', ref: 'completions', rule: { kind: 'abs', value: 1 } },
  { app: 'pass_int', ref: 'passingInterceptions', rule: { kind: 'abs', value: 1 } },
  { app: 'rush_yd', ref: 'rushingYards', rule: { kind: 'yards' } },
  { app: 'rec_yd', ref: 'receivingYards', rule: { kind: 'yards' } },
  { app: 'pass_yd', ref: 'passingYards', rule: { kind: 'yards' } },
  { app: 'rush_td', ref: 'rushingTds', rule: { kind: 'exact' } },
  { app: 'rec_td', ref: 'receivingTds', rule: { kind: 'exact' } },
  { app: 'pass_td', ref: 'passingTds', rule: { kind: 'exact' } },
]
const COUNT_CHECK = { rush_att: 'V2.1', rec_tgt: 'V2.1', rec: 'V2.1', pass_att: 'V2.1', pass_cmp: 'V2.1', pass_int: 'V2.1',
  rush_yd: 'V2.2', rec_yd: 'V2.2', pass_yd: 'V2.2', rush_td: 'V2.3', rec_td: 'V2.3', pass_td: 'V2.3' }

// Weeks a player is "eligible" in: listed in rosterweekly with ACT/INA/RES/PUP on a team that has a REG game
// that week. weeks: { "1": [[team,status],…] }; teamWeeks: { [team]: Set<week> } (era-accurate).
export function eligibleWeeks(weeks, teamWeeks, season) {
  const OK = new Set(['ACT', 'INA', 'RES', 'PUP'])   // mirrors data lib/absence.mjs MISSED_ROSTER_STATUSES
  let n = 0
  for (const [w, pairs] of Object.entries(weeks ?? {})) {
    const week = Number(w)
    if ((pairs ?? []).some(([team, status]) => OK.has(status) && teamWeeks[refTeam(team, season)]?.has(week))) n++
  }
  return n
}

// ── runner ──────────────────────────────────────────────────────────────────
// ctx: { seasons[], careerStats {season: rows}, playersMap, gamelogs {s}, teamcontext {s}, snaps {s}, rosterweekly {s} }
export function runV2(ctx) {
  const { seasons, careerStats, playersMap } = ctx
  const series = {}           // `${check}|${metric}` → { check, metric, rule, bySeason: {s: {compared,out}}, dist? }
  const oot = []              // out-of-tolerance rows
  const traded = []
  const findings = []         // team-key-unmatched etc.
  const info = { unmapped: {}, population: {}, doubling: [], g1: null, g2: null, fallbackBranch: {}, rz: {}, g2: [] }

  const rec = (check, metric, season, out, row, rule = null) => {
    const k = `${check}|${metric}`
    const s = series[k] ?? (series[k] = { check, metric, rule, bySeason: {} })
    const b = s.bySeason[season] ?? (s.bySeason[season] = { compared: 0, out: 0 })
    b.compared++
    if (out) { b.out++; if (row) oot.push({ check, metric, season, ...row }) }
  }
  const pos = pid => playersMap[pid]?.position ?? null

  // reference rebuild
  const refPlayers = {}, refAll = {}, refEx = {}, tradedSet = {}
  for (const s of seasons) {
    refPlayers[s] = rebuildPlayerSeasons(ctx.gamelogs[s], s)
    tradedSet[s] = new Set(Object.entries(refPlayers[s]).filter(([, p]) => p.teams.length > 1).map(([pid]) => pid))
    refAll[s] = rebuildTeamTotals(ctx.gamelogs[s], s)
    refEx[s] = rebuildTeamTotals(ctx.gamelogs[s], s, { excludePids: tradedSet[s] })
    info.unmapped[s] = ctx.gamelogs[s]?.unmapped ?? null
  }

  // careerStats variants (identity of the main one is reused for the cohort caches)
  const careerExTraded = {}
  for (const s of seasons) {
    careerExTraded[s] = Object.fromEntries(Object.entries(careerStats[s]).filter(([pid]) => !tradedSet[s].has(pid)))
  }
  const appTot = computeHistoricalTeamTotals(careerStats, playersMap)
  const appTotCur = computeHistoricalTeamTotals(careerStats, playersMap, { attribution: 'current-team' })
  const appTotEx = computeHistoricalTeamTotals(careerExTraded, playersMap)
  const mapTeams = (totals, s) => {
    const out = {}
    for (const [team, t] of Object.entries(totals ?? {})) {
      const k = refTeam(team, s)
      const a = out[k] ?? (out[k] = { rushAtt: 0, rec: 0, recTgt: 0, rushRz: 0, recRz: 0 })
      for (const f of Object.keys(a)) a[f] += t[f] ?? 0
    }
    return out
  }

  // ── population + V2.1–V2.3 ────────────────────────────────────────────────
  for (const s of seasons) {
    const rows = careerStats[s], ref = refPlayers[s]
    const pop = { appOnly: {}, refOnly: {}, both: 0 }
    for (const [pid, row] of Object.entries(rows)) {
      const p = pos(pid)
      if (!SKILL.has(p) || (row.gamesPlayed ?? 0) < 1) continue
      const r = ref[pid]
      if (!r || r.games < 1) { pop.appOnly[p] = (pop.appOnly[p] ?? 0) + 1; continue }
      pop.both++
      for (const m of COUNT_METRICS) {
        const a = row.stats?.[m.app] ?? 0, b = r.totals[m.ref]
        rec(COUNT_CHECK[m.app], m.app, s, !inTolerance(m.rule, a, b), { pid, position: p, app: a, ref: b, delta: a - b }, m.rule)
        const k = `${COUNT_CHECK[m.app]}|${m.app}`
        ;(series[k].deltas ??= []).push(a - b)
      }
    }
    for (const [pid, r] of Object.entries(ref)) {
      const p = pos(pid) ?? 'unmapped'
      if (r.games < 1) continue
      if (!SKILL.has(p) && p !== 'unmapped') continue
      const row = rows[pid]
      if (!row || (row.gamesPlayed ?? 0) < 1) pop.refOnly[p] = (pop.refOnly[p] ?? 0) + 1
    }
    info.population[s] = pop
  }
  for (const sr of Object.values(series)) if (sr.deltas) { sr.dist = signedDistribution(sr.deltas); delete sr.deltas }

  // ── V2.4 / V2.5 team totals ───────────────────────────────────────────────
  const TEAM_FIELDS = [['rushAtt', 'carries'], ['rec', 'receptions'], ['recTgt', 'targets']]
  for (const s of seasons) {
    const appFull = mapTeams(appTot[s], s), appCur = mapTeams(appTotCur[s], s), appEx = mapTeams(appTotEx[s], s)
    const teams = new Set([...Object.keys(appFull), ...Object.keys(refAll[s]), ...Object.keys(appCur)])
    for (const team of teams) {
      const refT = refAll[s][team], refE = refEx[s][team]
      const aF = appFull[team], aC = appCur[team], aE = appEx[team]
      const sumRef = refT ? TEAM_FIELDS.reduce((a, [, f]) => a + refT[f], 0) : 0
      const sumApp = aF ? TEAM_FIELDS.reduce((a, [f]) => a + aF[f], 0) : 0
      if ((!refT && sumApp > 0) || (!aF && sumRef > 0)) {
        findings.push({ code: 'team-key-unmatched', season: s, team, side: refT ? 'app-missing' : 'ref-missing', appTotal: sumApp, refTotal: sumRef })
        continue
      }
      for (const [af, rf] of TEAM_FIELDS) {
        const full = compareTeamTotal(aF?.[af] ?? 0, refT?.[rf] ?? 0)
        if (full.doubling) info.doubling.push({ season: s, team, metric: af, app: aF[af], ref: refT[rf], ratio: full.ratio })
        const ex = compareTeamTotal(aE?.[af] ?? 0, refE?.[rf] ?? 0)
        rec('V2.4', af, s, ex.out, { team, app: aE?.[af] ?? 0, ref: refE?.[rf] ?? 0, ratio: ex.ratio, fullApp: aF?.[af] ?? 0, fullRef: refT?.[rf] ?? 0 }, { kind: 'rel', value: 0.01 })
        const cur = compareTeamTotal(aC?.[af] ?? 0, refT?.[rf] ?? 0)
        rec('V2.5', af, s, cur.out, { team, app: aC?.[af] ?? 0, ref: refT?.[rf] ?? 0, ratio: cur.ratio })
      }
    }
  }

  // ── V2.6 / V2.7 historical shares; traded table ───────────────────────────
  const refShareOn = (den, totals, kind) => {
    if (!den) return null
    if (kind === 'carry') return den.carries > 0 ? r3(totals.carries / den.carries) : null
    if (kind === 'target') return den.targets > 0 ? r3(totals.targets / den.targets) : null
    return den.receptions > 0 ? r3(totals.receptions / den.receptions) : null
  }
  const refShare = (p, r, team, s, kind) => refShareOn(refAll[s][team], r.totals, kind)
  const movedInfo = (pid, s, appTeam, kind) => {
    const f = kind === 'carry' ? 'carries' : 'targets'
    const out = {}
    for (const [t, v] of Object.entries(refPlayers[s][pid].byTeam)) {
      out[t] = { stat: v.totals[f], refShare: refShare(null, { totals: v.totals }, t, s, kind), pctOfTeamDenom: refAll[s][t]?.[f] ? v.totals[f] / refAll[s][t][f] : null }
    }
    return { teams: out, appTeam }
  }
  // Report-only effect series (never feed a verdict): bySeason holds the count, Σ|Δ| and max|Δ|.
  const recEffect = (check, metric, season, delta) => {
    const k = `${check}|${metric}`
    const sr = series[k] ?? (series[k] = { check, metric, rule: null, bySeason: {} })
    const b = sr.bySeason[season] ?? (sr.bySeason[season] = { compared: 0, out: 0, sumAbs: 0, maxAbs: 0 })
    b.compared++; b.sumAbs += Math.abs(delta); b.maxAbs = Math.max(b.maxAbs, Math.abs(delta))
  }
  const shareKey = (s, pid) => `${s}|${pid}`
  info.fallbackBranch = {}
  info.unexplainedLarge = {}

  // V2.6 (toleranced): the arithmetic of computeHistoricalShares on ex-traded inputs vs the ex-traded reference.
  // Traded players are absent on both sides (listed in `traded`, from the as-run shares).
  const asRunShares = computeHistoricalShares(careerStats, playersMap, appTot)
  const asRunBy = {}
  for (const [pid, entries] of Object.entries(asRunShares)) {
    const p = pos(pid)
    for (const e of entries) {
      const s = Number(e.season)
      if (!seasons.includes(s)) continue
      asRunBy[shareKey(s, pid)] = e.share
      const r = refPlayers[s][pid]
      if (r && r.teams.length > 1) {
        const appTeam = refTeam(resolveAttributedTeam(careerStats[s][pid], playersMap[pid], 'per-season-team'), s)
        traded.push({ check: 'V2.6', season: s, pid, position: p, appShare: e.share, appTeam, ...movedInfo(pid, s, appTeam, p === 'RB' ? 'carry' : 'target') })
      }
    }
  }
  const tradedTeams = {}   // season → teams a traded player played for or is attributed to
  for (const s of seasons) {
    tradedTeams[s] = new Set()
    for (const pid of tradedSet[s]) {
      for (const t of refPlayers[s][pid].teams) tradedTeams[s].add(t)
      const t = careerStats[s][pid]?.team
      if (t) tradedTeams[s].add(refTeam(t, s))
    }
  }
  const exShares = computeHistoricalShares(careerExTraded, playersMap, appTotEx)
  for (const [pid, entries] of Object.entries(exShares)) {
    const p = pos(pid)
    for (const e of entries) {
      const s = Number(e.season)
      if (!seasons.includes(s)) continue
      const r = refPlayers[s][pid]
      const kind = p === 'RB' ? 'carry' : 'target'
      const row = careerExTraded[s][pid]
      const rawTeam = resolveAttributedTeam(row, playersMap[pid], 'per-season-team')
      const appTeam = refTeam(rawTeam, s)
      if (p !== 'RB') {
        const st = row.stats ?? {}
        const tt = appTotEx[s]?.[rawTeam]
        if (!((st.rec_tgt ?? 0) > 0 && (tt?.recTgt ?? 0) > 0)) info.fallbackBranch[s] = (info.fallbackBranch[s] ?? 0) + 1
      }
      if (!r) { rec('V2.6', 'no-reference', s, false, null); continue }
      if (r.teams.length > 1) continue
      const refTm = r.teams[0]
      const ref = refShareOn(refEx[s][refTm], r.totals, kind)
      if (ref == null) continue
      const delta = e.share - ref
      const out = Math.abs(delta) > 0.010 + EPS
      rec('V2.6', p === 'RB' ? 'rbShare' : 'wrTeShare', s, out, { pid, position: p, appTeam, refTeam: refTm, app: e.share, ref, delta, teamMismatch: appTeam !== refTm }, { kind: 'abs', value: 0.01 })
      if (out && Math.abs(delta) > 0.05 + EPS) info.unexplainedLarge['V2.6'] = (info.unexplainedLarge['V2.6'] ?? 0) + 1
      // G3 effect: as-run share (traded players inside the denominator) minus the ex-traded share
      const asRun = asRunBy[shareKey(s, pid)]
      if (asRun != null && (tradedTeams[s].has(refTm) || tradedTeams[s].has(appTeam))) recEffect('V2.6-g3effect', 'share', s, asRun - e.share)
    }
  }

  // V2.7 (current-team, report only): unchanged — per-season reference, true-season-team denominators.
  {
    const shares = computeHistoricalShares(careerStats, playersMap, appTotCur, { attribution: 'current-team' })
    for (const [pid, entries] of Object.entries(shares)) {
      const p = pos(pid)
      for (const e of entries) {
        const s = Number(e.season)
        if (!seasons.includes(s)) continue
        const r = refPlayers[s][pid]
        const kind = p === 'RB' ? 'carry' : 'target'
        const row = careerStats[s][pid]
        const rawTeam = resolveAttributedTeam(row, playersMap[pid], 'current-team')
        const appTeam = refTeam(rawTeam, s)
        if (!r) { rec('V2.7', 'no-reference', s, false, null); continue }
        if (r.teams.length > 1) {
          traded.push({ check: 'V2.7', season: s, pid, position: p, appShare: e.share, appTeam, ...movedInfo(pid, s, appTeam, kind) })
          continue
        }
        const refTm = r.teams[0]
        const ref = refShare(p, r, refTm, s, kind)
        if (ref == null) continue
        const delta = e.share - ref
        const out = Math.abs(delta) > 0.010 + EPS
        const teamMismatch = appTeam !== refTm
        if (!teamMismatch) rec('V2.7', p === 'RB' ? 'rbShare' : 'wrTeShare', s, out, { pid, position: p, appTeam, refTeam: refTm, app: e.share, ref, delta, teamMismatch }, { kind: 'abs', value: 0.01 })
        else {
          rec('V2.7-g2', p === 'RB' ? 'rbShare' : 'wrTeShare', s, out, null)
          info.g2.push({ check: 'V2.7', season: s, pid, delta })
        }
      }
    }
  }

  // ── V2.8 computeTeamContext current-team shares ───────────────────────────
  // Reference groups gamelog counts the way the app does: by the player's CURRENT team, over rows with gp ≥ 1.
  const g1 = []
  for (const s of seasons) {
    const curDen = {}
    for (const [pid, row] of Object.entries(careerStats[s])) {
      if ((row.gamesPlayed ?? 0) < 1) continue
      const r = refPlayers[s][pid]
      const team = refTeam(playersMap[pid]?.team, s)
      if (!r || !team) continue
      const d = curDen[team] ?? (curDen[team] = { carries: 0, receptions: 0, targets: 0 })
      d.carries += r.totals.carries; d.receptions += r.totals.receptions; d.targets += r.totals.targets
    }
    const ctxS = computeTeamContext(careerStats, playersMap, s, { attribution: 'current-team' })
    for (const [pid, ps] of Object.entries(ctxS.playerShares)) {
      const p = pos(pid)
      const r = refPlayers[s][pid]
      if (!r) continue
      const appTeam = refTeam(playersMap[pid]?.team, s)
      const den = curDen[appTeam]
      const seasonTm = r.teams.length === 1 ? r.teams[0] : null   // null for a traded player: no single season team
      // G2 effect: current-team reference share minus the true-season-team share (V2.6's reference, no ex-traded change)
      const g2effect = (kind) => {
        if (seasonTm == null || appTeam === seasonTm) return
        const cur = refShareOn(den, r.totals, kind), own = refShare(p, r, seasonTm, s, kind)
        if (cur == null || own == null) return
        recEffect('V2.8-g2effect', kind === 'carry' ? 'carryShare' : 'receptionShare', s, cur - own)
        info.g2.push({ check: 'V2.8', season: s, pid, delta: cur - own })
      }
      if (p === 'RB') {
        const ref = refShareOn(den, r.totals, 'carry')
        if (ref == null || ps.carryShare == null) continue
        const delta = ps.carryShare - ref
        const out = Math.abs(delta) > 0.010 + EPS
        rec('V2.8', 'carryShare', s, out, { pid, position: p, appTeam, refTeam: appTeam, app: ps.carryShare, ref, delta }, { kind: 'abs', value: 0.01 })
        g2effect('carry')
      } else {
        const refRec = refShareOn(den, r.totals, 'reception')
        const refTgt = refShareOn(den, r.totals, 'target')
        if (ps.targetShare == null) continue
        if (refRec != null) {
          const delta = ps.targetShare - refRec
          const out = Math.abs(delta) > 0.010 + EPS
          rec('V2.8', 'receptionShare', s, out, { pid, position: p, appTeam, refTeam: appTeam, app: ps.targetShare, ref: refRec, delta }, { kind: 'abs', value: 0.01 })
            g2effect('reception')
          if ((p === 'WR' || p === 'TE') && refTgt != null) g1.push({ season: s, pid, receptionShare: refRec, trueTargetShare: refTgt, delta: refRec - refTgt })
        }
      }
    }
    // teamOffense denominators (current-team) vs the reference — reported only
    for (const [team, t] of Object.entries(ctxS.teamOffense)) {
      const k = refTeam(team, s)
      const rt = refAll[s][k]
      if (!rt) continue
      rec('V2.8-teamOffense', 'rushAtt', s, compareTeamTotal(t.rushAtt, rt.carries).out, null)
      rec('V2.8-teamOffense', 'rec', s, compareTeamTotal(t.rec, rt.receptions).out, null)
    }
  }
  {
    const abs = g1.map(x => Math.abs(x.delta)).sort((a, b) => a - b)
    info.g1 = {
      n: g1.length,
      meanAbsGap: g1.length ? abs.reduce((a, b) => a + b, 0) / g1.length : null,
      p95AbsGap: abs.length ? abs[Math.floor(abs.length * 0.95)] : null,
      maxAbsGap: abs.length ? abs[abs.length - 1] : null,
      over0_01: abs.filter(x => x > 0.01).length,
      over0_05: abs.filter(x => x > 0.05).length,
      top: [...g1].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 10),
    }
  }

  // ── V2.9 efficiency inputs · V2.10 red zone plausibility ──────────────────
  const rzMin = {}
  for (const s of seasons) {
    for (const [pid, row] of Object.entries(careerStats[s])) {
      const p = pos(pid)
      if (!SKILL.has(p) || (row.gamesPlayed ?? 0) < 1) continue
      const r = refPlayers[s][pid]
      if (!r || r.games < 1) continue
      const eff = computeEfficiencyFactor(p, row.stats, careerStats, playersMap).efficiencyMetrics
      if (eff) {
        const ref = refEfficiency(p, r.totals)
        for (const [m, tol] of Object.entries(EFF_TOL)) {
          if (!(m in ref)) continue
          const a = eff[m], b = ref[m]
          if (a == null && b == null) continue
          if (a == null || b == null) { rec('V2.9', m, s, true, { pid, position: p, app: a, ref: b, delta: null }, { kind: 'abs', value: tol }); continue }
          rec('V2.9', m, s, !inTolerance({ kind: 'abs', value: tol }, a, b), { pid, position: p, app: a, ref: b, delta: a - b }, { kind: 'abs', value: tol })
        }
      }
      const st = row.stats ?? {}
      const usage = computeUsageFactors(p, st, careerStats, playersMap)
      const bad = []
      if (usage.rzUsageRate != null && (usage.rzUsageRate < 0 || usage.rzUsageRate > 1)) bad.push('rzUsageRate-out-of-[0,1]')
      if ((st.rec_rz_tgt ?? 0) > (st.rec_tgt ?? 0)) bad.push('rec_rz_tgt>rec_tgt')
      if ((st.rush_rz_att ?? 0) > (st.rush_att ?? 0)) bad.push('rush_rz_att>rush_att')
      rec('V2.10', 'plausibility', s, bad.length > 0, { pid, position: p, reasons: bad, rzUsageRate: usage.rzUsageRate })
    }
    // team-level consistency
    const rzRef = teamRedZoneTotals(ctx.teamcontext[s])
    const appRz = mapTeams(appTot[s], s)
    const recRatios = []
    for (const [team, a] of Object.entries(appRz)) {
      const ref = rzRef[team]
      if (!ref) continue
      if (ref.rzRushPlays > 0) {
        const ratio = a.rushRz / ref.rzRushPlays
        rec('V2.10', 'teamRushRz', s, ratio < 0.85 - EPS || ratio > 1.15 + EPS, { team, app: a.rushRz, ref: ref.rzRushPlays, ratio })
      }
      if (ref.rzPassPlays > 0) {
        const ratio = a.recRz / ref.rzPassPlays
        recRatios.push({ team, ratio })
      }
    }
    const rs = recRatios.map(x => x.ratio)
    rzMin[s] = {
      n: rs.length, min: rs.length ? Math.min(...rs) : null, median: median(rs), max: rs.length ? Math.max(...rs) : null,
      over1: recRatios.filter(x => x.ratio > 1.0).map(x => x.team),
    }
  }
  info.rz = rzMin

  // ── V2.11 / V2.12 games played and missed ─────────────────────────────────
  const dist12 = []
  info.dnpBySeason = {}
  info.dnpNegative = []
  for (const s of seasons) {
    const snaps = ctx.snaps[s]?.players ?? {}
    const rw = ctx.rosterweekly[s]?.players ?? {}
    const tw = teamWeeksPlayed(ctx.teamcontext[s])
    const pop = { noSnaps: {}, snapsOnly: {} }
    const dnp = { rowsWithDev: 0, devWeeks: 0, devWeeksMarkedD: 0, devToDRate: null, positive: 0, negative: 0 }
    for (const [pid, row] of Object.entries(careerStats[s])) {
      const p = pos(pid)
      if (!SKILL.has(p)) continue
      const sn = snaps[pid]
      if (!sn) { if ((row.gamesPlayed ?? 0) >= 1) pop.noSnaps[p] = (pop.noSnaps[p] ?? 0) + 1 }
      else rec('V2.11', 'gamesPlayed', s, row.gamesPlayed !== sn.games, { pid, position: p, app: row.gamesPlayed, ref: sn.games, delta: row.gamesPlayed - sn.games }, { kind: 'exact' })
      if (rw[pid]) {
        const snapGames = sn?.games ?? 0   // no snaps entry → 0 games (compared in V2.12 only)
        const expected = eligibleWeeks(rw[pid], tw, s) - snapGames
        const delta = (row.dnpWeeks ?? 0) - expected
        dist12.push(delta)
        rec('V2.12', 'dnpWeeks', s, delta !== 0, { pid, position: p, app: row.dnpWeeks ?? 0, ref: expected, delta }, { kind: 'exact' })
        const dCount = (row.weeklyStatus ?? []).filter(x => x === 'D').length
        rec('V2.12', 'dnpWeeks-vs-D-count', s, dCount !== (row.dnpWeeks ?? 0), { pid, position: p, app: row.dnpWeeks ?? 0, ref: dCount, delta: (row.dnpWeeks ?? 0) - dCount })
        // DEV diagnostics: a DEV week is any week where rosterweekly lists the player with status DEV.
        const devWeeks = Object.entries(rw[pid]).filter(([, pairs]) => (pairs ?? []).some(([, st]) => st === 'DEV')).map(([w]) => Number(w))
        if (devWeeks.length) {
          dnp.rowsWithDev++
          dnp.devWeeks += devWeeks.length
          dnp.devWeeksMarkedD += devWeeks.filter(w => row.weeklyStatus?.[w - 1] === 'D').length
        }
        if (delta > 0) dnp.positive++
        if (delta < 0) {
          dnp.negative++
          const glWeeks = new Set((ctx.gamelogs[s]?.players?.[pid]?.games ?? []).filter(g => g.seasonType === 'REG').map(g => g.week))
          const weeks = []
          for (const [w, pairs] of Object.entries(rw[pid])) {
            for (const [team, rosterStatus] of pairs ?? []) {
              weeks.push({ w: Number(w), rosterStatus, team, weeklyStatus: row.weeklyStatus?.[Number(w) - 1] ?? null, gamelogRow: glWeeks.has(Number(w)) })
            }
          }
          weeks.sort((a, b) => a.w - b.w)
          info.dnpNegative.push({ season: s, pid, position: p, app: row.dnpWeeks ?? 0, ref: expected, weeks })
        }
      }
    }
    dnp.devToDRate = dnp.devWeeks > 0 ? dnp.devWeeksMarkedD / dnp.devWeeks : null
    info.dnpBySeason[s] = dnp
    for (const [pid] of Object.entries(snaps)) {
      const p = pos(pid)
      if (SKILL.has(p) && !careerStats[s][pid]) pop.snapsOnly[p] = (pop.snapsOnly[p] ?? 0) + 1
    }
    info.population[s] = { ...info.population[s], snaps: pop }
  }
  info.dnpSignedDistribution = signedDistribution(dist12)

  // ── per-check summary ─────────────────────────────────────────────────────
  const summary = summarizeV2(series, info)
  return { series, summary, outOfTolerance: oot, traded, findings, info }
}

const TOLERANCED = new Set(['V2.1', 'V2.2', 'V2.3', 'V2.4', 'V2.6', 'V2.8', 'V2.9', 'V2.11', 'V2.12'])
const SECONDARY = new Set(['dnpWeeks-vs-D-count', 'no-reference'])

// One summary row per check id: compared, out, worst per-season rate, verdict. Verdicts are mechanical:
// a toleranced check is `defect` when any season's rate is > 2%, else `pass`; the overrides below only
// escalate. A series named `*-effect` is a report-only measurement and never enters a verdict.
export function summarizeV2(series, info) {
  const byCheck = {}
  for (const sr of Object.values(series)) {
    if (SECONDARY.has(sr.metric) || sr.check.endsWith('effect')) continue
    const c = byCheck[sr.check] ?? (byCheck[sr.check] = { compared: 0, out: 0, worstRate: 0, worst: null, metrics: {} })
    let mc = 0, mo = 0, mw = 0
    for (const [s, b] of Object.entries(sr.bySeason)) {
      mc += b.compared; mo += b.out
      const rate = b.compared ? b.out / b.compared : 0
      if (rate > mw) mw = rate
      if (rate > c.worstRate) { c.worstRate = rate; c.worst = `${sr.metric} ${s}` }
    }
    c.compared += mc; c.out += mo
    c.metrics[sr.metric] = { compared: mc, out: mo, worstRate: mw }
  }
  for (const [id, c] of Object.entries(byCheck)) {
    c.rate = c.compared ? c.out / c.compared : null
    c.verdict = !TOLERANCED.has(id) ? 'gap' : c.worstRate > 0.02 ? 'defect' : 'pass'
  }
  if (byCheck['V2.4'] && info.doubling.length) byCheck['V2.4'].verdict = 'defect'
  for (const id of ['V2.6', 'V2.8']) if (byCheck[id] && (info.unexplainedLarge?.[id] ?? 0) > 0) byCheck[id].verdict = 'defect'
  // V2.10 is consistency-only (G7): never a defect
  if (byCheck['V2.10']) byCheck['V2.10'].verdict = byCheck['V2.10'].out > 0 || Object.values(info.rz).some(r => r.over1?.length) ? 'gap' : 'pass'
  return byCheck
}
