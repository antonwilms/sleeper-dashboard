/**
 * Calculate fantasy points for a single player.
 *
 * @param {Object} stats           - Map of stat_key → value (from Sleeper stats endpoint)
 * @param {Object} scoringSettings - Map of stat_key → points (from league.scoring_settings)
 * @returns {number} Total points rounded to 2 decimal places
 *
 * Strategy: loop over scoringSettings keys and multiply by the matching stat value.
 * This means any scoring format works automatically — no hardcoded stat list needed.
 * Keys present in scoringSettings but absent from stats (or vice versa) are skipped.
 */
export function calculateFantasyPoints(stats, scoringSettings) {
  let total = 0;
  for (const [key, multiplier] of Object.entries(scoringSettings)) {
    if (multiplier == null) continue;
    const statValue = stats[key];
    if (statValue == null) continue;
    total += statValue * multiplier;
  }
  return Math.round(total * 100) / 100;
}

// season-rescore.md §2.3a — identical to sleeper-dashboard-data lib/fantasyPoints.mjs RATE_KEYS (CR-14).
// Non-additive keys (rates, longs, percentages) are never summed into season totals meaningfully,
// so scoreSeasonStats excludes them; calculateFantasyPoints (weekly) stays unguarded.
export const NON_ADDITIVE_KEYS = new Set([
  'cmp_pct', 'def_kr_lng', 'def_kr_ypa', 'def_pr_lng', 'def_pr_ypa', 'down_3_pct', 'down_4_pct',
  'fgm_lng', 'fgm_pct', 'g2g_pct', 'kr_lng', 'kr_ypa', 'pass_lng', 'pass_rtg', 'pass_td_lng',
  'pass_ypa', 'pass_ypc', 'pos_rank_half_ppr', 'pos_rank_ppr', 'pos_rank_std', 'pr_lng', 'pr_ypa',
  'rec_lng', 'rec_td_lng', 'rec_ypr', 'rush_lng', 'rush_td_lng', 'rush_ypa', 'rz_pct',
])

const FIRST_DOWN_BONUS_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

// season-rescore.md §2.1 — Sleeper emits bonus_fd_<pos> only 2022+. True iff any row's stats
// carries a key starting 'bonus_fd_' (emission is detected per season, not per row).
export function seasonEmitsFirstDownBonus(rows) {
  if (rows == null || typeof rows !== 'object') return false
  for (const row of Object.values(rows)) {
    const stats = row?.stats
    if (stats == null || typeof stats !== 'object') continue
    for (const key of Object.keys(stats)) {
      if (key.startsWith('bonus_fd_')) return true
    }
  }
  return false
}

// season-rescore.md §2.1 — bonus_fd_<pos> = pass_fd + rec_fd + rush_fd (verified 2022–2026, QB
// included). QB/RB/WR/TE only; returns a NEW object, or `stats` itself when nothing applies
// (other position, or stats already carrying a bonus_fd_* key). Never mutates.
export function withFirstDownBonus(stats, position) {
  if (stats == null || typeof position !== 'string') return stats
  const pos = position.toUpperCase()
  if (!FIRST_DOWN_BONUS_POSITIONS.has(pos)) return stats
  for (const key of Object.keys(stats)) {
    if (key.startsWith('bonus_fd_')) return stats
  }
  return {
    ...stats,
    [`bonus_fd_${pos.toLowerCase()}`]: (stats.pass_fd ?? 0) + (stats.rec_fd ?? 0) + (stats.rush_fd ?? 0),
  }
}

// Scores a season-total stats object. Valid only because Sleeper scoring keys are per-game counts,
// so the dot-product is linear across weeks; NON_ADDITIVE_KEYS are removed from the settings so the
// claim holds by construction for any league. Never mutates its inputs.
export function scoreSeasonStats(stats, scoringSettings, { position = null, deriveFirstDowns = false } = {}) {
  const filtered = {}
  for (const [key, multiplier] of Object.entries(scoringSettings ?? {})) {
    if (!NON_ADDITIVE_KEYS.has(key)) filtered[key] = multiplier
  }
  const scored = deriveFirstDowns ? withFirstDownBonus(stats, position) : stats
  return calculateFantasyPoints(scored ?? {}, filtered)
}

// Returns every key that contributed points, sorted by absolute contribution desc.
// Used by the debug panel to surface unexpected scoring keys.
export function getPointsBreakdown(stats, scoringSettings) {
  const contributions = [];
  let total = 0;
  for (const [key, multiplier] of Object.entries(scoringSettings)) {
    if (multiplier == null) continue;
    const statValue = stats[key];
    if (statValue == null || statValue === 0) continue;
    const pts = statValue * multiplier;
    if (pts === 0) continue;
    contributions.push({ key, statValue, multiplier, pts: Math.round(pts * 100) / 100 });
    total += pts;
  }
  contributions.sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts));
  return { total: Math.round(total * 100) / 100, contributions };
}

// Categorises a scoring stat key into one of four buckets.
function categorizeKey(key) {
  if (key.startsWith('pass_')) return 'pass'
  if (key.startsWith('rush_')) return 'rush'
  if (key === 'rec' || key.startsWith('rec_')) return 'rec'
  return 'other'
}

/**
 * Bucket fantasy points by stat category (pass / rush / rec / other).
 *
 * Categorisation is by stat-key prefix:
 *   - keys starting with `pass_`           → 'pass'
 *   - keys starting with `rush_`           → 'rush'
 *   - the bare key `rec` or starting `rec_` → 'rec'
 *   - everything else                       → 'other'
 *
 * @param {Object} stats            Map of stat_key → value
 * @param {Object} scoringSettings  Map of stat_key → points multiplier
 * @returns {{ pass: number, rush: number, rec: number, other: number }}
 *          Each bucket rounded to 2 dp. All zeros for null / missing inputs.
 */
export function getCategoryPoints(stats, scoringSettings) {
  if (stats == null || scoringSettings == null) return { pass: 0, rush: 0, rec: 0, other: 0 }
  const buckets = { pass: 0, rush: 0, rec: 0, other: 0 }
  for (const [key, multiplier] of Object.entries(scoringSettings)) {
    if (multiplier == null) continue
    const statValue = stats[key]
    if (statValue == null) continue
    buckets[categorizeKey(key)] += statValue * multiplier
  }
  return {
    pass:  Math.round(buckets.pass  * 100) / 100,
    rush:  Math.round(buckets.rush  * 100) / 100,
    rec:   Math.round(buckets.rec   * 100) / 100,
    other: Math.round(buckets.other * 100) / 100,
  }
}
