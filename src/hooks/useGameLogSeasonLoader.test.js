// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useGameLogSeasonLoader } from './useGameLogSeasonLoader'

const { loadNflGameLogs, loadNflSchedule } = vi.hoisted(() => ({ loadNflGameLogs: vi.fn(), loadNflSchedule: vi.fn() }))
vi.mock('../api/nflGameLogs', () => ({ loadNflGameLogs }))
vi.mock('../api/nflSchedule', () => ({ loadNflSchedule }))

afterEach(() => { vi.clearAllMocks() })

const logsFor = (y) => ({ players: { p: { games: [] } }, year: y, complete: true, rowCount: 5000 })
const schedFor = (y) => ({ games: [{ week: 1 }], year: y, complete: true, rowCount: 285 })

function useHarness(seed = {}) {
  const [gameLogsByYear, setGameLogsByYear] = useState(seed.logs ?? {})
  const [nflScheduleByYear, setNflScheduleByYear] = useState(seed.sched ?? {})
  const onNeed = useGameLogSeasonLoader(setGameLogsByYear, setNflScheduleByYear)
  return { gameLogsByYear, nflScheduleByYear, onNeed }
}

describe('useGameLogSeasonLoader', () => {
  it('H-1: loads both families for the year and merges into state', async () => {
    loadNflGameLogs.mockImplementation(y => Promise.resolve(logsFor(y)))
    loadNflSchedule.mockImplementation(y => Promise.resolve(schedFor(y)))
    const { result } = renderHook(() => useHarness({ logs: { 2025: logsFor(2025) } }))
    act(() => result.current.onNeed(2024))
    await waitFor(() => {
      expect(result.current.gameLogsByYear[2024]).toEqual(logsFor(2024))
      expect(result.current.nflScheduleByYear[2024]).toEqual(schedFor(2024))
    })
    expect(result.current.gameLogsByYear[2025]).toEqual(logsFor(2025)) // merge, not replace
  })

  it('H-2: a repeat call (and a Strict-Mode-style double call) fetches once', async () => {
    loadNflGameLogs.mockImplementation(y => Promise.resolve(logsFor(y)))
    loadNflSchedule.mockImplementation(y => Promise.resolve(schedFor(y)))
    const { result } = renderHook(() => useHarness())
    act(() => { result.current.onNeed(2023); result.current.onNeed(2023) })
    await waitFor(() => expect(result.current.gameLogsByYear[2023]).toBeDefined())
    act(() => result.current.onNeed(2023))
    expect(loadNflGameLogs).toHaveBeenCalledTimes(1)
    expect(loadNflSchedule).toHaveBeenCalledTimes(1)
  })

  it('H-3: an existing map entry is not overwritten', async () => {
    const existing = logsFor(2024)
    existing.rowCount = 1
    loadNflGameLogs.mockImplementation(y => Promise.resolve(logsFor(y)))
    loadNflSchedule.mockImplementation(y => Promise.resolve(schedFor(y)))
    const { result } = renderHook(() => useHarness({ logs: { 2024: existing } }))
    act(() => result.current.onNeed(2024))
    await waitFor(() => expect(result.current.nflScheduleByYear[2024]).toBeDefined())
    expect(result.current.gameLogsByYear[2024]).toBe(existing)
  })

  it('H-4: a rejected gamelogs load writes the graceful empty (complete: false)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    loadNflGameLogs.mockRejectedValue(new Error('idb down'))
    loadNflSchedule.mockImplementation(y => Promise.resolve(schedFor(y)))
    const { result } = renderHook(() => useHarness())
    act(() => result.current.onNeed(2022))
    await waitFor(() => expect(result.current.gameLogsByYear[2022]).toBeDefined())
    expect(result.current.gameLogsByYear[2022]).toEqual({ players: {}, year: null, complete: false, rowCount: 0 })
    expect(result.current.nflScheduleByYear[2022].complete).toBe(true)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('H-5: a non-integer year makes no call', () => {
    const { result } = renderHook(() => useHarness())
    act(() => { result.current.onNeed('2024'); result.current.onNeed(null); result.current.onNeed(2024.5) })
    expect(loadNflGameLogs).not.toHaveBeenCalled()
    expect(loadNflSchedule).not.toHaveBeenCalled()
  })
})
