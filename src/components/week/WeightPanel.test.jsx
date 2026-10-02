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
