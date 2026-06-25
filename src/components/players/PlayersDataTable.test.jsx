// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PlayersDataTable } from './PlayersDataTable'

expect.extend(jestDomMatchers)
afterEach(() => cleanup())

vi.mock('../PlayersTab', async (importActual) => {
  const actual = await importActual()
  return {
    ...actual,
    PlayerProfile: ({ playerId }) => <div data-testid="profile">{playerId}</div>,
  }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const makeRows = n =>
  Array.from({ length: n }, (_, i) => ({ player_id: `p${i}`, full_name: `Player ${i}` }))

const BASE_PROPS = {
  posFilter: 'ALL',
  onPosFilter: vi.fn(),
  pillRowClassName: 'flex gap-1 mb-4',
  toolbar: null,
  loaded: true,
  tableClassName: 'table-fixed',
  colgroup: null,
  header: <th>H</th>,
  colSpan: 6,
  displayRows: makeRows(3),
  page: 1,
  onPageChange: vi.fn(),
  renderRow: r => <tr key={r.player_id}><td>{r.full_name}</td></tr>,
  selectedPlayerId: null,
  onCloseProfile: vi.fn(),
  onSelectPlayer: vi.fn(),
  profileContextValue: null,
  comparisonList: [],
  addToComparison: vi.fn(),
  removeFromComparison: vi.fn(),
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('PlayersDataTable', () => {
  it('pills render + click calls onPosFilter with correct pos', () => {
    const onPosFilter = vi.fn()
    render(<PlayersDataTable {...BASE_PROPS} onPosFilter={onPosFilter} />)
    fireEvent.click(screen.getByRole('button', { name: 'QB' }))
    expect(onPosFilter).toHaveBeenCalledWith('QB')
  })

  it('active pill has accent class', () => {
    render(<PlayersDataTable {...BASE_PROPS} posFilter="RB" />)
    const rbBtn = screen.getByRole('button', { name: 'RB' })
    expect(rbBtn.className).toContain('bg-[var(--color-accent)]')
    const allBtn = screen.getByRole('button', { name: 'ALL' })
    expect(allBtn.className).not.toContain('bg-[var(--color-accent)]')
  })

  it('toolbar slot renders when provided, absent when null', () => {
    const { rerender } = render(
      <PlayersDataTable {...BASE_PROPS} toolbar={<div data-testid="tb" />} />
    )
    expect(screen.getByTestId('tb')).toBeInTheDocument()

    rerender(<PlayersDataTable {...BASE_PROPS} toolbar={null} />)
    expect(screen.queryByTestId('tb')).toBeNull()
  })

  it('pillRowClassName applied to pills container', () => {
    const { container: c } = render(
      <PlayersDataTable {...BASE_PROPS} pillRowClassName="flex gap-1 mb-4" />
    )
    const pillsDiv = c.querySelector('.flex.gap-1.mb-4')
    expect(pillsDiv).not.toBeNull()
  })

  it('!loaded notice present only when loaded=false', () => {
    const { rerender } = render(<PlayersDataTable {...BASE_PROPS} loaded={false} />)
    expect(screen.getByText(/Player data loading in background/)).toBeInTheDocument()

    rerender(<PlayersDataTable {...BASE_PROPS} loaded={true} />)
    expect(screen.queryByText(/Player data loading in background/)).toBeNull()
  })

  it('colgroup slot renders col elements when provided', () => {
    const { container, rerender } = render(
      <PlayersDataTable {...BASE_PROPS} colgroup={<colgroup><col style={{ width: '32px' }} /></colgroup>} />
    )
    expect(container.querySelector('col')).not.toBeNull()

    rerender(<PlayersDataTable {...BASE_PROPS} colgroup={null} />)
    expect(container.querySelector('col')).toBeNull()
  })

  it('tableClassName applied to table element', () => {
    const { container } = render(<PlayersDataTable {...BASE_PROPS} tableClassName="table-auto" />)
    const table = container.querySelector('table')
    expect(table.className).toBe('w-full text-sm table-auto')
  })

  it('pagination: 120 rows shows Showing 1–50 of 120; Prev disabled; first 50 rows rendered', () => {
    const rows = makeRows(120)
    render(
      <PlayersDataTable
        {...BASE_PROPS}
        displayRows={rows}
        renderRow={r => <tr key={r.player_id}><td>{r.full_name}</td></tr>}
        page={1}
      />
    )
    expect(screen.getByText('Showing 1–50 of 120 players')).toBeInTheDocument()
    expect(screen.getByText('1 / 3')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
    expect(screen.getByText('Player 0')).toBeInTheDocument()
    expect(screen.getByText('Player 49')).toBeInTheDocument()
    expect(screen.queryByText('Player 50')).toBeNull()
  })

  it('Next button calls onPageChange with functional updater that increments', () => {
    const onPageChange = vi.fn()
    render(
      <PlayersDataTable
        {...BASE_PROPS}
        displayRows={makeRows(120)}
        page={1}
        onPageChange={onPageChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(onPageChange).toHaveBeenCalledTimes(1)
    const updater = onPageChange.mock.calls[0][0]
    expect(typeof updater).toBe('function')
    expect(updater(1)).toBe(2)
  })

  it('page clamp: page=9 with 10 rows clamps to page 1', () => {
    render(
      <PlayersDataTable
        {...BASE_PROPS}
        displayRows={makeRows(10)}
        page={9}
      />
    )
    expect(screen.getByText('Showing 1–10 of 10 players')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Prev' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('empty-state: loaded=true shows "No players match your filters."', () => {
    render(
      <PlayersDataTable
        {...BASE_PROPS}
        displayRows={[]}
        colSpan={6}
        loaded={true}
      />
    )
    const td = screen.getByText('No players match your filters.')
    expect(td.getAttribute('colspan')).toBe('6')
    expect(screen.queryByText(/Showing/)).toBeNull()
  })

  it('empty-state: loaded=false shows "Loading player data…"', () => {
    render(
      <PlayersDataTable
        {...BASE_PROPS}
        displayRows={[]}
        colSpan={6}
        loaded={false}
      />
    )
    expect(screen.getByText('Loading player data…')).toBeInTheDocument()
  })

  it('profile open: selectedPlayerId + careerStats shows profile testid', () => {
    const onCloseProfile = vi.fn()
    render(
      <PlayersDataTable
        {...BASE_PROPS}
        selectedPlayerId="wr1"
        profileContextValue={{ careerStats: {} }}
        onCloseProfile={onCloseProfile}
      />
    )
    expect(screen.getByTestId('profile').textContent).toBe('wr1')
    fireEvent.click(document.querySelector('.fixed.inset-0'))
    expect(onCloseProfile).toHaveBeenCalledTimes(1)
  })

  it('profile gated: selectedPlayerId with careerStats=null shows no profile', () => {
    render(
      <PlayersDataTable
        {...BASE_PROPS}
        selectedPlayerId="wr1"
        profileContextValue={{ careerStats: null }}
      />
    )
    expect(screen.queryByTestId('profile')).toBeNull()
  })
})
