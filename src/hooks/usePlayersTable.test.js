// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlayersTable } from './usePlayersTable'

afterEach(() => localStorage.clear())

const DS = { column: 'fpPerG', direction: 'desc' }

describe('usePlayersTable', () => {
  it('initial state', () => {
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    expect(result.current.posFilter).toBe('ALL')
    expect(result.current.sortState).toEqual(DS)
    expect(result.current.page).toBe(1)
    expect(result.current.expanded).toBeInstanceOf(Set)
    expect(result.current.expanded.size).toBe(0)
    expect(result.current.selectedPlayerId).toBeNull()
    expect(result.current.sortProps).toEqual({
      sortKey: 'fpPerG',
      sortAsc: false,
      onSort: expect.any(Function),
    })
  })

  it('init reads valid persisted sort', () => {
    localStorage.setItem('k', '{"column":"rec","direction":"asc"}')
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    expect(result.current.sortState).toEqual({ column: 'rec', direction: 'asc' })
  })

  it('init ignores invalid persisted sort — garbage string', () => {
    localStorage.setItem('k', 'garbage')
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    expect(result.current.sortState).toEqual(DS)
  })

  it('init ignores invalid persisted sort — bad direction', () => {
    localStorage.setItem('k', '{"column":"fpPerG","direction":"sideways"}')
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    expect(result.current.sortState).toEqual(DS)
  })

  it('handleSort new column resets to desc and page=1', () => {
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    act(() => { result.current.handleSort('rushYd') })
    expect(result.current.sortState).toEqual({ column: 'rushYd', direction: 'desc' })
    expect(result.current.page).toBe(1)
    expect(JSON.parse(localStorage.getItem('k'))).toEqual({ column: 'rushYd', direction: 'desc' })
  })

  it('handleSort same column flips direction', () => {
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    act(() => { result.current.handleSort('fpPerG') })
    expect(result.current.sortState.direction).toBe('asc')
    act(() => { result.current.handleSort('fpPerG') })
    expect(result.current.sortState.direction).toBe('desc')
  })

  it('handleSort full_name defaults to asc', () => {
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    act(() => { result.current.handleSort('full_name') })
    expect(result.current.sortState).toEqual({ column: 'full_name', direction: 'asc' })
  })

  it('handlePosFilter resets sort to defaultSort and page to 1', () => {
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    act(() => { result.current.setPage(3) })
    act(() => { result.current.handleSort('rushYd') })
    act(() => { result.current.handlePosFilter('QB') })
    expect(result.current.posFilter).toBe('QB')
    expect(result.current.sortState).toEqual(DS)
    expect(result.current.page).toBe(1)
    expect(JSON.parse(localStorage.getItem('k'))).toEqual(DS)
  })

  it('persistence key isolation — sorting one hook does not affect the other key', () => {
    const { result: r1 } = renderHook(() =>
      usePlayersTable({ storageKey: 'outlook-sort', defaultSort: DS }))
    renderHook(() => usePlayersTable({ storageKey: 'nflstats-sort', defaultSort: DS }))
    act(() => { r1.current.handleSort('rec') })
    expect(localStorage.getItem('outlook-sort')).toBeTruthy()
    expect(localStorage.getItem('nflstats-sort')).toBeNull()
  })

  it('toggleExpanded adds then removes id', () => {
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    act(() => { result.current.toggleExpanded('a') })
    expect(result.current.expanded.has('a')).toBe(true)
    act(() => { result.current.toggleExpanded('a') })
    expect(result.current.expanded.has('a')).toBe(false)
  })

  it('setPage and setSelectedPlayerId update values', () => {
    const { result } = renderHook(() => usePlayersTable({ storageKey: 'k', defaultSort: DS }))
    act(() => { result.current.setPage(5) })
    expect(result.current.page).toBe(5)
    act(() => { result.current.setSelectedPlayerId('wr1') })
    expect(result.current.selectedPlayerId).toBe('wr1')
  })
})
