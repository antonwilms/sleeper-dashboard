// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { RankingsRow } from './RankingsRow'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const BASE_PROPS = {
  position: 'WR',
  recentRank: 3,
  peakRank: 1,
  consistencyRank: 5,
  dynastyRank: 4,
  roleRank: 6,
  nextSeasonRank: 2,
  movementLabel: null,
  projectionConfidence: null,
}

describe('RankingsRow — all ranks present', () => {
  it('renders all six chips with position prefix and distinct values', () => {
    render(<RankingsRow {...BASE_PROPS} />)
    expect(screen.getByText('WR3')).toBeInTheDocument()  // Recent
    expect(screen.getByText('WR1')).toBeInTheDocument()  // Peak
    expect(screen.getByText('WR5')).toBeInTheDocument()  // Consist
    expect(screen.getByText('WR4')).toBeInTheDocument()  // Outlook
    expect(screen.getByText('WR6')).toBeInTheDocument()  // Role
    expect(screen.getByText('WR2')).toBeInTheDocument()  // Next Szn
  })
})

describe('RankingsRow — movementLabel', () => {
  it('movementLabel up → Recent chip contains ↑', () => {
    render(<RankingsRow {...BASE_PROPS} movementLabel="up" />)
    expect(screen.getByText('WR3↑')).toBeInTheDocument()
  })

  it('movementLabel down → Recent chip contains ↓', () => {
    render(<RankingsRow {...BASE_PROPS} movementLabel="down" />)
    expect(screen.getByText('WR3↓')).toBeInTheDocument()
  })

  it('movementLabel stable → no ↑ or ↓ on Recent chip', () => {
    render(<RankingsRow {...BASE_PROPS} movementLabel="stable" />)
    expect(screen.getByText('WR3')).toBeInTheDocument()
    expect(screen.queryByText('WR3↑')).toBeNull()
    expect(screen.queryByText('WR3↓')).toBeNull()
  })

  it('movementLabel null → no ↑ or ↓ on Recent chip', () => {
    render(<RankingsRow {...BASE_PROPS} movementLabel={null} />)
    expect(screen.getByText('WR3')).toBeInTheDocument()
    expect(screen.queryByText('WR3↑')).toBeNull()
    expect(screen.queryByText('WR3↓')).toBeNull()
  })
})

describe('RankingsRow — null ranks render —', () => {
  it('null consistencyRank, roleRank, nextSeasonRank → em-dash for each', () => {
    const { container } = render(
      <RankingsRow {...BASE_PROPS} consistencyRank={null} roleRank={null} nextSeasonRank={null} />
    )
    // Three chips should render '—'; getByText would fail if not exactly one, so count
    const dashes = Array.from(container.querySelectorAll('span')).filter(el => el.textContent === '—')
    expect(dashes.length).toBeGreaterThanOrEqual(3)
  })
})

describe('RankingsRow — narrative', () => {
  it('gap ≥5 (sell window) → sell narrative present', () => {
    render(<RankingsRow {...BASE_PROPS} recentRank={10} dynastyRank={20} />)
    expect(screen.getByText(/sell window/i)).toBeInTheDocument()
  })

  it('gap ≤−5 (buy low) → buy narrative present', () => {
    render(<RankingsRow {...BASE_PROPS} recentRank={20} dynastyRank={10} />)
    expect(screen.getByText(/buy-low/i)).toBeInTheDocument()
  })

  it('gap within ±5 → no narrative paragraph', () => {
    render(<RankingsRow {...BASE_PROPS} recentRank={10} dynastyRank={12} />)
    expect(screen.queryByText(/sell window/i)).toBeNull()
    expect(screen.queryByText(/buy-low/i)).toBeNull()
  })
})

describe('RankingsRow — legend', () => {
  it('renders exactly one ⓘ help span', () => {
    const { container } = render(<RankingsRow {...BASE_PROPS} />)
    const helpSpans = container.querySelectorAll('.cursor-help')
    expect(helpSpans.length).toBe(1)
    expect(helpSpans[0].textContent).toBe('ⓘ')
  })
})
