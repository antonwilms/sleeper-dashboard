// src/hooks/usePlayersTable.js
import { useCallback, useState } from 'react'

/**
 * View-local table state shared by Market and Portfolio (the Explorer's own Dynasty tabs used it
 * too until 1b Slice viii retired that surface). Owns ONLY ephemeral view state — never App.jsx
 * domain / playerRows-pipeline state. One independent instance per consumer.
 *
 * @param {object}  opts
 * @param {string}  opts.storageKey  localStorage key for sort persistence (e.g. 'market-sort', 'portfolio-sort')
 * @param {{column:string, direction:'asc'|'desc'}} opts.defaultSort  initial sort + the target handlePosFilter resets to
 */
export function usePlayersTable({ storageKey, defaultSort }) {
  const [posFilter, setPosFilter] = useState('ALL')

  const [sortState, setSortStateRaw] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(storageKey))
      if (v && typeof v.column === 'string' && (v.direction === 'asc' || v.direction === 'desc')) return v
    } catch { /* fall through */ }
    return defaultSort
  })
  const setSortState = useCallback(next => {
    setSortStateRaw(prev => {
      const value = typeof next === 'function' ? next(prev) : next
      localStorage.setItem(storageKey, JSON.stringify(value))
      return value
    })
  }, [storageKey])

  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState(() => new Set())
  const [selectedPlayerId, setSelectedPlayerId] = useState(null)

  const handleSort = useCallback(col => {
    setSortState(prev => {
      if (prev.column === col) {
        return { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
      }
      // ceilingRank/floorRank are positional ranks (1 = best) — ascending-first shows the best
      // finishes first on the initial click, matching the Explorer's own (separately implemented)
      // handleSort, which special-cases the same rank-shaped columns. Added for Market's Value
      // set's Ceiling/Floor columns (1b Slice vii follow-up); additive — no other consumer of this
      // hook has a rank-shaped column today. `defEpaPerPlay` (dp-v2 Slice 6a, the Teams index) is
      // a lower-is-better number — ascending-first shows the best defences first, same reasoning.
      // `fpaQb`/`fpaRb`/`fpaWr`/`fpaTe` (fpa-defense-ranking.md, the Teams index) are the same
      // shape again — lower points allowed = tougher defense, ascending-first surfaces it.
      const ascByDefault = col === 'full_name' || col === 'ceilingRank' || col === 'floorRank' || col === 'defEpaPerPlay'
        || col === 'fpaQb' || col === 'fpaRb' || col === 'fpaWr' || col === 'fpaTe'
      return { column: col, direction: ascByDefault ? 'asc' : 'desc' }
    })
    setPage(1)
  }, [setSortState])

  const handlePosFilter = useCallback(pos => {
    setPosFilter(pos)
    setSortState(defaultSort)
    setPage(1)
  }, [setSortState, defaultSort])

  const toggleExpanded = useCallback(id => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const sortProps = { sortKey: sortState.column, sortAsc: sortState.direction === 'asc', onSort: handleSort }

  return {
    posFilter, sortState, page, expanded, selectedPlayerId, sortProps,
    handlePosFilter, handleSort, toggleExpanded, setPage, setSelectedPlayerId, setSortState,
  }
}
