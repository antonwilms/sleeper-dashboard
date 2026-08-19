// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { TopBar } from './TopBar'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const baseProps = {
  user: null,
  selectedLeague: null,
  onSwitch: () => {},
  showLeagueLink: false,
}

describe('TopBar onboarding state', () => {
  it('renders without a user (onboarding state)', () => {
    render(
      <MemoryRouter>
        <TopBar {...baseProps} user={null} currentWeek={4} />
      </MemoryRouter>
    )
    expect(screen.getByText('Data current · Week 4')).toBeInTheDocument()
    expect(screen.queryByText('Switch')).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Global search (1b Slice vii §4)
// ---------------------------------------------------------------------------
const players = [
  { player_id: 'p1', full_name: 'Justin Jefferson', position: 'WR', age: 26, nfl_team: 'MIN', score: 92 },
  { player_id: 'p2', full_name: 'Justin Fields', position: 'QB', age: 25, nfl_team: 'NYJ', score: null },
  { player_id: 'p3', full_name: "Ja'Marr Chase", position: 'WR', age: 24, nfl_team: 'CIN', score: 95 },
]

function renderTopBar(overrides = {}) {
  const onOpenPlayerDetail = overrides.onOpenPlayerDetail ?? vi.fn()
  const utils = render(
    <MemoryRouter>
      <TopBar {...baseProps} {...overrides} onOpenPlayerDetail={onOpenPlayerDetail} />
    </MemoryRouter>
  )
  return { ...utils, onOpenPlayerDetail }
}

describe('TopBar global search', () => {
  it('the field is disabled when searchablePlayers is empty/omitted', () => {
    renderTopBar()
    expect(screen.getByLabelText('Search players')).toBeDisabled()
  })

  it('the field is enabled when searchablePlayers is non-empty', () => {
    renderTopBar({ searchablePlayers: players })
    expect(screen.getByLabelText('Search players')).not.toBeDisabled()
  })

  it('fewer than 2 characters renders no dropdown', () => {
    renderTopBar({ searchablePlayers: players })
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'J' } })
    expect(screen.queryByTestId('search-dropdown')).not.toBeInTheDocument()
  })

  it('zero matches renders no dropdown (not an empty panel)', () => {
    renderTopBar({ searchablePlayers: players })
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'zzzzz' } })
    expect(screen.queryByTestId('search-dropdown')).not.toBeInTheDocument()
  })

  it('≥2 characters opens a dropdown, ranked by score descending with nulls last', () => {
    renderTopBar({ searchablePlayers: players })
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'justin' } })
    const dropdown = screen.getByTestId('search-dropdown')
    const names = [...dropdown.querySelectorAll('[role="button"]')].map(el => el.textContent)
    // Both "Justin ..." players match; Jefferson (92) ranks above Fields (null → sinks last).
    expect(names[0]).toContain('Jefferson')
    expect(names[1]).toContain('Fields')
  })

  it('the match is case-insensitive and null-guarded against a missing full_name', () => {
    const withGap = [...players, { player_id: 'p4', position: 'RB', age: 22, nfl_team: 'DAL', score: 10 }]
    renderTopBar({ searchablePlayers: withGap })
    expect(() => fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'JEFFERSON' } })).not.toThrow()
    expect(screen.getByText('Justin Jefferson')).toBeInTheDocument()
  })

  it('picking a result calls onOpenPlayerDetail with the right id, clears the query, and closes the dropdown', () => {
    const { onOpenPlayerDetail } = renderTopBar({ searchablePlayers: players })
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: "Chase" } })
    fireEvent.click(screen.getByText("Ja'Marr Chase"))
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('p3')
    expect(screen.getByLabelText('Search players')).toHaveValue('')
    expect(screen.queryByTestId('search-dropdown')).not.toBeInTheDocument()
  })

  it('Escape closes the dropdown and blurs the field', () => {
    renderTopBar({ searchablePlayers: players })
    const input = screen.getByLabelText('Search players')
    fireEvent.change(input, { target: { value: 'justin' } })
    expect(screen.getByTestId('search-dropdown')).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByTestId('search-dropdown')).not.toBeInTheDocument()
    expect(input).not.toHaveFocus()
  })

  it('⌘K focuses the field', () => {
    renderTopBar({ searchablePlayers: players })
    const input = screen.getByLabelText('Search players')
    input.blur()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(input).toHaveFocus()
  })

  it('⌘K is inert while the pop-up is open (popupOpen)', () => {
    renderTopBar({ searchablePlayers: players, popupOpen: true })
    const input = screen.getByLabelText('Search players')
    input.blur()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(input).not.toHaveFocus()
  })

  it('clears the query when selectedLeague changes', () => {
    const { rerender } = renderTopBar({ searchablePlayers: players, selectedLeague: { league_id: '1', name: 'A' } })
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'justin' } })
    expect(screen.getByTestId('search-dropdown')).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <TopBar {...baseProps} searchablePlayers={players}
          selectedLeague={{ league_id: '2', name: 'B' }} onOpenPlayerDetail={() => {}} />
      </MemoryRouter>
    )
    expect(screen.getByLabelText('Search players')).toHaveValue('')
    expect(screen.queryByTestId('search-dropdown')).not.toBeInTheDocument()
  })
})
