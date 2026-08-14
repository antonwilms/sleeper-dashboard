// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Board } from '../board/Board'
import { Trade } from '../trade/Trade'
import { Portfolio } from '../portfolio/Portfolio'
import { ProfileDataContext } from '../../context/ProfileDataContext'
import { DEFAULT_ROUTE } from './navItems'

expect.extend(jestDomMatchers)
afterEach(cleanup)

// Lightweight stubs for heavy surfaces — routing tests assert routing, not render a
// data-dependent table. Market's own rendering is covered by Market.test.jsx.
function PlayersStub() { return <div>players-surface</div> }
function LeagueViewStub() { return <div>league-view</div> }
function MarketStub() { return <div>market-surface</div> }

function TestRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to={DEFAULT_ROUTE} replace />} />
      <Route path="/portfolio" element={<Portfolio />} />
      <Route path="/market" element={<MarketStub />} />
      <Route path="/board" element={<Board />} />
      <Route path="/roster" element={<Navigate to="/portfolio" replace />} />
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

  it('/portfolio renders the Portfolio placeholder', () => {
    render(<MemoryRouter initialEntries={['/portfolio']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
    expect(screen.getByText(/lands in the next slice/i)).toBeInTheDocument()
  })

  it('/market renders the Market stub', () => {
    render(<MemoryRouter initialEntries={['/market']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByText('market-surface')).toBeInTheDocument()
  })

  it('/roster redirects to /portfolio', () => {
    render(<MemoryRouter initialEntries={['/roster']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Portfolio' })).toBeInTheDocument()
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

  it('/ redirects to DEFAULT_ROUTE (/market)', () => {
    expect(DEFAULT_ROUTE).toBe('/market')
    render(<MemoryRouter initialEntries={['/']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByText('market-surface')).toBeInTheDocument()
  })

  it('unknown path /bogus redirects to DEFAULT_ROUTE (/market)', () => {
    render(<MemoryRouter initialEntries={['/bogus']}><TestRoutes /></MemoryRouter>)
    expect(screen.getByText('market-surface')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 1b Slice ii — the App-level ProfileDataContext.Provider wraps <Routes>
// unconditionally (not gated on careerStats). Regression this guards: gating the
// provider on careerStats would blank every route for the whole multi-minute
// career load (dynasty-portfolio-1b-ii-detail-popup.md §1.1).
// ---------------------------------------------------------------------------
describe('routes render while careerStats is still loading (null)', () => {
  it('a route renders normally when the wrapping provider has careerStats: null', () => {
    render(
      <MemoryRouter initialEntries={['/board']}>
        <ProfileDataContext.Provider value={{ careerStats: null, playersMap: {}, playerRows: [] }}>
          <TestRoutes />
        </ProfileDataContext.Provider>
      </MemoryRouter>
    )
    expect(screen.getByRole('heading', { name: 'Board' })).toBeInTheDocument()
  })
})
