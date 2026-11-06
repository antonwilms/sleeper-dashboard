// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { NavIcon } from './NavRail'
import { PRIMARY_NAV, LEAGUE_NAV, ROOKIES_NAV } from './navItems'

afterEach(cleanup)

describe('NavIcon', () => {
  it.each([...PRIMARY_NAV, ...LEAGUE_NAV, ROOKIES_NAV].map(i => i.key))('nav key "%s" has a decorative icon', key => {
    const { container } = render(<NavIcon name={key} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('an unknown key renders nothing rather than a wrong icon', () => {
    const { container } = render(<NavIcon name="not-a-nav-key" />)
    expect(container.firstChild).toBeNull()
  })
})
