// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Board } from '../board/Board'
import { Trade } from '../trade/Trade'
import { DEFAULT_ROUTE } from './navItems'

expect.extend(jestDomMatchers)
afterEach(cleanup)

// Lightweight stubs for heavy surfaces
function PlayersStub() { return <div>players-surface</div> }
function RosterStub() { return <div>roster-surface</div> }
function LeagueViewStub() { return <div>league-view</div> }

function TestRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
      <Route path="/board" element={<Board />} />
      <Route path="/roster" element={<RosterStub />} />
      <Route path="/players" element={<PlayersStub />} />
      <Route path="/trade" element={<Trade />} />
      <Route path="/league" element={<Navigate to="/league/standings" replace />} />
      <Route path="/league/:view" element={<LeagueViewStub />} />
      <Route path="*" element={<Navigate to={DEFAULT_ROUTE} replace />} />
    </Routes>
  )
}

describe('route → element mapping', () => {
  it('/players renders the players stub', () => {
    render(<MemoryRouter initialEntries={['/players']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByText('players-surface')).toBeInTheDocument()
  })

  it('/roster renders the roster stub', () => {
    render(<MemoryRouter initialEntries={['/roster']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByText('roster-surface')).toBeInTheDocument()
  })

  it('/board renders the Board placeholder naming its gating prerequisite', () => {
    render(<MemoryRouter initialEntries={['/board']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument()
    expect(screen.getByText(/marginal-value engine/i)).toBeInTheDocument()
  })

  it('/trade renders the Trade placeholder naming its gating prerequisite', () => {
    render(<MemoryRouter initialEntries={['/trade']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Trade' })).toBeInTheDocument()
    expect(screen.getByText(/trade evaluator/i)).toBeInTheDocument()
  })

  it('/league redirects to /league/standings (renders league-view stub)', () => {
    render(<MemoryRouter initialEntries={['/league']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByText('league-view')).toBeInTheDocument()
  })

  it('/ redirects to DEFAULT_ROUTE (/players)', () => {
    expect(DEFAULT_ROUTE).toBe('/players')
    render(<MemoryRouter initialEntries={['/']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByText('players-surface')).toBeInTheDocument()
  })

  it('unknown path /bogus redirects to DEFAULT_ROUTE (/players)', () => {
    render(<MemoryRouter initialEntries={['/bogus']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByText('players-surface')).toBeInTheDocument()
  })
})
