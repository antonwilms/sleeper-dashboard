// dp-v2 advstats-live-season-column — view-only, no React. Governs when Market's live RACR
// column is usable and how one player's live cell renders. Reuses MIN_TARGETS, the EPA/target
// floor already applied to the completed season's Efficiency set, rather than defining a second
// floor for the same "per-target rate" shape.

import { MIN_TARGETS } from './seasonEfficiency'

// Returns the live-season advstats map when, and only when, it was loaded for exactly liveSeason
// and liveSeason is later than the completed season the table is pinned to. Otherwise null.
export function usableLiveAdvStats(advStatsLive, liveSeason, dataSeason) {
  return advStatsLive?.complete && Number.isFinite(liveSeason) && advStatsLive.year === liveSeason
    && (dataSeason == null || liveSeason > dataSeason)
    ? advStatsLive.byId ?? null
    : null
}

// One player's live RACR cell. Returns null (renders "—") unless ALL hold: racr finite,
// components.targets finite and >= MIN_TARGETS, components.weeks a finite integer >= 1.
export function liveRacrCell(row) {
  const racr = row?.racr
  const targets = row?.components?.targets
  const weeks = row?.components?.weeks
  if (!Number.isFinite(racr)) return null
  if (!Number.isFinite(targets) || targets < MIN_TARGETS) return null
  if (!Number.isFinite(weeks) || !Number.isInteger(weeks) || weeks < 1) return null
  return { racr, weeks, targets }
}
