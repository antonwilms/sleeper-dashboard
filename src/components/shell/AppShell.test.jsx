// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { isRookieSeason } from './navItems'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const minProps = {
  user: null,
  selectedLeague: null,
  onSwitch: () => {},
}

// ---------------------------------------------------------------------------
// Nav IA
// ---------------------------------------------------------------------------
describe('AppShell nav IA', () => {
  it('renders grouped primary nav labels and the LEAGUE group when showNav', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false}>child</AppShell>
      </MemoryRouter>
    )
    expect(screen.getAllByText('Portfolio').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Market').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Trade desk').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Draft board').length).toBeGreaterThan(0)
    expect(screen.getAllByText('LEAGUE').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Standings').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Schedule').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Rosters').length).toBeGreaterThan(0)
  })

  it('renders children in all cases', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false}>the-child</AppShell>
      </MemoryRouter>
    )
    expect(screen.getByText('the-child')).toBeInTheDocument()
  })

  it('showNav=false suppresses nav rail and bottom tab bar but still renders children', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav={false} showRookies={false}>onboard-content</AppShell>
      </MemoryRouter>
    )
    // Nav labels are absent when showNav is false (onboarding state)
    expect(screen.queryByText('Portfolio')).not.toBeInTheDocument()
    expect(screen.queryByText('Market')).not.toBeInTheDocument()
    expect(screen.getByText('onboard-content')).toBeInTheDocument()
  })

  it('Rookies label is absent when showRookies=false', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false}>child</AppShell>
      </MemoryRouter>
    )
    expect(screen.queryByText('Rookies')).not.toBeInTheDocument()
  })

  it('Rookies label is present when showRookies=true', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={true}>child</AppShell>
      </MemoryRouter>
    )
    expect(screen.getAllByText('Rookies').length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// currentWeek forwarding to TopBar
// ---------------------------------------------------------------------------
describe('AppShell currentWeek forwarding', () => {
  it('does not render a freshness indicator when currentWeek is omitted (null nflState)', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false}>child</AppShell>
      </MemoryRouter>
    )
    expect(screen.queryByText(/Data current/)).not.toBeInTheDocument()
  })

  it('renders the freshness indicator with the given week when currentWeek is set', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false} currentWeek={7}>child</AppShell>
      </MemoryRouter>
    )
    expect(screen.getByText(/Data current · Week 7/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// searchablePlayers / popupOpen / onOpenPlayerDetail forwarding to TopBar (1b Slice vii §4.2)
// ---------------------------------------------------------------------------
describe('AppShell search-prop forwarding', () => {
  const players = [{ player_id: 'p1', full_name: 'Justin Jefferson', position: 'WR', age: 26, nfl_team: 'MIN', score: 92 }]

  it('the search field is disabled when searchablePlayers is omitted', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false}>child</AppShell>
      </MemoryRouter>
    )
    expect(screen.getByLabelText('Search players')).toBeDisabled()
  })

  it('searchablePlayers reaches TopBar — the field enables with a non-empty list', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false} searchablePlayers={players}>child</AppShell>
      </MemoryRouter>
    )
    expect(screen.getByLabelText('Search players')).not.toBeDisabled()
  })

  it('popupOpen reaches TopBar — ⌘K is inert when true', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false} searchablePlayers={players} popupOpen={true}>child</AppShell>
      </MemoryRouter>
    )
    const input = screen.getByLabelText('Search players')
    input.blur()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(input).not.toHaveFocus()
  })

  it('onOpenPlayerDetail reaches TopBar — picking a search result calls it with the player_id', () => {
    const onOpenPlayerDetail = vi.fn()
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false} searchablePlayers={players} onOpenPlayerDetail={onOpenPlayerDetail}>child</AppShell>
      </MemoryRouter>
    )
    fireEvent.change(screen.getByLabelText('Search players'), { target: { value: 'justin' } })
    fireEvent.click(screen.getByText('Justin Jefferson'))
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('p1')
  })
})

// ---------------------------------------------------------------------------
// isRookieSeason helper
// ---------------------------------------------------------------------------
describe('isRookieSeason', () => {
  it('returns true for March (month 2)', () => {
    expect(isRookieSeason(new Date('2026-03-15'))).toBe(true)
  })

  it('returns false for June (month 5) — today offseason', () => {
    expect(isRookieSeason(new Date('2026-06-19'))).toBe(false)
  })

  it('returns true for January (month 0)', () => {
    expect(isRookieSeason(new Date('2026-01-01'))).toBe(true)
  })

  it('returns true for May (month 4) — last rookie-season month', () => {
    expect(isRookieSeason(new Date('2026-05-31'))).toBe(true)
  })

  it('returns false for June through December', () => {
    for (const m of [5, 6, 7, 8, 9, 10, 11]) {
      expect(isRookieSeason(new Date(2026, m, 15))).toBe(false)
    }
  })
})
