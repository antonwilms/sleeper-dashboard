// src/hooks/usePlayersTable.js
import { useCallback, useState } from 'react'

/**
 * View-local table state shared by the Players → Dynasty table tabs (Outlook, NFL stats,
 * and the upcoming Weekly tab). Owns ONLY ephemeral view state — never App.jsx domain /
 * playerRows-pipeline state. One independent instance per consuming tab (each tab calls it),
 * which preserves the unmount-on-tab-switch reset behaviour of PlayersSurface.
 *
 * @param {object}  opts
 * @param {string}  opts.storageKey  localStorage key for sort persistence ('outlook-sort' | 'nflstats-sort')
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
      const ascByDefault = col === 'full_name'
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
    handlePosFilter, handleSort, toggleExpanded, setPage, setSelectedPlayerId,
  }
}
