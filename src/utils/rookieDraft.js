/**
 * Identifying a league's rookie draft.
 *
 * Sleeper's draft `type` is the draft FORMAT — 'snake' | 'linear' | 'auction'. There is no
 * 'rookie' value, so the `.filter(d => d.type === 'rookie')` this replaces matched nothing and
 * `leagueData.rookieDraftPicks` was always `{}` — silently feeding `null` draft capital into
 * `computeDynastyScore`'s prospect path for every player (`draftMultiplier(null)` = 0.75, the
 * "passed over by the market" tier, where a 1.01 pick should score 1.30).
 *
 * Verified against the live API (league 1312015497465716736, Dynasty 040):
 *
 *   2025 startup   type 'snake'  rounds 32  previous_league_id null  384 picks, years_exp 0–23
 *   2026 rookie    type 'linear' rounds  5  previous_league_id set    60 picks, 59/60 years_exp 0
 *
 * Note `settings.player_type` is `0` on BOTH — this commissioner never set Sleeper's explicit
 * rookies-only flag, so it cannot be the only test. It is honoured when present, since an
 * explicit setting beats an inference.
 *
 * Pure; no React, no I/O.
 */

// Sleeper's `settings.player_type`: 0 = all players, 1 = rookies only, 2 = veterans only.
const PLAYER_TYPE_ROOKIES = 1
const PLAYER_TYPE_VETERANS = 2

/**
 * Roster size, used to tell a roster-filling draft from a short one.
 * Prefers the league's own `roster_positions` (28 in the verified league); falls back to summing
 * the draft's `slots_*` settings when the league object is unavailable.
 */
export function rosterSlotCount(draft, league) {
  const positions = league?.roster_positions
  if (Array.isArray(positions) && positions.length > 0) return positions.length

  const settings = draft?.settings ?? {}
  let total = 0
  let sawSlot = false
  for (const [key, value] of Object.entries(settings)) {
    if (!key.startsWith('slots_')) continue
    if (!Number.isFinite(value)) continue
    sawSlot = true
    total += value
  }
  return sawSlot ? total : null
}

/**
 * Is this draft the league's rookie draft?
 *
 * A startup draft fills rosters; a rookie draft does not. That, plus the league being a
 * continuation season (`previous_league_id` — the startup year has none), separates them without
 * relying on `type`, which carries no such meaning.
 */
export function isRookieDraft(draft, league) {
  if (!draft) return false

  const playerType = draft.settings?.player_type
  if (playerType === PLAYER_TYPE_ROOKIES) return true
  if (playerType === PLAYER_TYPE_VETERANS) return false

  // A first-season league's draft is its startup, never a rookie draft.
  if (!league?.previous_league_id) return false

  // Guards against a redraft/keeper league, where every season drafts a full roster and no
  // draft is a rookie draft. Without this, year 2+ of a redraft league would hand veterans
  // rookie-pick draft capital.
  const rounds = draft.settings?.rounds
  const slots = rosterSlotCount(draft, league)
  if (!Number.isFinite(rounds) || rounds <= 0) return false
  if (!Number.isFinite(slots) || slots <= 0) return false
  return rounds < slots
}

/**
 * The most recent rookie draft among a league's drafts, or null.
 * Seasons are strings on the Sleeper payload; compared numerically.
 */
export function selectRookieDraft(drafts, league) {
  if (!Array.isArray(drafts)) return null
  return drafts
    .filter(d => isRookieDraft(d, league))
    .sort((a, b) => (Number(b?.season) || 0) - (Number(a?.season) || 0))[0] ?? null
}
