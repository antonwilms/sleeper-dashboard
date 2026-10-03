// The one shared season-phase rule: does "last season vs next season" lead, or "this season so far
// + rest of season"? Pure, no imports. Adopters (P5b My Team, P5c pop-up) call
// `seasonPhase(nflState, { now: Date.now() })` instead of re-reading `season_type` themselves.
// `lastCompleteSeason` is a calendar label, never a loader key: loaders key on `dataSeason` and the
// live file, and the two can disagree (post / pre-rollover) — reconcile against `dataSeason` at the
// call site, never relabel `dataSeason` data with it.

export function regularSeasonWeeks(season) {
  return season >= 2021 ? 18 : 17
}

/**
 * @param {object|null} nflState  Sleeper GET /state/nfl payload (season is a string)
 * @param {{ now?: number }} [opts]  epoch ms; only read for season_type 'off'
 * @returns {null | {
 *   phase: 'offseason' | 'in-season' | 'late-season',
 *   lead: 'last-vs-next' | 'current-plus-ros',
 *   liveSeason: number,
 *   liveSeasonComplete: boolean,
 *   lastCompleteSeason: number,
 *   completedWeeks: number,
 *   regularWeeks: 17 | 18,
 *   currentWeek: number | null,
 * }}
 */
export function seasonPhase(nflState, { now } = {}) {
  if (nflState == null) return null
  const liveSeason = parseInt(nflState.season, 10)
  if (!Number.isFinite(liveSeason)) return null
  const regularWeeks = regularSeasonWeeks(liveSeason)
  const type = nflState.season_type

  let phase, liveSeasonComplete, completedWeeks, currentWeek
  if (type === 'regular') {
    const hasWeek = Number.isInteger(nflState.week)
    const w = hasWeek ? nflState.week : 0
    completedWeeks = Math.max(0, Math.min(w - 1, regularWeeks))
    phase = 'in-season'
    liveSeasonComplete = false
    currentWeek = hasWeek ? nflState.week : null
  } else if (type === 'post') {
    completedWeeks = regularWeeks
    phase = 'late-season'
    liveSeasonComplete = true
    currentWeek = null
  } else if (type === 'off') {
    const raw = nflState.season_start_date
    const start = typeof raw === 'string' && raw !== '' ? Date.parse(raw) : NaN
    const kickedOff = Number.isFinite(start) && Number.isFinite(now) && now >= start
      && new Date(start).getUTCFullYear() === liveSeason
    phase = 'offseason'
    liveSeasonComplete = kickedOff
    completedWeeks = kickedOff ? regularWeeks : 0
    currentWeek = null
  } else if (type === 'pre') {
    phase = 'offseason'
    liveSeasonComplete = false
    completedWeeks = 0
    currentWeek = null
  } else {
    return null
  }

  const lastCompleteSeason = liveSeasonComplete ? liveSeason : liveSeason - 1
  const lead = phase === 'in-season' && completedWeeks >= 1 ? 'current-plus-ros' : 'last-vs-next'
  return { phase, lead, liveSeason, liveSeasonComplete, lastCompleteSeason, completedWeeks, regularWeeks, currentWeek }
}
