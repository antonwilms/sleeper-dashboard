import { normalizeTeamForSchedule } from './nflStats'

// week-own-projection.md — the OURS column on `/week`. Pure, view-only, no React, no I/O.
//
// OURS is the engine's displayed season projection (the rest-of-season posterior once in-season
// evidence applies) nudged by this week's Vegas implied team total:
//
//   ours = base × (1 + VEGAS_WEIGHT × (implied / baseline − 1))
//   base     = seasonProjections[id].projectedPPG   (App.jsx's scored map — the displayed number)
//   implied  = this week's implied total for the player's team
//   baseline = mean implied total for that same team over REG weeks before this one (≥ 2 required)
//
// D3: the baseline is the team's OWN earlier lines, not the league average — the base already
// reflects how good the player's offence is, and dividing by the league mean would count that twice.
// D1: Vegas-only. Scaling by the opponent's points allowed made one-week predictions worse at full
// strength in both backtested seasons, so ALLOWS is shown beside OURS and does not move it.
// Backtest: `analysis/p4-weekly-projection-backtest/` in the parent folder (2026-10-03), 2024 and
// 2025 weeks 5–18, ≈2,200 QB/RB/WR/TE player-weeks per season. RMSE, no adjustment 7.063 / 7.115;
// Vegas ×0.5 7.031 / 7.073; points allowed ×1.0 7.254 / 7.202. Sleeper's PROJ is still 2–4% better.
//
// D2: omit, don't approximate — no number unless every input is real, and never a fallback to the
// unadjusted base. This module only READS `seasonProjections`; nothing here may reach
// `projectedPPG`, `playerRows`, the dynasty score, a snapshot or a `factors` entry (guarded by
// weeklyDecisionViewOnly.test.js).

// Half-strength Vegas weight. Picked from the coarse grid {0.25, 0.5, 0.75, 1} in the backtest as
// best or near-best in both seasons — it is not a fitted value.
export const VEGAS_WEIGHT = 0.5
export const MIN_VEGAS_BASELINE_WEEKS = 2
export const OUT_STATUSES = ['Out', 'IR', 'PUP', 'Sus', 'DNR']

// schedule: a complete-gated loadNflSchedule result, or null (the same input buildRegWeekIndex takes).
// -> Map<week:number, Map<eraTeam:string, number>> | null
//
// `spreadLine` is POSITIVE WHEN THE HOME TEAM IS FAVOURED (nflverse's convention). Checked against
// 285 scored 2025 games: sign(result) = sign(spreadLine) in 187 and the mean of result − spreadLine
// is +0.6. A sign flip here would silently invert every adjustment. Deliberately does not call
// buildRegWeekIndex — that index has one call site, by design (CR-08).
export function buildImpliedTotals(schedule) {
  if (!schedule) return null
  const out = new Map()
  for (const g of schedule.games ?? []) {
    if (g.gameType !== 'REG') continue
    const home = normalizeTeamForSchedule(g.homeTeam)
    const away = normalizeTeamForSchedule(g.awayTeam)
    if (!home || !away) continue
    if (!Number.isFinite(g.spreadLine) || !Number.isFinite(g.totalLine)) continue
    if (!out.has(g.week)) out.set(g.week, new Map())
    const wk = out.get(g.week)
    wk.set(home, g.totalLine / 2 + g.spreadLine / 2)
    wk.set(away, g.totalLine / 2 - g.spreadLine / 2)
  }
  return out
}

// team: SLEEPER domain (the row's roster team). Normalised here before lookup, as resolveTeamWeek does.
// -> { implied, baseline, baselineWeeks, minBaselineWeeks, factor } | null
export function vegasFactor(impliedIndex, team, week) {
  if (!impliedIndex || !team || team === 'FA') return null
  const era = normalizeTeamForSchedule(team)
  const implied = impliedIndex.get(week)?.get(era)
  if (!Number.isFinite(implied)) return null

  let sum = 0
  let baselineWeeks = 0
  for (const [w, teams] of impliedIndex) {
    if (!(w < week)) continue
    const v = teams.get(era)
    if (Number.isFinite(v)) { sum += v; baselineWeeks += 1 }
  }
  const baseline = baselineWeeks >= MIN_VEGAS_BASELINE_WEEKS ? sum / baselineWeeks : null
  const factor = baseline != null && baseline > 0
    ? 1 + VEGAS_WEIGHT * (implied / baseline - 1)
    : null
  return { implied, baseline, baselineWeeks, minBaselineWeeks: MIN_VEGAS_BASELINE_WEEKS, factor }
}

// rows: lineup rows with a player_id (filled starters + bench). -> { [player_id]: Own }
// Own = { value: number|null, reason: 'bye'|'out'|'no-base'|'no-line'|'no-baseline'|null,
//         base: number|null, baseKind: 'ros'|'season'|null, status: string|null,
//         vegas: ReturnType<vegasFactor> }
// `value` is unrounded — the cell formats it. First matching reason wins: bye, out, no-base,
// no-line, no-baseline. Never mutates its inputs.
// PROVISIONAL(heuristic): OURS weekly number · the engine's season projection × half the Vegas implied-total swing, not a weekly model · a weekly model fitted and graded against outcomes would make it real
export function buildOwnProjections({ rows, seasonProjections, impliedIndex, currentWeek, playerMap }) {
  const out = {}
  for (const row of rows ?? []) {
    const id = row?.player_id
    if (id == null) continue

    if (row.bye) {
      out[id] = { value: null, reason: 'bye', base: null, baseKind: null, status: null, vegas: null }
      continue
    }

    const status = playerMap?.[id]?.injury_status ?? null
    const proj = seasonProjections?.[id]
    const ppg = proj?.projectedPPG
    const base = Number.isFinite(ppg) ? ppg : null
    const baseKind = base == null ? null : (proj.inSeason ? 'ros' : 'season')
    const vegas = vegasFactor(impliedIndex, row.team, currentWeek)

    let reason = null
    if (OUT_STATUSES.includes(status)) reason = 'out'
    else if (base == null) reason = 'no-base'
    else if (vegas == null) reason = 'no-line'
    else if (vegas.factor == null) reason = 'no-baseline'

    out[id] = {
      value: reason == null ? base * vegas.factor : null,
      reason, base, baseKind, status, vegas,
    }
  }
  return out
}
