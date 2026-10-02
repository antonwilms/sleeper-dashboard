// Fantasy points allowed by position, blended and ranked (task file:
// .claude/tasks/fpa-defense-ranking.md; inputs rebuilt by defence-numbers-rebuild.md). Pure,
// view-only — no React, no I/O. Never imported by projection/scoring (see the F-24-style research
// doc, docs/prediction-research-eval.md:175-186: opponent strength is explicitly out of scope for
// projectedPPG); guarded by src/__tests__/opponentStrengthViewOnly.test.js.
//
// Source: Sleeper's weekly stat rows (src/api/defenceWeekly.js), not the data store's DEF rows.
// Every QB/RB/WR/TE row names the defence it faced (`row.opponent`), so its points — scored in the
// league's own scoring — are credited to that defence; each `TEAM_<abbr>` row names the defence its
// offence faced and carries that offence's pass/rush yards, and the weeks they name are the
// defence's games. `buildDefenceSeasonAllowed` folds one season's loader result into season totals;
// `buildFpaTable` blends two such seasons (last season = `prior`, the live season's completed weeks
// = `current`) exactly as before.

import { normalizeTeamForSchedule } from './nflStats'
import { calculateFantasyPoints } from './fantasyPoints'

// The app is QB/RB/WR/TE structurally (SKILL_POSITIONS elsewhere) — K and DEF lines are
// deliberately not credited to a defence.
export const FPA_POSITIONS = ['qb', 'rb', 'wr', 'te']

// Shrinkage weight, in pseudo-games, given to the prior season once the current season has real
// games (fpaPerGame = (gCur·rateCur + K·ratePrior) / (gCur+K)). Crossover (equal weight) at
// gCur = 3. Once gCur reaches FPA_PRIOR_DROP_GAMES (9), the prior is dropped entirely and the blend
// reads 100% current (see blendFpaPerGame's first branch) — the current season's weight does not
// merely approach a ceiling here, it reaches one. Derived from measured year-over-year stability of
// points-allowed; the study is not reproduced in-repo (see the parent task file's provenance note).
// If a different value is wanted later, this is the single knob.
export const PRIOR_WEIGHT_GAMES = 3

// Games played at which the current season fully replaces the prior term — see blendFpaPerGame's
// first branch, which returns current.rate unblended once gCur reaches this. Expressed in games,
// not weeks: a defence with an early bye has played fewer games than its week number by kickoff,
// so a week-based label would be wrong for it. This constant is the single source for both the
// enforced drop and any displayed "all N gm" label derived from it.
export const FPA_PRIOR_DROP_GAMES = 9

function regWeeks(season) {
  return season >= 2021 ? 18 : 17
}

/**
 * Which seasons/weeks the defence loader fetches. `dataSeason` (last season with data) in full, plus
 * the live season's COMPLETED weeks (`week - 1` — the in-progress week's partial games never enter
 * a rate; the same played-weeks rule `playedWeeklyMaps` uses). `currentNflWeek: 0` for a finished
 * season gives `statsTTL` its 7-day branch.
 * @returns {Array<{season:number, throughWeek:number, currentNflWeek:number}>}
 */
export function defenceLoadPlan({ dataSeason, nflState } = {}) {
  if (dataSeason == null) return []
  const plan = [{ season: dataSeason, throughWeek: regWeeks(dataSeason), currentNflWeek: 0 }]
  const live = parseInt(nflState?.season, 10)
  if (Number.isFinite(live) && live > dataSeason) {
    const type = nflState.season_type
    if (type === 'post') {
      plan.push({ season: live, throughWeek: regWeeks(live), currentNflWeek: 0 })
    } else if (type === 'regular') {
      const tw = Math.min((nflState.week ?? 0) - 1, regWeeks(live))
      if (tw >= 1) plan.push({ season: live, throughWeek: tw, currentNflWeek: nflState.week })
    }
  }
  return plan
}

/**
 * One season's loader result (`loadDefenceWeeklyRows`) -> per-defence season TOTALS, keyed in the
 * era-accurate domain. `null` unless the result is `complete`.
 *
 * The CR-16 hop: Sleeper rows name the defence in the Sleeper domain (`LAR`); /teams' rows are
 * era-accurate (`LA`). Applied via `normalizeTeamForSchedule`, not a hand-rolled remap — without it
 * the Rams row renders `—`.
 *
 * `gp` counts the weeks some TEAM_ row names the defence as its opponent, never player rows.
 * Points credited to a defence with no played week are dropped, never divided by 0.
 * @returns {{season:number, weeks:number[], failedWeeks:number[], teams:{[eraTeam:string]:{gp:number, pts:{qb:number,rb:number,wr:number,te:number}, passYd:number, rushYd:number}}}|null}
 */
export function buildDefenceSeasonAllowed(loaderResult, { playerMap = null, scoringSettings = {} } = {}) {
  if (!loaderResult?.complete) return null
  const acc = {}
  const entry = (team) => (acc[team] ??= {
    played: new Set(), pts: { qb: 0, rb: 0, wr: 0, te: 0 }, passYd: 0, rushYd: 0,
  })

  for (const { week, rows } of loaderResult.weeks) {
    for (const [id, row] of Object.entries(rows ?? {})) {
      if (row?.opponent == null) continue
      const def = normalizeTeamForSchedule(row.opponent)
      if (id.startsWith('TEAM_')) {
        const e = entry(def)
        e.played.add(week)
        e.passYd += (row.stats?.pass_yd ?? 0) - (row.stats?.pass_sack_yds ?? 0)
        e.rushYd += row.stats?.rush_yd ?? 0
        continue
      }
      const pos = playerMap?.[id]?.position?.toLowerCase()
      if (!FPA_POSITIONS.includes(pos)) continue
      entry(def).pts[pos] += calculateFantasyPoints(row.stats ?? {}, scoringSettings ?? {})
    }
  }

  const teams = {}
  for (const [team, e] of Object.entries(acc)) {
    if (e.played.size === 0) continue
    teams[team] = { gp: e.played.size, pts: e.pts, passYd: e.passYd, rushYd: e.rushYd }
  }
  return {
    season: loaderResult.year,
    weeks: loaderResult.weeks.map(w => w.week),
    failedWeeks: loaderResult.failedWeeks ?? [],
    teams,
  }
}

