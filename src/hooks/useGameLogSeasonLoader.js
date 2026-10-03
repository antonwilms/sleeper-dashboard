import { useCallback, useRef } from 'react'
import { loadNflGameLogs } from '../api/nflGameLogs'
import { loadNflSchedule } from '../api/nflSchedule'

// The loaders' own graceful-empty shapes (nflGameLogs.js / nflSchedule.js keep `EMPTY` private).
const EMPTY_GAMELOGS = { players: {}, year: null, complete: false, rowCount: 0 }
const EMPTY_SCHEDULE = { games: [], year: null, complete: false, rowCount: 0 }

/**
 * P5c — on-demand gamelogs + schedule for one season, for the pop-up's game-log season switcher.
 * Widens App's `gameLogsByYear` / `nflScheduleByYear` beyond the eager dataSeason (+ sosSeason)
 * loads, which stay untouched; the caller only asks for seasons below dataSeason, so the two never
 * race. A year is recorded in a ref when its fetch STARTS, so a repeat call (React Strict Mode's
 * double effect, or re-picking a season) never re-fetches. An existing map entry is never
 * overwritten. A rejected load (IndexedDB, not the loaders' own graceful paths) still writes the
 * loader's graceful-empty shape, so the pop-up's "loading" state always ends. No cancelled flag:
 * these setters belong to App, which outlives every caller.
 * @returns {(year: number) => void}
 */
export function useGameLogSeasonLoader(setGameLogsByYear, setNflScheduleByYear) {
  const requestedYears = useRef(new Set())

  return useCallback((year) => {
    if (!Number.isInteger(year) || requestedYears.current.has(year)) return
    requestedYears.current.add(year)

    const settle = (set, load, empty, label) => load(year)
      .catch(err => {
        console.warn(`[gameLogSeason] ${label} load error for ${year}:`, err?.message)
        return empty
      })
      .then(r => set(prev => (prev?.[year] !== undefined ? prev : { ...prev, [year]: r })))

    settle(setGameLogsByYear, loadNflGameLogs, EMPTY_GAMELOGS, 'gamelogs')
    settle(setNflScheduleByYear, loadNflSchedule, EMPTY_SCHEDULE, 'schedule')
  }, [setGameLogsByYear, setNflScheduleByYear])
}
