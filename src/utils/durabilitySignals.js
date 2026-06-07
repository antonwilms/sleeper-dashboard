/**
 * src/utils/durabilitySignals.js
 *
 * Shared injury-season classification helper. Leaf module — imports nothing.
 * Consumed by dynastyScore.js (durability sub-score) and seasonProjection.js
 * (Step 6 projected-games penalty). Both consumers use the same injury-season
 * *definition*; surrounding scoring (multipliers, iteration scope) is per-module.
 *
 * The key distinction: a season is injury-affected only when (a) the base
 * low-games trigger fires AND (b) there is positive evidence the player was a
 * meaningful contributor — in that season or an adjacent (±1) season.
 * Career backups who simply never had a role are not flagged.
 */

// Contributor-evidence thresholds (positive evidence the player had a real role).
// Canonical season snap share: off_snp / tm_off_snp — both terms sum over the
// same present weeks, so the ratio is presence-invariant (matches usageMetrics.js
// / projection Step 5f).
const SNAP_CONTRIB_FLOOR = 0.40   // season snap share off_snp/tm_off_snp; tunable
const MIN_STARTS         = 4      // started ≥4 games → a real role, not a spot fill
const START_RATE_FLOOR   = 0.50   // OR started ≥50% of the games he was active
const VOLUME_FLOOR = {            // baseline starter volume per ACTIVE game
  QB: 15,   // pass_att / gp
  RB: 8,    // rush_att / gp
  WR: 4,    // rec_tgt  / gp
  TE: 3,    // rec_tgt  / gp
}
const VOLUME_KEY = { QB: 'pass_att', RB: 'rush_att', WR: 'rec_tgt', TE: 'rec_tgt' }

// Canonical season snap share — matches usageMetrics.js / projection Step 5f.
// Both terms sum over the same present weeks, so the ratio is presence-invariant.
// Returns null when the snap fields are absent (graceful pre-2021 degradation).
function activeSnapShare(stats) {
  const snaps     = stats?.off_snp
  const teamSnaps = stats?.tm_off_snp
  if (snaps == null || teamSnaps == null || teamSnaps <= 0) return null
  return snaps / teamSnaps
}

// Per-active-game volume for the position's primary opportunity stat.
// Returns null when the volume key is absent.
function volumePerActiveGame(stats, position, gp) {
  const key = VOLUME_KEY[position]
  const v   = key ? stats?.[key] : null
  if (v == null || gp <= 0) return null
  return v / gp
}

/**
 * Positive per-season evidence the player had a meaningful role.
 *
 * Signal priority (first hit wins; falls through to next when a higher-priority
 * signal is ABSENT, not when it is merely below floor):
 *   1. Snap share when active (2021+): off_snp / tm_off_snp ≥ SNAP_CONTRIB_FLOOR
 *   2. Started games (all eras): gamesStarted ≥ MIN_STARTS OR ≥ START_RATE_FLOOR
 *   3. Per-active-game volume (pre-2021 fallback): primary stat / gp ≥ position floor
 *
 * A backup with low snaps, no starts, and thin volume in this season AND both
 * neighbours returns false. A star hurt early (few snaps this year but a full
 * role last year) returns injury-affected via the adjacent-season check in
 * classifyInjurySeason.
 */
export function wasContributorSeason(seasonData, position) {
  if (!seasonData) return false
  const gp = seasonData.gamesPlayed ?? 0
  if (gp <= 0) return false
  const stats = seasonData.stats ?? {}

  // Priority 1 — snap share (best signal, 2021+).
  const snap = activeSnapShare(stats)
  if (snap != null && snap >= SNAP_CONTRIB_FLOOR) return true

  // Priority 2 — started games (all eras).
  const gs = seasonData.gamesStarted
  if (gs != null && (gs >= MIN_STARTS || gs / gp >= START_RATE_FLOOR)) return true

  // Priority 3 — baseline per-active-game volume (pre-2021 fallback).
  const vol = volumePerActiveGame(stats, position, gp)
  if (vol != null && vol >= VOLUME_FLOOR[position]) return true

  return false
}

/**
 * Returns true when the season should count as an injury-affected season.
 *
 * A season counts only when:
 *   (a) the base trigger fires: gamesPlayed < 10 AND dnpWeeks ≥ 3, AND
 *   (b) there is positive contributor evidence in this OR an adjacent (±1) season.
 *
 * Null-safe and pure — no side effects.
 */
export function classifyInjurySeason(careerStats, playerId, position, season) {
  const sd = careerStats?.[season]?.[playerId]
  if (!sd) return false
  const gp  = sd.gamesPlayed ?? 0
  const dnp = sd.dnpWeeks ?? 0
  if (!(gp < 10 && dnp >= 3)) return false   // unchanged base trigger

  // Positive contributor evidence in this OR an adjacent (±1) season.
  return wasContributorSeason(sd, position)
      || wasContributorSeason(careerStats?.[season - 1]?.[playerId], position)
      || wasContributorSeason(careerStats?.[season + 1]?.[playerId], position)
}
