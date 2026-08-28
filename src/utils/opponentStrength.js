// Fantasy points allowed by position, blended and ranked (task file:
// .claude/tasks/fpa-defense-ranking.md). Pure, view-only — no React, no I/O. Never imported by
// projection/scoring (see the F-24-style research doc, docs/prediction-research-eval.md:175-186:
// opponent strength is explicitly out of scope for projectedPPG); guarded by
// src/__tests__/opponentStrengthViewOnly.test.js.
//
// §0 of the task file (fpa-defense-ranking.md) named a prerequisite: careerStats is built
// `s < currentSeason` by construction, so the live season's rows are never in it. That prerequisite
// shipped in in-season-app-read.md (§3) — the live season's row map now reaches this module as
// `currentRows`, resolved by the caller (App.jsx's `currentSeasonTotals` loader) and passed straight
// through, never synthesised into a fabricated `careerStats` shape here or at the call site.

import { normalizeTeamForSchedule } from './nflStats'

// The app is QB/RB/WR/TE structurally (SKILL_POSITIONS elsewhere) — _k and _def are deliberately
// excluded even though DEF rows carry fan_pts_allow_k / fan_pts_allow_def too.
export const FPA_POSITIONS = ['qb', 'rb', 'wr', 'te']

// Shrinkage weight, in pseudo-games, given to the prior season once the current season has real
// games (fpaPerGame = (gCur·rateCur + K·ratePrior) / (gCur+K)). Crossover (equal weight) at
// gCur = 6; real gCur never exceeds 17, so the current season tops out at 17/23 ≈ 74% of the blend
// and the prior always keeps ~26% weight, even in the fantasy playoffs — "slowly adjusting" is
// accurate, "the current season dominates" is not. A judgment call, not a backtested one — there is
// no in-repo backtest for defensive FPA stability. If a lower floor is wanted later, this is the
// single knob.
export const PRIOR_WEIGHT_GAMES = 6

// A DEF row's own key: bare 2-3 letter uppercase abbreviation. Distinct from `TEAM_<abbr>`
// whole-team aggregate rows and from numeric player ids. Deliberately NOT a reuse of
// teamContext.js's `isTeamAggregateId` — that predicate matches `TEAM_*` only and would pass every
// DEF row through as "not a team aggregate" without confirming it actually is a DEF row.
export function isDefenseRowId(id) {
  return typeof id === 'string' && /^[A-Z]{2,3}$/.test(id)
}

/**
 * One defense's per-game fantasy points allowed to `pos`, or null.
 * `rows` is a row map (`{ [rowId]: row }` — e.g. `careerStats[season]` or a live season's
 * `currentSeasonTotals.players`); `team` is the DEF row's OWN key within it (Sleeper domain, e.g.
 * 'LAR').
 *
 * `gamesPlayed <= 0` returns null EXPLICITLY — the caller must drop the term rather than compute
 * fpa/0, which is Infinity (or NaN for 0/0), and `0 * Infinity === NaN` in JS. This does not "fall
 * out" of the blend formula; it has to be guarded here. Covers both preseason (no games at all) and
 * the week-1 team-on-bye case.
 */
export function computeFpaPerGame(rows, team, pos) {
  const row = rows?.[team]
  if (!row) return null
  const gp = row.gamesPlayed
  if (!(gp > 0)) return null
  const fpa = row.stats?.[`fan_pts_allow_${pos}`]
  if (fpa == null) return null
  return fpa / gp
}

