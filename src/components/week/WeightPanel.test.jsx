// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { WeightPanel } from './WeightPanel'
import { buildWeightPanel } from '../../utils/blendWeights'

expect.extend(jestDomMatchers)
afterEach(cleanup)

describe('WeightPanel — header (defence-numbers-rebuild.md §6.5)', () => {
  const weights = buildWeightPanel(3)

  it('always renders n and the weight formula, and never a STORE THROUGH clause', () => {
    const { container } = render(<WeightPanel weights={weights} n={3} season={2026} />)
    expect(container.textContent).toContain('n = 3 GAMES · w = n / (n + k)')
    expect(container.textContent).not.toContain('STORE THROUGH')
  })
})

describe('WeightPanel — one row and the footer sentence (week-lineup-cleanup.md §6.4)', () => {
  const weights = buildWeightPanel(3)

  it('renders exactly one row, and no display-only family or league-average claim', () => {
    const { container, getByText, getAllByText } = render(<WeightPanel weights={weights} n={3} season={2026} priorSeason={2025} />)
    expect(getAllByText(/^k \d+/)).toHaveLength(1)
    expect(getByText('Points allowed by position')).toBeInTheDocument()
    expect(container.textContent).not.toContain('league average')
    expect(container.textContent).not.toContain('Pace')
    expect(container.textContent).not.toContain('EPA')
  })

  it('the footer names the prior season and the row\'s own k and dropGames', () => {
    const { container } = render(<WeightPanel weights={weights} n={3} season={2026} priorSeason={2025} />)
    const { k, dropGames } = weights[0]
    expect(container.textContent).toContain(`blended with its own 2025 rate, which counts as ${k} games`)
    expect(container.textContent).toContain(`From ${dropGames} games played, 2026 stands alone`)
  })

  it('no fpa row -> no footer', () => {
    const { container } = render(<WeightPanel weights={[]} n={3} season={2026} />)
    expect(container.textContent).not.toContain('stands alone')
  })
})
