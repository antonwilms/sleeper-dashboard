// Portfolio Slice D — game-script descriptor and position-fit verdict. Pure, no React, no I/O;
// view-only (never feeds projectedPPG, the dynasty score or any factors entry). This is the module
// Portfolio's GAME SCRIPT column consumes (both tables).

export const MARGIN_LEADS = 4        // points per game
export const MARGIN_TRAILS = -4
// PROE is a FRACTION in this codebase (computeTeamSeasonMetrics().proe is 0.0072-scale), NOT a
// percentage. A threshold of 1.5 here would classify all 32 teams as `balanced` — no error, no NaN,
// a descriptor column that is uniformly wrong.
export const PROE_PASS_HEAVY = 0.015 // FRACTION
export const PROE_RUN_HEAVY = -0.015

/**
 * A team's game-script descriptor, e.g. 'trails · pass-heavy'.
 * @param {number|null} marginPerGame  points for − points against, per game
 * @param {number|null} proe           pass rate over expected, as a FRACTION (0.028 = +2.8%)
 * @returns {{ margin: 'leads'|'trails'|'even'|null,
 *             tempo: 'pass-heavy'|'run-heavy'|'balanced'|null,
 *             label: string|null }}
 */
export function describeGameScript(marginPerGame, proe) {
  const margin = Number.isFinite(marginPerGame)
    ? (marginPerGame >= MARGIN_LEADS ? 'leads' : marginPerGame <= MARGIN_TRAILS ? 'trails' : 'even')
    : null
  const tempo = Number.isFinite(proe)
    ? (proe >= PROE_PASS_HEAVY ? 'pass-heavy' : proe <= PROE_RUN_HEAVY ? 'run-heavy' : 'balanced')
    : null
  const parts = [margin, tempo].filter(x => x != null)
  return { margin, tempo, label: parts.length > 0 ? parts.join(' · ') : null }
}

/**
 * Whether a team's script suits a position. Pass-catchers (QB/WR/TE) want trailing and pass-heavy;
 * backs (RB) want leading and run-heavy. A `leads · pass-heavy` script is `neutral` for both — one
 * half each way is not evidence either way. An unknown/null position is `neutral`, never silently
 * treated as a WR.
 * @param {{margin: string|null, tempo: string|null}|null} script  describeGameScript output
 * @param {string|null} position
 * @returns {'good'|'bad'|'neutral'}
 */
export function gameScriptFit(script, position) {
  if (script == null || !['QB', 'RB', 'WR', 'TE'].includes(position)) return 'neutral'
  const wants = position === 'RB'
    ? { margin: 'leads', tempo: 'run-heavy' }
    : { margin: 'trails', tempo: 'pass-heavy' }
  const against = position === 'RB'
    ? { margin: 'trails', tempo: 'pass-heavy' }
    : { margin: 'leads', tempo: 'run-heavy' }
  const matches = t => script.margin === t.margin || script.tempo === t.tempo
  const w = matches(wants), a = matches(against)
  if (w && !a) return 'good'
  if (a && !w) return 'bad'
  return 'neutral'
}
