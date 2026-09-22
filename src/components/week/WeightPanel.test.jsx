// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { WeightPanel } from './WeightPanel'
import { buildWeightPanel } from '../../utils/blendWeights'

expect.extend(jestDomMatchers)
afterEach(cleanup)

describe('WeightPanel — store-lag header (weekly-decision-2a-lineup-truth.md §5)', () => {
  const weights = buildWeightPanel(3)

  it('shows "STORE THROUGH WK {k}" only when storeLag.behind', () => {
    const { getByText, queryByText } = render(
      <WeightPanel weights={weights} n={3} season={2026} storeLag={{ behind: true, storeThroughWeek: 4, completedWeeks: 5 }} />
    )
    expect(getByText(/STORE THROUGH WK 4/)).toBeInTheDocument()
    expect(queryByText(/w = n \/ \(n \+ k\)/)).toBeInTheDocument()
  })

  it('omits the store-through text when storeLag is null or not behind', () => {
    const { queryByText: q1 } = render(<WeightPanel weights={weights} n={3} season={2026} storeLag={null} />)
    expect(q1(/STORE THROUGH WK/)).toBeNull()

    const { queryByText: q2 } = render(
      <WeightPanel weights={weights} n={3} season={2026} storeLag={{ behind: false, storeThroughWeek: 5, completedWeeks: 5 }} />
    )
    expect(q2(/STORE THROUGH WK/)).toBeNull()
  })
})
