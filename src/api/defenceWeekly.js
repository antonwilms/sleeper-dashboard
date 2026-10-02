// defence-numbers-rebuild.md §2 — view-only loader for the weekly stat rows behind the defence
// numbers (points/yards allowed, games). Never imported by projection/scoring; guarded by
// src/__tests__/opponentStrengthViewOnly.test.js. Reads Sleeper's live weekly stats endpoint via
// `getWeeklyStatRows` (it shares that function's `stat-rows/<s>/<w>` cache — `/week`'s own usage
// fetch hits the same keys); rows are kept raw and scored on read (CLAUDE.md "Fantasy points:
// weekly"), by `buildDefenceSeasonAllowed` in src/utils/opponentStrength.js.

import { getWeeklyStatRows } from './sleeperStats'

const DEFENCE_INPUT_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

// Keeps only what buildDefenceSeasonAllowed reads: TEAM_<abbr> rows and QB/RB/WR/TE player rows
// (position from playerMap). Memory, not semantics — a 2,100-row week drops to ~600.
export function filterDefenceInputRows(rows, playerMap) {
  const out = {}
  for (const [id, row] of Object.entries(rows ?? {})) {
    if (id.startsWith('TEAM_') || DEFENCE_INPUT_POSITIONS.has(playerMap?.[id]?.position)) out[id] = row
  }
  return out
}

// season/throughWeek/currentNflWeek come from defenceLoadPlan. Promise.allSettled over weeks
// 1..throughWeek; a rejected week is reported in `failedWeeks`, never thrown. Never rejects.
// `complete` follows the loader convention (consumers branch on it, never on key presence): a
// season with some failed weeks is still `complete` — per-game rates over the weeks that loaded are
// exact — and the failure is surfaced in copy.
export async function loadDefenceWeeklyRows({ season, throughWeek, currentNflWeek, playerMap }) {
  const weekNumbers = []
  for (let w = 1; w <= throughWeek; w++) weekNumbers.push(w)
  const results = await Promise.allSettled(
    weekNumbers.map(w => getWeeklyStatRows(season, w, currentNflWeek))
  )
  const weeks = []
  const failedWeeks = []
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') weeks.push({ week: weekNumbers[i], rows: filterDefenceInputRows(r.value, playerMap) })
    else failedWeeks.push(weekNumbers[i])
  })
  return { year: season, weeks, failedWeeks, complete: weeks.length > 0 }
}
