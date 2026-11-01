// View-only, pure, no React. Builds the advanced (play-by-play) side-object `ws.adv` that Market's
// Efficiency fact view reads through marketMetrics.js. Never feeds projection/scoring; never mutates
// `windowStats`, its ws objects, or any loader result — a covered window gets NEW ws objects.
// Coverage is mechanism: gamelog-derived EPA/CPOE columns cover only the dataSeason window; RACR covers the
// dataSeason window (completed advstats) and the live window (live advstats). Elsewhere the columns read —.
import { usableLiveAdvStats, flooredRacr, liveRacrCell } from './liveAdvStats'

export const GAMELOG_ADV_KEYS = ['epaPerAtt', 'cpoe', 'rushEpaTotal', 'rushEpaPerAtt', 'epaPerTgt']

/**
 * @returns {{ stats: Map|null, coverage: { gamelogs: State, racr: State, racrLiveAvailable: boolean } }}
 *   State = 'covered' | 'outside' | 'unloaded'
 */
export function buildAdvanced({
  windowStats, window, dataSeason, seasonEfficiency, advStats, advStatsLive, liveSeason, liveWindowSeason,
}) {
  const isDataSeasonWindow = window?.kind === 'season' && window.seasons.length === 1
    && Number.isFinite(dataSeason) && window.seasons[0] === dataSeason
  const isLiveWindow = window?.kind === 'live'
  const liveById = usableLiveAdvStats(advStatsLive, liveSeason, dataSeason)

  const gamelogs = isDataSeasonWindow ? (seasonEfficiency ? 'covered' : 'unloaded') : 'outside'
  const racr = isDataSeasonWindow
    ? (advStats?.complete && advStats.year === dataSeason ? 'covered' : 'unloaded')
    : isLiveWindow
      ? (liveById != null && liveSeason === window.seasons[0] ? 'covered' : 'unloaded')
      : 'outside'
  const racrLiveAvailable = liveById != null && liveWindowSeason != null && liveSeason === liveWindowSeason
  const coverage = { gamelogs, racr, racrLiveAvailable }

  if (!windowStats) return { stats: null, coverage }
  if (gamelogs !== 'covered' && racr !== 'covered') return { stats: windowStats, coverage }

  const stats = new Map()
  for (const [pid, ws] of windowStats) {
    const adv = {}
    for (const k of GAMELOG_ADV_KEYS) adv[k] = gamelogs === 'covered' ? (seasonEfficiency[pid]?.[k] ?? null) : null
    adv.racr = racr !== 'covered' ? null
      : isLiveWindow ? (liveRacrCell(liveById[pid])?.racr ?? null)
      : flooredRacr(advStats.byId?.[pid])
    stats.set(pid, { ...ws, adv })
  }
  return { stats, coverage }
}
