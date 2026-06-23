// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { PlayersSurface } from './PlayersSurface'

expect.extend(jestDomMatchers)
afterEach(() => { cleanup(); localStorage.clear() })

vi.mock('../PlayersTab', () => ({
  PlayersTab: (props) => <div data-testid="explorer">explorer{props.loaded ? ':loaded' : ''}</div>
}))

vi.mock('./OutlookTab', () => ({ OutlookTab: () => <div data-testid="outlook">outlook</div> }))

describe('PlayersSurface', () => {
  it('1 — default tab on first load', () => {
    render(<PlayersSurface loaded={true} />)
    expect(screen.getByTestId('explorer')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('2 — secondary switch Value→Outlook', () => {
    render(<PlayersSurface loaded={true} />)
    fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
    expect(screen.getByTestId('outlook')).toBeTruthy()
    expect(screen.queryByTestId('explorer')).toBeNull()
    expect(localStorage.getItem('players-dynasty-tab')).toBe('outlook')
  })

  it('3 — secondary switch Value→NFL stats', () => {
    render(<PlayersSurface loaded={true} />)
    fireEvent.click(screen.getByRole('button', { name: 'NFL stats' }))
    expect(screen.getByRole('heading', { name: 'NFL stats' })).toBeTruthy()
    expect(screen.queryByTestId('explorer')).toBeNull()
    expect(localStorage.getItem('players-dynasty-tab')).toBe('nflStats')
  })

  it('4 — primary switch to Weekly (gating)', () => {
    render(<PlayersSurface loaded={true} />)
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }))
    expect(screen.getByRole('heading', { name: 'Weekly start/sit' })).toBeTruthy()
    expect(screen.getAllByText(/weekly rankings/i).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Value' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Outlook' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'NFL stats' })).toBeNull()
    expect(screen.queryByTestId('explorer')).toBeNull()
    expect(localStorage.getItem('players-view')).toBe('weekly')
  })

  it('5 — persistence across reload — primary', () => {
    localStorage.setItem('players-view', 'weekly')
    render(<PlayersSurface loaded={true} />)
    expect(screen.getByRole('heading', { name: 'Weekly start/sit' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Value' })).toBeNull()
  })

  it('6 — persistence across reload — sub-tab', () => {
    localStorage.setItem('players-dynasty-tab', 'outlook')
    render(<PlayersSurface loaded={true} />)
    expect(screen.getByTestId('outlook')).toBeTruthy()
  })

  it('7 — invalid persisted value → default', () => {
    localStorage.setItem('players-view', 'garbage')
    localStorage.setItem('players-dynasty-tab', 'garbage')
    render(<PlayersSurface loaded={true} />)
    expect(screen.getByTestId('explorer')).toBeTruthy()
    expect(screen.queryByRole('heading')).toBeNull()
  })

  it('8 — sub-tab remembered across primary toggle', () => {
    render(<PlayersSurface loaded={true} />)
    fireEvent.click(screen.getByRole('button', { name: 'Outlook' }))
    fireEvent.click(screen.getByRole('button', { name: 'Weekly' }))
    fireEvent.click(screen.getByRole('button', { name: 'Dynasty' }))
    expect(screen.getByTestId('outlook')).toBeTruthy()
  })

  it('9 — Value-tab parity / prop forwarding', () => {
    render(<PlayersSurface loaded={true} foo="bar" />)
    expect(screen.getByTestId('explorer').textContent).toBe('explorer:loaded')
  })
})
