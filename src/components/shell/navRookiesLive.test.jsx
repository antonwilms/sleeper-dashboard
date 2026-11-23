// @vitest-environment jsdom
// F5-T3 — with the flag flipped on, Rookies takes its reserved positions (last MANAGE item, 5th tab).
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { NavRail } from './NavRail'
import { BottomTabBar } from './BottomTabBar'

vi.mock('./navItems', async importOriginal => ({ ...(await importOriginal()), ROOKIES_ROUTE_LIVE: true }))

expect.extend(jestDomMatchers)
afterEach(cleanup)

const labels = nav => within(nav).getAllByRole('link').map(a => a.textContent.trim())

describe('Rookies nav slot with ROOKIES_ROUTE_LIVE on (F5-T3)', () => {
  it('Rookies is the last MANAGE item (after Teams) and the 5th tab when showRookies is true', () => {
    render(
      <MemoryRouter initialEntries={['/week']}>
        <NavRail showRookies />
        <BottomTabBar showRookies />
      </MemoryRouter>
    )
    expect(labels(screen.getByRole('navigation', { name: 'Primary' }))).toEqual(
      ['This week', 'My Team', 'Market', 'Teams', 'Rookies', 'Standings', 'Schedule', 'Rosters'])
    expect(labels(screen.getByRole('navigation', { name: 'Primary (mobile)' }))).toEqual(
      ['This week', 'My Team', 'Market', 'Teams', 'Rookies'])
  })
})
