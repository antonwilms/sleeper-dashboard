// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { CoveragePips } from './CoveragePips'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function pipSpans(container) {
  return [...container.querySelectorAll('span')]
}

describe('CoveragePips', () => {
  it('band="high" fills all three pips', () => {
    const { container } = render(<CoveragePips band="high" />)
    const spans = pipSpans(container)
    expect(spans).toHaveLength(3)
    expect(spans.every(s => s.className.includes('bg-dp-text-5'))).toBe(true)
  })

  it('band="low" fills exactly one pip', () => {
    const { container } = render(<CoveragePips band="low" />)
    const spans = pipSpans(container)
    expect(spans.filter(s => s.className.includes('bg-dp-text-5'))).toHaveLength(1)
    expect(spans.filter(s => s.className.includes('bg-dp-pip-off'))).toHaveLength(2)
  })

  it('band="none" fills nothing', () => {
    const { container } = render(<CoveragePips band="none" />)
    const spans = pipSpans(container)
    expect(spans.every(s => s.className.includes('bg-dp-pip-off'))).toBe(true)
  })

  it('count is converted via coverageBand when band is absent', () => {
    const { container } = render(<CoveragePips count={5} />)
    // 5 -> medium -> 2 filled
    expect(pipSpans(container).filter(s => s.className.includes('bg-dp-text-5'))).toHaveLength(2)
  })

  it('band wins when both band and count are given', () => {
    const { container } = render(<CoveragePips band="high" count={0} />)
    expect(pipSpans(container).filter(s => s.className.includes('bg-dp-text-5'))).toHaveLength(3)
  })

  it('renders the "none" state when neither band nor count is given', () => {
    const { container } = render(<CoveragePips />)
    expect(pipSpans(container).every(s => s.className.includes('bg-dp-pip-off'))).toBe(true)
  })

  it('is aria-hidden and has no aria-label', () => {
    const { container } = render(<CoveragePips band="high" />)
    const root = container.firstChild
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(root).not.toHaveAttribute('aria-label')
  })

  it('never renders any colour other than the two pip tokens', () => {
    const { container } = render(<CoveragePips band="medium" />)
    for (const span of pipSpans(container)) {
      expect(span.className === 'bg-dp-text-5' || span.className === 'bg-dp-pip-off').toBe(true)
    }
  })
})