/**
 * One defence's per-game league-scored points allowed to `pos`, or null. `allowed` is a `teams` map
 * (`buildDefenceSeasonAllowed`'s, era-keyed); `team` is era-domain.
 *
 * `gp <= 0` returns null EXPLICITLY — the caller must drop the term rather than compute pts/0,
 * which is Infinity (or NaN for 0/0), and `0 * Infinity === NaN` in JS. This does not "fall out" of
 * the blend formula; it has to be guarded here.
 */
export function computeFpaPerGame(allowed, team, pos) {
  const row = allowed?.[team]
  if (!row) return null
  if (!(row.gp > 0)) return null
  const pts = row.pts?.[pos]
  if (pts == null) return null
  return pts / row.gp
}

/** One defence's per-game { pass, rush } yards allowed (pass net of sack yards), or null on the same conditions. */
export function computeYardsPerGame(allowed, team) {
  const row = allowed?.[team]
  if (!row) return null
  if (!(row.gp > 0)) return null
  return { pass: row.passYd / row.gp, rush: row.rushYd / row.gp }
}

// §2's blend. `current` is {rate, gp}|null (already gp<=0-guarded upstream); `priorRate` is a
// number|null. gCur === 0 (current absent, or its own gp<=0) is an explicit branch here, not a
// literal division — it never reaches fpa/0. gCur >= FPA_PRIOR_DROP_GAMES is checked first and
// implies gCur > 0, so current.rate is safe to read there without re-guarding.
function blendFpaPerGame(current, priorRate) {
  const gCur = current?.gp ?? 0
  if (gCur >= FPA_PRIOR_DROP_GAMES) return current.rate
  if (gCur > 0 && priorRate != null) {
    return (gCur * current.rate + PRIOR_WEIGHT_GAMES * priorRate) / (gCur + PRIOR_WEIGHT_GAMES)
  }
  if (gCur > 0) return current.rate
  if (priorRate != null) return priorRate
  return null
}

/**
 * Blended per-game fantasy points allowed by position, one row per team (era-accurate domain).
 * One pass per `teams` map — never a per-team-per-metric recomputation, the mistake
 * computeLeagueStanding makes and buildLeagueRankTable/buildTeamMetricsTable were written to avoid.
 *
 * Takes the two `teams` maps `buildDefenceSeasonAllowed` returns — `prior` (last season) and
 * `current` (the live season's completed weeks) — or null for either; the caller resolves both
 * halves and passes them straight through.
 *
 * Each cell also carries `weights[pos]` — the current season's games-played weight (`gCur`) that
 * fed the blend for that team/position, since `blendFpaPerGame` does not otherwise let it escape.
 * `weights` is a sibling key on the row, not itself an `FPA_POSITIONS` entry — `rankFpaTable` (which
 * iterates `FPA_POSITIONS` explicitly) and any bare-number consumer of `table[team][pos]` are
 * unaffected by its presence.
 *
 * Until the live season's weekly rows are available (no completed week yet, or the loader hasn't
 * resolved), `current` is null and this is exactly the prior season's rate for every team,
 * `weights[pos]` all 0 — correct behaviour, not a bug.
 * @param {{prior: object|null, current: object|null}} allowed
 * @returns {{[team:string]: {qb:number|null, rb:number|null, wr:number|null, te:number|null, weights: {qb:number, rb:number, wr:number, te:number}}}}
 */
export function buildFpaTable({ prior = null, current = null } = {}) {
  const teams = new Set([...Object.keys(prior ?? {}), ...Object.keys(current ?? {})])
  const table = {}
  for (const team of teams) {
    const row = {}
    const weights = {}
    for (const pos of FPA_POSITIONS) {
      const priorRate = computeFpaPerGame(prior, team, pos)
      const rate = computeFpaPerGame(current, team, pos)
      const cur = rate != null ? { rate, gp: current[team].gp } : null
      row[pos] = blendFpaPerGame(cur, priorRate)
      weights[pos] = cur?.gp ?? 0
    }
    row.weights = weights
    table[team] = row
  }
  return table
}

/**
 * Per-position ranks over `buildFpaTable`'s output, ascending (1 = toughest / lowest points
 * allowed). Never assumes 32 teams or a 1-32 range — ranks over however many teams have a non-null
 * value for that position; a team with no resolved value for a position gets a null rank rather
 * than being dropped from the object, so a caller can render `—` without an extra existence check.
 * @param {ReturnType<typeof buildFpaTable>} table
 * @returns {{[team:string]: {qb:number|null, rb:number|null, wr:number|null, te:number|null}}}
 */
export function rankFpaTable(table) {
  const ranks = {}
  for (const team of Object.keys(table)) ranks[team] = { qb: null, rb: null, wr: null, te: null }

  for (const pos of FPA_POSITIONS) {
    const entries = Object.entries(table)
      .map(([team, row]) => [team, row[pos]])
      .filter(([, v]) => v != null)
      .sort((a, b) => a[1] - b[1])
    entries.forEach(([team], idx) => { ranks[team][pos] = idx + 1 })
  }
  return ranks
}
