// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { DegradedBlock } from './DegradedBlock'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const KINDS_AND_LABELS = [
  ['not-yet-accruing', 'NOT YET — ACCRUING'],
  ['not-measured-then', 'NOT MEASURED THEN'],
  ['undefined-here', 'UNDEFINED HERE'],
  ['never-available', 'NEVER AVAILABLE'],
  ['no-baseline', 'NO BASELINE'],
]

describe('DegradedBlock', () => {
  it.each(KINDS_AND_LABELS)('kind=%s renders its label and body', (kind, label) => {
    const { getByText } = render(<DegradedBlock kind={kind}>One sentence of body copy.</DegradedBlock>)
    expect(getByText(label)).toBeInTheDocument()
    expect(getByText('One sentence of body copy.')).toBeInTheDocument()
  })

  it.each(KINDS_AND_LABELS.filter(([k]) => k !== 'never-available'))(
    'kind=%s gets the neutral border/label colour', (kind) => {
      const { container } = render(<DegradedBlock kind={kind}>Body.</DegradedBlock>)
      expect(container.firstChild.className).toContain('border-dp-border-raised')
    }
  )

  it('never-available gets the amber pair: border-dp-down-border / text-dp-down-text', () => {
    const { container, getByText } = render(<DegradedBlock kind="never-available">Body.</DegradedBlock>)
    expect(container.firstChild.className).toContain('border-dp-down-border')
    expect(getByText('NEVER AVAILABLE').className).toContain('text-dp-down-text')
  })

  it('an unknown kind degrades to the neutral border with the slug uppercased, not a crash', () => {
    let result
    expect(() => { result = render(<DegradedBlock kind="something-new">Body.</DegradedBlock>) }).not.toThrow()
    expect(result.container.firstChild.className).toContain('border-dp-border-raised')
    expect(result.getByText('SOMETHING-NEW')).toBeInTheDocument()
  })

  it('renders a dashed border', () => {
    const { container } = render(<DegradedBlock kind="no-baseline">Body.</DegradedBlock>)
    expect(container.firstChild).toHaveStyle({ borderStyle: 'dashed' })
  })

  it('contains no call-to-action language (check back / retry / link)', () => {
    // This asserts the component itself injects nothing beyond kind label + children —
    // it never appends copy of its own that could carry a CTA.
    const { container } = render(<DegradedBlock kind="never-available">Real body copy only.</DegradedBlock>)
    expect(container.querySelectorAll('a, button')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/check back|retry|try again/i)
  })
})
