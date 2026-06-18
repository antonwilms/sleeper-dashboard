// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { ValueChip, normalizeConfidence } from './ValueChip'

expect.extend(jestDomMatchers)

afterEach(cleanup)

// Real-shaped fixture rows (values consistent with computeMarketDivergence semantics)
const UNDERVALUED_WR = {
  value: 78,
  marketDelta: { signal: 'undervalued', pct: 42.9, dynRank: 3, ktcRank: 9 },
  confidence: 'high',
  ktcValue: 6200,
  position: 'WR',
}
const OVERVALUED_RB = {
  value: 61,
  // pct: -37.6 (not -37.5) — Math.round(-37.5) = -37 in JS (ties round toward +Infinity);
  // -37.6 rounds to -38 so the −38% assertion in case 2 holds.
  marketDelta: { signal: 'overvalued', pct: -37.6, dynRank: 12, ktcRank: 4 },
  confidence: 'moderate',
  ktcValue: 5100,
  position: 'RB',
}
const ALIGNED_WR = {
  value: 70,
  marketDelta: { signal: null, pct: 8.0, dynRank: 5, ktcRank: 6 },
  confidence: 'low',
  ktcValue: 4000,
  position: 'WR',
}
const NO_KTC_TE = {
  value: 55,
  marketDelta: { signal: null, pct: null, dynRank: null, ktcRank: null },
  confidence: 'prospect',
  ktcValue: null,
  position: 'TE',
}

// ---------------------------------------------------------------------------
// 1. Undervalued — up glyph + signed delta + never-color-alone + confidence
// ---------------------------------------------------------------------------
describe('Undervalued (UNDERVALUED_WR)', () => {
  it('renders up glyph, +43% delta, market-up pill with glyph+sign+aria-label, and High confidence', () => {
    const { container } = render(<ValueChip {...UNDERVALUED_WR} />)

    // Up glyph present somewhere in the output
    expect(container.textContent).toMatch(/▲|↑/)

    // Signed delta (+43% — Math.round(42.9) = 43)
    expect(container.textContent).toContain('+43%')

    // Never-color-alone: the market-up element must contain both glyph and + sign
    const upEl = container.querySelector('.text-market-up')
    expect(upEl).not.toBeNull()
    expect(upEl.textContent).toMatch(/▲|↑/)
    expect(upEl.textContent).toContain('+')
    // aria-label or title provides rank context
    const label = upEl.getAttribute('aria-label') || upEl.getAttribute('title')
    expect(label).toBeTruthy()

    // Confidence: dot + label 'High' for 'high'
    expect(screen.getByText('High')).toBeInTheDocument()
    expect(container.querySelector('.text-confidence-high')).not.toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 2. Overvalued — down glyph + −38% + never-color-alone + confidence 'Med'
// ---------------------------------------------------------------------------
describe('Overvalued (OVERVALUED_RB)', () => {
  it('renders down glyph, −38% delta, market-down pill with glyph+sign, and Med confidence (moderate→medium)', () => {
    const { container } = render(<ValueChip {...OVERVALUED_RB} />)

    // Down glyph
    expect(container.textContent).toMatch(/▼|↓/)

    // Signed −38% (Math.round(-37.6) = -38)
    expect(container.textContent).toMatch(/-38%|−38%/)

    // Never-color-alone: market-down element contains glyph and negative sign
    const downEl = container.querySelector('.text-market-down')
    expect(downEl).not.toBeNull()
    expect(downEl.textContent).toMatch(/▼|↓/)
    expect(downEl.textContent).toMatch(/-38%|−38%/)

    // 'moderate' normalizes to 'medium' → renders 'Med'
    expect(screen.getByText('Med')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 3. Aligned — no market color, neutral indicator, value + confidence
// ---------------------------------------------------------------------------
describe('Aligned (ALIGNED_WR)', () => {
  it('renders no up/down color, shows aligned indicator, value 70, and Low confidence', () => {
    const { container } = render(<ValueChip {...ALIGNED_WR} />)

    // No market-up or market-down color classes
    expect(container.querySelector('.text-market-up')).toBeNull()
    expect(container.querySelector('.text-market-down')).toBeNull()

    // Neutral "aligned" indicator present
    expect(screen.getByText(/aligned/i)).toBeInTheDocument()

    // Value 70
    expect(screen.getByText('70')).toBeInTheDocument()

    // Confidence 'low' → 'Low'
    expect(screen.getByText('Low')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// 4. No-KTC — no delta element, value 55, Rookie confidence, no KTC text
// ---------------------------------------------------------------------------
describe('No-KTC (NO_KTC_TE)', () => {
  it('renders no delta (no glyph/%), value 55, Rookie confidence (prospect→rookie), no KTC', () => {
    render(<ValueChip {...NO_KTC_TE} />)

    // No delta element — no glyph or percent sign rendered
    expect(screen.queryByText(/▲|▼|↑|↓|%/)).toBeNull()

    // Value 55
    expect(screen.getByText('55')).toBeInTheDocument()

    // 'prospect' normalizes to 'rookie' → renders 'Rookie'
    expect(screen.getByText('Rookie')).toBeInTheDocument()

    // No KTC text (ktcValue is null)
    expect(screen.queryByText(/KTC/)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. normalizeConfidence — direct unit cases
// ---------------------------------------------------------------------------
describe('normalizeConfidence', () => {
  it('maps both vocabularies correctly', () => {
    expect(normalizeConfidence('high')).toBe('high')
    expect(normalizeConfidence('medium')).toBe('medium')
    expect(normalizeConfidence('moderate')).toBe('medium')
    expect(normalizeConfidence('low')).toBe('low')
    expect(normalizeConfidence('rookie')).toBe('rookie')
    expect(normalizeConfidence('prospect')).toBe('rookie')
    expect(normalizeConfidence('none')).toBeNull()
    expect(normalizeConfidence(null)).toBeNull()
    expect(normalizeConfidence(undefined)).toBeNull()
    expect(normalizeConfidence('garbage')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. Null/hygiene — em-dash for null value, no NaN/null/undefined in output
// ---------------------------------------------------------------------------
describe('Null/hygiene', () => {
  it('renders em-dash for null value and no NaN/null/undefined text', () => {
    const { container } = render(
      <ValueChip value={null} marketDelta={null} confidence={null} ktcValue={null} position="WR" />
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/NaN|null|undefined/i)
  })
})

// ---------------------------------------------------------------------------
// 7. Size smoke — both sizes render value without error
// ---------------------------------------------------------------------------
describe('Size smoke', () => {
  it('size=sm renders value 78 without error', () => {
    render(<ValueChip {...UNDERVALUED_WR} size="sm" />)
    expect(screen.getByText('78')).toBeInTheDocument()
  })

  it('size=md renders value 78 without error', () => {
    render(<ValueChip {...UNDERVALUED_WR} size="md" />)
    expect(screen.getByText('78')).toBeInTheDocument()
  })
})
