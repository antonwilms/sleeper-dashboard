// weekly-decision-1-lineup.md §2 — the weight panel's whole content. Pure, no React, no I/O.
// Renders "how much of this week's numbers is the current season" per signal family (parent
// weekly-decision-surface.md §3's blend table).
//
// Only `fpa` is enforced anywhere in code today — `opponentStrength.js`'s `buildFpaTable` is the
// one family this app actually blends. Its `k`/`dropGames` are therefore imported from that
// module's own exports (`PRIOR_WEIGHT_GAMES`, `FPA_PRIOR_DROP_GAMES`), never re-declared as
// literals here — a literal is exactly how this panel and the blender it describes drift apart.
// The other three rows are DISPLAY ONLY (parent §3): nothing in this repo computes EPA/rates/pace
// blends yet, so their `k`/`dropWeek` are the design's stated values, not derived from any module.
//
// `dropGames` vs `dropWeek` is deliberate, not sloppy. `fpa` drops on GAMES PLAYED, because that
// is the axis `buildFpaTable` actually enforces on — a defence with an early bye has played fewer
// games than its week number implies, so a week-based "all wk 10" label would be wrong for it. The
// other three families carry `dropWeek` because they have no enforced axis to be wrong about yet.
// A `SIGNAL_FAMILIES` row carries exactly one of the two fields; the panel renders whichever it
// carries and must never fabricate a conversion between them (there is no fixed games-per-week
// ratio a bye respects).
//
// `blendWeight` is also imported by `inSeasonEvidence.js` for Market's In-season column set.

import { PRIOR_WEIGHT_GAMES, FPA_PRIOR_DROP_GAMES } from './opponentStrength'

export const SIGNAL_FAMILIES = [
  { key: 'fpa',   label: 'Points allowed by position', k: PRIOR_WEIGHT_GAMES, dropGames: FPA_PRIOR_DROP_GAMES, dropWeek: null },
  { key: 'epa',   label: 'Offensive / defensive EPA',  k: 5, dropGames: null, dropWeek: 12 },
  { key: 'rates', label: 'Pass rate, PROE, red zone',  k: 7, dropGames: null, dropWeek: 14 },
  { key: 'pace',  label: 'Pace',                       k: 8, dropGames: null, dropWeek: 14 },
]

// n/(n+k) — the current-season weight in a games-played blend. `n` is games played, not the week
// number (at week 2 with one game in the book, n = 1). null for `n == null` (no games-played
// signal at all) or `k <= 0` (an invalid/unset family) — never a division that could yield
// Infinity/NaN. `n === 0` (week 1 of a new season) is a REAL weight of 0, not a missing
// observation, and falls out of the same formula with no special case.
export function blendWeight(n, k) {
  if (n == null || !(k > 0)) return null
  return n / (n + k)
}

// → [{ key, label, k, dropGames, dropWeek, weight, pct }], one row per SIGNAL_FAMILIES entry.
// `weight` is the fraction blendWeight returns; `pct` is the rounded whole percent the bar/label
// render, or null when weight is null. `n = 0` (artboard 9c, week 1 of a new season) makes every
// `pct` 0 — that is data flowing through the formula, not a branch on "is it early".
export function buildWeightPanel(n) {
  return SIGNAL_FAMILIES.map(f => {
    const weight = blendWeight(n, f.k)
    const pct = weight == null ? null : Math.round(weight * 100)
    return { key: f.key, label: f.label, k: f.k, dropGames: f.dropGames, dropWeek: f.dropWeek, weight, pct }
  })
}
