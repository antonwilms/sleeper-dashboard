// Governs Market's RACR columns: the per-target floor shared by the completed and live columns, and
// when the live column is usable. View-only, no React. Reuses MIN_TARGETS, the EPA/target floor
// already applied to the completed season's Efficiency set, rather than defining a second floor for
// the same "per-target rate" shape.

import { MIN_TARGETS } from './seasonEfficiency'

// Returns the live-season advstats map when, and only when, it was loaded for exactly liveSeason
// and liveSeason is later than the completed season the table is pinned to. Otherwise null.
export function usableLiveAdvStats(advStatsLive, liveSeason, dataSeason) {
  return advStatsLive?.complete && Number.isFinite(liveSeason) && advStatsLive.year === liveSeason
    && (dataSeason == null || liveSeason > dataSeason)
    ? advStatsLive.byId ?? null
    : null
}

// One advstats row's floored RACR: `row.racr` when finite and `row.components.targets` is finite
// and >= MIN_TARGETS, else null. Shared by both the completed and live RACR columns.
export function flooredRacr(row) {
  const racr = row?.racr
  const targets = row?.components?.targets
  if (!Number.isFinite(racr)) return null
  if (!Number.isFinite(targets) || targets < MIN_TARGETS) return null
  return racr
}

// One player's live RACR cell. Returns null (renders "—") unless ALL hold: racr finite (via the
// shared floor above), components.weeks a finite integer >= 1.
export function liveRacrCell(row) {
  const racr = flooredRacr(row)
  const targets = row?.components?.targets
  const weeks = row?.components?.weeks
  if (racr == null) return null
  if (!Number.isFinite(weeks) || !Number.isInteger(weeks) || weeks < 1) return null
  return { racr, weeks, targets }
}
