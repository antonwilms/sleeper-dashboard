import { useCallback, useEffect, useRef, useState } from 'react'
import { loadTeamContext } from '../api/teamContext'

/**
 * dp-v2 Slice 6b — on-demand full-history teamContext load for `/teams/:abbr` team detail.
 * App.jsx's eager effect (widened to a five-season window, `ENV_SEASONS`, by Slice 4c) stays
 * untouched — this hook widens `teamContextByYear` past that window only once a team-detail page
 * actually mounts and calls the returned `onNeedTeamHistory`. Extracted out of App.jsx so this
 * logic is unit-testable without mounting the whole app — this repo's own precedent for that is
 * `utils/tabState.js` (see CLAUDE.md's row for it).
 *
 * Non-negotiables, all inherited from the eager effect this widens:
 * - `Promise.allSettled`, not `Promise.all` — one rejected season must not lose the batch.
 * - A `cancelled` flag checked before the setter (React Strict Mode double-fires effects).
 * - One merged `setTeamContextByYear` write per batch, not one per season.
 *
 * The double-fetch this hook avoids is real, not theoretical: `needFullTeamHistory` can flip true
 * before the eager effect's own fetch resolves, at which point `teamContextByYear` is still `{}`.
 * A diff against that state would re-request the `eagerSeasonCount` seasons already in flight —
 * `loadTeamContext` has no in-flight dedupe (it checks the cache at entry and writes it only
 * after the fetch resolves), so those seasons would genuinely be fetched twice. This hook instead
 * (a) recomputes the eager effect's own target years deterministically — `allSeasons.slice(-n)`,
 * the exact formula the eager effect itself uses — so it always excludes them, without reading
 * that effect's state; and (b) tracks years it has ITSELF started fetching in a ref, recorded when
 * the fetch STARTS (not when it lands), so its own re-renders never re-request the same year.
 *
 * @param {object|null} careerStats
 * @param {number} eagerSeasonCount  the sibling eager effect's own window width (`ENV_SEASONS`)
 * @param {(updater: (prev: object) => object) => void} setTeamContextByYear
 * @returns {() => void} onNeedTeamHistory — call once, e.g. on the team-detail page's mount
 */
export function useTeamHistoryLoader(careerStats, eagerSeasonCount, setTeamContextByYear) {
  const [needFullTeamHistory, setNeedFullTeamHistory] = useState(false)
  const requestedYears = useRef(new Set())

  const onNeedTeamHistory = useCallback(() => setNeedFullTeamHistory(true), [])

  useEffect(() => {
    if (!careerStats || !needFullTeamHistory) return
    const allSeasons = Object.keys(careerStats).map(Number).sort()
    const eagerYears = new Set(allSeasons.slice(-eagerSeasonCount))
    const missing = allSeasons.filter(y => !eagerYears.has(y) && !requestedYears.current.has(y))
    if (missing.length === 0) return

    missing.forEach(y => requestedYears.current.add(y))
    let cancelled = false
    Promise.allSettled(missing.map(y => loadTeamContext(y).then(r => [y, r])))
      .then(results => {
        if (cancelled) return
        const pairs = results.filter(r => r.status === 'fulfilled').map(r => r.value)
        if (pairs.length) setTeamContextByYear(prev => ({ ...prev, ...Object.fromEntries(pairs) }))
      })
    return () => { cancelled = true }
  }, [careerStats, needFullTeamHistory, eagerSeasonCount, setTeamContextByYear])

  return onNeedTeamHistory
}
