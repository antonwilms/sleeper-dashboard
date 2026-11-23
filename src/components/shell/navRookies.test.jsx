// @vitest-environment jsdom
// F5 — the Rookies nav slot is hidden while ROOKIES_ROUTE_LIVE is false (no /rookies route exists).
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavRail } from './NavRail'
import { BottomTabBar } from './BottomTabBar'
import { isRookieSeason, ROOKIES_ROUTE_LIVE } from './navItems'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const labels = nav => within(nav).getAllByRole('link').map(a => a.textContent.trim())
const renderBoth = showRookies => render(
  <MemoryRouter initialEntries={['/week']}>
    <NavRail showRookies={showRookies} />
    <BottomTabBar showRookies={showRookies} />
  </MemoryRouter>
)
const RAIL = ['This week', 'My Team', 'Market', 'Teams', 'Standings', 'Schedule', 'Rosters']
const TABS = ['This week', 'My Team', 'Market', 'Teams']

describe('Rookies nav slot (F5)', () => {
  it('F5-T1 the flag ships off, and a January showRookies=true adds no Rookies link to the rail or tab bar', () => {
    expect(ROOKIES_ROUTE_LIVE).toBe(false)
    const showRookies = isRookieSeason(new Date(2027, 0, 15))
    expect(showRookies).toBe(true)
    renderBoth(showRookies)
    const rail = screen.getByRole('navigation', { name: 'Primary' })
    const tabs = screen.getByRole('navigation', { name: 'Primary (mobile)' })
    expect(labels(rail)).toEqual(RAIL)
    expect(labels(tabs)).toEqual(TABS)
    expect(screen.queryByText('Rookies')).not.toBeInTheDocument()
  })

  it('F5-T2 in November (not rookie season) the rail and tab bar are the plain lists', () => {
    renderBoth(isRookieSeason(new Date(2026, 10, 23)))
    expect(labels(screen.getByRole('navigation', { name: 'Primary' }))).toEqual(RAIL)
    expect(labels(screen.getByRole('navigation', { name: 'Primary (mobile)' }))).toEqual(TABS)
  })
})
