// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { useTeamHistoryLoader } from './useTeamHistoryLoader'

const { loadTeamContext } = vi.hoisted(() => ({ loadTeamContext: vi.fn() }))
vi.mock('../api/teamContext', () => ({ loadTeamContext }))

afterEach(() => {
  vi.clearAllMocks()
})

function resultFor(year, overrides = {}) {
  return { teams: { X: { games: [] } }, year, complete: true, rowCount: 1, ...overrides }
}

// Harness: owns real teamContextByYear state so assertions can check the actual merged shape,
// not just mock call args.
function useHarness(careerStats, eagerSeasonCount) {
  const [teamContextByYear, setTeamContextByYear] = useState({})
  const onNeedTeamHistory = useTeamHistoryLoader(careerStats, eagerSeasonCount, setTeamContextByYear)
  return { teamContextByYear, onNeedTeamHistory }
}

describe('useTeamHistoryLoader', () => {
  it('does nothing until onNeedTeamHistory is called', () => {
    const careerStats = { 2021: {}, 2022: {}, 2023: {}, 2024: {}, 2025: {} }
    renderHook(() => useHarness(careerStats, 5))
    expect(loadTeamContext).not.toHaveBeenCalled()
  })

  it('fires once on call, requests only seasons outside the eager window, and merges into state', async () => {
    loadTeamContext.mockImplementation(y => Promise.resolve(resultFor(y)))
    const careerStats = { 2019: {}, 2020: {}, 2021: {}, 2022: {}, 2023: {}, 2024: {}, 2025: {} }
    const { result } = renderHook(() => useHarness(careerStats, 5))

    act(() => result.current.onNeedTeamHistory())

    await waitFor(() => expect(Object.keys(result.current.teamContextByYear)).toHaveLength(2))
    // Eager window is the LAST 5 seasons (2021-2025) — only 2019/2020 are "missing".
    expect(loadTeamContext).toHaveBeenCalledTimes(2)
    expect(loadTeamContext).toHaveBeenCalledWith(2019)
    expect(loadTeamContext).toHaveBeenCalledWith(2020)
    expect(loadTeamContext).not.toHaveBeenCalledWith(2021)
    expect(result.current.teamContextByYear[2019]).toEqual(resultFor(2019))
    expect(result.current.teamContextByYear[2020]).toEqual(resultFor(2020))
  })

  it('merges rather than replacing — pre-existing eager-window entries in state survive the write', async () => {
    loadTeamContext.mockImplementation(y => Promise.resolve(resultFor(y)))
    const careerStats = { 2024: {}, 2025: {} }
    function useHarnessWithSeed() {
      const [teamContextByYear, setTeamContextByYear] = useState({ 2025: resultFor(2025, { rowCount: 999 }) })
      const onNeedTeamHistory = useTeamHistoryLoader(careerStats, 1, setTeamContextByYear)
      return { teamContextByYear, onNeedTeamHistory }
    }
    const { result } = renderHook(() => useHarnessWithSeed())

    act(() => result.current.onNeedTeamHistory())

    await waitFor(() => expect(result.current.teamContextByYear[2024]).toBeDefined())
    // The pre-seeded 2025 entry (eager window) is untouched by the merge.
    expect(result.current.teamContextByYear[2025].rowCount).toBe(999)
  })

  it('Promise.allSettled semantics: one rejected season still writes the others', async () => {
    loadTeamContext.mockImplementation(y => (
      y === 2020 ? Promise.reject(new Error('boom')) : Promise.resolve(resultFor(y))
    ))
    const careerStats = { 2019: {}, 2020: {}, 2021: {} }
    const { result } = renderHook(() => useHarness(careerStats, 1))

    act(() => result.current.onNeedTeamHistory())

    await waitFor(() => expect(result.current.teamContextByYear[2019]).toBeDefined())
    expect(result.current.teamContextByYear[2020]).toBeUndefined()
    expect(Object.keys(result.current.teamContextByYear)).toEqual(['2019'])
  })

  it('never requests a year inside the eager window, even though state starts at {}', async () => {
    loadTeamContext.mockImplementation(y => Promise.resolve(resultFor(y)))
    const careerStats = { 2021: {}, 2022: {}, 2023: {}, 2024: {}, 2025: {} }
    const { result } = renderHook(() => useHarness(careerStats, 5))

    act(() => result.current.onNeedTeamHistory())

    // Nothing is missing (all 5 seasons are the eager window) — no fetch at all.
    await new Promise(r => setTimeout(r, 0))
    expect(loadTeamContext).not.toHaveBeenCalled()
  })

  it('dedupe: calling onNeedTeamHistory again requests each season at most once', async () => {
    loadTeamContext.mockImplementation(y => Promise.resolve(resultFor(y)))
    const careerStats = { 2019: {}, 2020: {}, 2021: {} }
    const { result } = renderHook(() => useHarness(careerStats, 1))

    act(() => result.current.onNeedTeamHistory())
    await waitFor(() => expect(Object.keys(result.current.teamContextByYear)).toHaveLength(2))
    expect(loadTeamContext).toHaveBeenCalledTimes(2)

    // Flipping the flag again (already true — same call) must not re-request anything.
    act(() => result.current.onNeedTeamHistory())
    await new Promise(r => setTimeout(r, 0))
    expect(loadTeamContext).toHaveBeenCalledTimes(2)
  })
})
