/**
 * src/utils/ktcPicks.js — dp-v2 Slice 7.
 *
 * A second, parallel parse path over the raw KTC rows. `matchKTCToSleeper` exists to resolve
 * PLAYERS and does not skip a pick at its position guard (`position` is `null` there, so
 * `if (position && !SKILL_POSITIONS.has(position))` never fires) — picks fall through to
 * Strategy 2 (name+team) and are silently dropped as unmatched. Do not widen that function; a
 * pick is not a player. This file is the pick-side counterpart, pure and free-standing.
 *
 * KTC prices 36 pick rows = 3 years × 3 tiers × 4 rounds, distinguished ONLY by `name`
 * (`position: null`, `team: "FA"` on every row) — format `<YYYY> <Early|Mid|Late> <1st|2nd|3rd|4th>`.
 * That format originates upstream at keeptradecut.com; neither repo produces it (CR-17).
 */

const PICK_NAME_RE = /^(20\d\d) (Early|Mid|Late) (1st|2nd|3rd|4th)$/
const ROUND_BY_WORD = { '1st': 1, '2nd': 2, '3rd': 3, '4th': 4 }

/**
 * Parses the raw KTC rows into a price table keyed by season → round → tier. Anything not
 * matching the exact `<YYYY> <Early|Mid|Late> <1st|2nd|3rd|4th>` shape is ignored, not guessed
 * at — `team`/`position` are never asserted on.
 * @param {Array<{name?: string, value?: number}>} ktcRows
 * @returns {{ [season: number]: { [round: number]: { Early?: number, Mid?: number, Late?: number } } }}
 */
export function parseKtcPickRows(ktcRows) {
  const table = {}
  for (const row of ktcRows ?? []) {
    const m = PICK_NAME_RE.exec(row?.name ?? '')
    if (!m) continue
    const [, seasonStr, tier, roundWord] = m
    if (!Number.isFinite(row?.value)) continue
    const season = Number(seasonStr)
    const round = ROUND_BY_WORD[roundWord]
    ;((table[season] ??= {})[round] ??= {})[tier] = row.value
  }
  return table
}

/**
 * @param {ReturnType<typeof parseKtcPickRows>} table
 * @param {number} season
 * @param {number} round
 * @param {'Early'|'Mid'|'Late'} [tier]
 * @returns {number|null}  null for an unpriced round — never a fallback number, never a
 *   nearest-round substitute.
 */
export function pickPrice(table, season, round, tier = 'Mid') {
  return table?.[season]?.[round]?.[tier] ?? null
}