// One pass over one row map's DEF rows -> { [team]: { qb: {rate,gp}|null, ... } }, keyed in the
// era-accurate domain teamcontext/Teams.jsx already uses. `rows` is a plain row map (a season slice
// of careerStats, or a live season's players map) — this function has no notion of "season" itself.
//
// De-duplicates on the row's OWN `team` field, not the bare key — 2017-2019 carry 33 DEF rows
// because `OAK` and `LV` are both keyed rows for the same defense (both `team: "OAK"` in those
// years; verified against the data repo's real nfl/season-totals/2017-2019.json). Keying dedup on
// the bare key would double the pre-2020 Raiders/2020+ Raiders' history under two join targets.
//
// The CR-16 hop: DEF rows key the Sleeper domain (LAR); /teams' rows are era-accurate (LA). Without
// this hop the Rams row renders `—` — the same bug 6a's exposure column and 6b's coaching lookup
// both hit. Applied via `normalizeTeamForSchedule`, not a hand-rolled remap.
function collectSeasonFpaRates(rows) {
  const result = {}
  if (!rows) return result

  const seen = new Set()
  for (const key of Object.keys(rows)) {
    if (!isDefenseRowId(key)) continue
    const row = rows[key]
    const identity = row?.team ?? key
    if (seen.has(identity)) continue
    seen.add(identity)

    const team = normalizeTeamForSchedule(identity)
    const perPos = {}
    for (const pos of FPA_POSITIONS) {
      const rate = computeFpaPerGame(rows, key, pos)
      perPos[pos] = rate != null ? { rate, gp: row.gamesPlayed } : null
    }
    result[team] = perPos
  }
  return result
}

// §2's blend. `current` is {rate, gp}|null (already gp<=0-guarded upstream); `priorRate` is a
// number|null. gCur === 0 (current absent, or its own gp<=0) is an explicit branch here, not a
// literal division — it never reaches fpa/0.
function blendFpaPerGame(current, priorRate) {
  const gCur = current?.gp ?? 0
  if (gCur > 0 && priorRate != null) {
    return (gCur * current.rate + PRIOR_WEIGHT_GAMES * priorRate) / (gCur + PRIOR_WEIGHT_GAMES)
  }
  if (gCur > 0) return current.rate
  if (priorRate != null) return priorRate
  return null
}

/**
 * Blended per-game fantasy points allowed by position, one row per team (era-accurate domain).
 * One pass over the DEF rows per row map (via collectSeasonFpaRates) — never a per-team-per-metric
 * recomputation, the mistake computeLeagueStanding makes and buildLeagueRankTable/
 * buildTeamMetricsTable were written to avoid.
 *
 * Takes ROW MAPS, not a `careerStats`+season-key pair — the caller resolves both halves and passes
 * them straight through (`priorRows = careerStats[priorSeason]`,
 * `currentRows = currentSeasonTotals?.players ?? null`). Never synthesise a fabricated
 * `{ ...careerStats, [season]: currentRows }` shape at a call site — that recreates exactly the
 * coupling this signature exists to avoid (in-season-app-read.md §4).
 *
 * Each cell also carries `weights[pos]` — the current season's games-played weight (`gCur`) that
 * fed the blend for that team/position, since `blendFpaPerGame` does not otherwise let it escape.
 * `weights` is a sibling key on the row, not itself an `FPA_POSITIONS` entry — `rankFpaTable` (which
 * iterates `FPA_POSITIONS` explicitly) and any bare-number consumer of `table[team][pos]` are
 * unaffected by its presence.
 *
 * Until the live season's row map is available (no file yet, or the loader hasn't resolved it),
 * `currentRows` is null and this is exactly the prior season's rate for every team, `weights[pos]`
 * all 0 — correct behaviour today, not a bug.
 * @param {{priorRows: object|null, currentRows: object|null}} rows
 * @returns {{[team:string]: {qb:number|null, rb:number|null, wr:number|null, te:number|null, weights: {qb:number, rb:number, wr:number, te:number}}}}
 */
export function buildFpaTable({ priorRows = null, currentRows = null } = {}) {
  const priorRates = collectSeasonFpaRates(priorRows)
  const currentRates = collectSeasonFpaRates(currentRows)

  const teams = new Set([...Object.keys(priorRates), ...Object.keys(currentRates)])
  const table = {}
  for (const team of teams) {
    const row = {}
    const weights = {}
    for (const pos of FPA_POSITIONS) {
      const priorRate = priorRates[team]?.[pos]?.rate ?? null
      const current = currentRates[team]?.[pos] ?? null
      row[pos] = blendFpaPerGame(current, priorRate)
      weights[pos] = current?.gp ?? 0
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
