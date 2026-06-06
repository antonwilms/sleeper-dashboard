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

// --- sanity check (runs once at module load during development) ---
function testFantasyPoints() {
  const stats    = { pass_yd: 300, pass_td: 3 };
  const scoring  = { pass_yd: 0.04, pass_td: 4 };
  const result   = calculateFantasyPoints(stats, scoring);
  // 300 * 0.04 = 12.00  +  3 * 4 = 12.00  →  24.00
  const expected = 24.00;
  if (result === expected) {
    console.log('Fantasy points engine OK');
  } else {
    console.warn(`Fantasy points engine FAIL: expected ${expected}, got ${result}`);
  }
}

testFantasyPoints();
