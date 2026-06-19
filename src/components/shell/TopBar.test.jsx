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
  tooltipsEnabled: true,
  onToggleTooltips: () => {},
  showLeagueLink: false,
}

describe('TopBar theme toggle', () => {
  it('shows "Light" label when theme is dark', () => {
    render(
      <MemoryRouter>
        <TopBar {...baseProps} theme="dark" onToggleTheme={() => {}} />
      </MemoryRouter>
    )
    expect(screen.getByText('Light')).toBeInTheDocument()
  })

  it('shows "Dark" label when theme is light', () => {
    render(
      <MemoryRouter>
        <TopBar {...baseProps} theme="light" onToggleTheme={() => {}} />
      </MemoryRouter>
    )
    expect(screen.getByText('Dark')).toBeInTheDocument()
  })

  it('calls onToggleTheme once when toggle button is clicked', () => {
    const onToggleTheme = vi.fn()
    render(
      <MemoryRouter>
        <TopBar {...baseProps} theme="dark" onToggleTheme={onToggleTheme} />
      </MemoryRouter>
    )
    fireEvent.click(screen.getByTitle('Toggle light/dark theme'))
    expect(onToggleTheme).toHaveBeenCalledTimes(1)
  })

  it('renders toggle even without a user (onboarding state)', () => {
    render(
      <MemoryRouter>
        <TopBar {...baseProps} user={null} theme="dark" onToggleTheme={() => {}} />
      </MemoryRouter>
    )
    expect(screen.getByTitle('Toggle light/dark theme')).toBeInTheDocument()
  })
})
