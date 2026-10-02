// weekly-decision-1-lineup.md §2 — the weight panel's whole content. Pure, no React, no I/O.
// Renders "how much of this week's numbers is the current season" per signal family (parent
// weekly-decision-surface.md §3's blend table).
//
// One family: `fpa` — `opponentStrength.js`'s `buildFpaTable` is the one blend this app actually
// computes. Its `k`/`dropGames` are imported from that module's own exports (`PRIOR_WEIGHT_GAMES`,
// `FPA_PRIOR_DROP_GAMES`), never re-declared as literals here — a literal is exactly how this panel
// and the blender it describes drift apart. The EPA / rates / pace rows were removed because
// nothing computes them — re-add a row only alongside the code that blends it.
//
// `fpa` drops on GAMES PLAYED, the axis `buildFpaTable` enforces on — a defence with an early bye
// has played fewer games than its week number implies, so a week-based label would be wrong for it.
//
// `blendWeight` is also imported by `inSeasonEvidence.js` for Market's In-season column set.

import { PRIOR_WEIGHT_GAMES, FPA_PRIOR_DROP_GAMES } from './opponentStrength'

export const SIGNAL_FAMILIES = [
  { key: 'fpa', label: 'Points allowed by position', k: PRIOR_WEIGHT_GAMES, dropGames: FPA_PRIOR_DROP_GAMES },
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

// → [{ key, label, k, dropGames, weight, pct }], one row per SIGNAL_FAMILIES entry.
// `weight` is the fraction blendWeight returns; `pct` is the rounded whole percent the bar/label
// render, or null when weight is null. `n = 0` (artboard 9c, week 1 of a new season) makes every
// `pct` 0 — that is data flowing through the formula, not a branch on "is it early".
export function buildWeightPanel(n) {
  return SIGNAL_FAMILIES.map(f => {
    const weight = blendWeight(n, f.k)
    const pct = weight == null ? null : Math.round(weight * 100)
    return { key: f.key, label: f.label, k: f.k, dropGames: f.dropGames, weight, pct }
  })
}
