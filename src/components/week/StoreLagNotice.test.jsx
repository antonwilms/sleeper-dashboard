// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { StoreLagNotice } from './StoreLagNotice'

expect.extend(jestDomMatchers)
afterEach(cleanup)

describe('StoreLagNotice', () => {
  it('renders nothing when storeLag is null or not behind', () => {
    const { container: c1 } = render(<StoreLagNotice storeLag={null} season={2026} />)
    expect(c1.firstChild).toBeNull()

    const { container: c2 } = render(<StoreLagNotice storeLag={{ behind: false, storeThroughWeek: 5, completedWeeks: 5 }} season={2026} />)
    expect(c2.firstChild).toBeNull()
  })

  it('behind, storeThroughWeek > 0: the notice names both week numbers', () => {
    const { getByText } = render(
      <StoreLagNotice storeLag={{ behind: true, storeThroughWeek: 4, completedWeeks: 5 }} season={2026} />
    )
    const el = getByText(/hasn.t reached the data store yet/)
    expect(el.textContent).toContain('4')
    expect(el.textContent).toContain('5')
  })

  it('behind, storeThroughWeek === 0: the second copy variant, naming the season', () => {
    const { getByText } = render(
      <StoreLagNotice storeLag={{ behind: true, storeThroughWeek: 0, completedWeeks: 2 }} season={2026} />
    )
    const el = getByText(/don.t include any 2026 games/)
    expect(el.textContent).toContain('2')
  })
})
