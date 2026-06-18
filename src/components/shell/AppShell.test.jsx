// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppShell } from './AppShell'
import { isRookieSeason } from './navItems'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const minProps = {
  user: null,
  selectedLeague: null,
  onSwitch: () => {},
  tooltipsEnabled: true,
  onToggleTooltips: () => {},
}

// ---------------------------------------------------------------------------
// Nav IA
// ---------------------------------------------------------------------------
describe('AppShell nav IA', () => {
  it('renders four primary nav labels and a League affordance when showNav', () => {
    render(
      <MemoryRouter initialEntries={['/players']}>
        <AppShell {...minProps} showNav showRookies={false}>child</AppShell>
      </MemoryRouter>
    )
    expect(screen.getAllByText('Board').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Roster').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Players').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Trade').length).toBeGreaterThan(0)
    expect(screen.getAllByText('League').length).toBeGreaterThan(0)
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
    expect(screen.queryByText('Board')).not.toBeInTheDocument()
    expect(screen.queryByText('Roster')).not.toBeInTheDocument()
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
