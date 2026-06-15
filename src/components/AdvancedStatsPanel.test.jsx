// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup } from '@testing-library/react'
import { AdvancedStatsPanel } from './AdvancedStatsPanel'

// Extend vitest's expect with jest-dom matchers (toBeInTheDocument, etc.)
expect.extend(jestDomMatchers)

// Unmount and remove DOM between tests (auto-cleanup needs globals:true; we call explicitly)
afterEach(cleanup)

// Shared fixtures
const WR_ADVSTATS = { targetShare: 0.25, airYardsShare: 0.30, wopr: 0.62, racr: 1.10 }
const RB_ADVSTATS = { targetShare: 0.08, airYardsShare: null, wopr: null, racr: null }

// ---------------------------------------------------------------------------
// 1. WR full render
// ---------------------------------------------------------------------------
describe('WR full render', () => {
  it('renders all six rows with formatted values and both group headers', () => {
    render(
      <AdvancedStatsPanel
        position="WR"
        advStats={WR_ADVSTATS}
        advStatsSeason={2025}
        snapShare={0.82}
        usageShare={{ value: 0.24, season: 2025 }}
      />
    )

    // Formatted values
    expect(screen.getByText('25.0%')).toBeInTheDocument()   // targetShare
    expect(screen.getByText('30.0%')).toBeInTheDocument()   // airYardsShare
    expect(screen.getByText('0.62')).toBeInTheDocument()    // wopr
    expect(screen.getByText('1.10')).toBeInTheDocument()    // racr
    expect(screen.getByText('82.0%')).toBeInTheDocument()   // snapShare
    expect(screen.getByText('24.0%')).toBeInTheDocument()   // usageShare

    // Group headers
    expect(screen.getByText('Advanced (nflverse)')).toBeInTheDocument()
    expect(screen.getByText('Usage (in-app)')).toBeInTheDocument()

    // Season labels (each group gets its own)
    expect(screen.getAllByText('2025 season')).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// 2. RB graceful nulls
// ---------------------------------------------------------------------------
describe('RB graceful nulls', () => {
  it('shows target share + snap + Carry share; omits air-yards/WOPR/RACR; no NaN/null/undefined text', () => {
    const { container } = render(
      <AdvancedStatsPanel
        position="RB"
        advStats={RB_ADVSTATS}
        snapShare={0.55}
        usageShare={{ value: 0.18, season: 2025 }}
      />
    )

    // Rows that should be present
    expect(screen.getByText('8.0%')).toBeInTheDocument()    // targetShare
    expect(screen.getByText('55.0%')).toBeInTheDocument()   // snapShare
    expect(screen.getByText('18.0%')).toBeInTheDocument()   // carry share
    expect(screen.getByText('Carry share')).toBeInTheDocument()

    // Rows that should be absent (queryByText returns null when not found;
    // jest-dom's toBeInTheDocument throws on null, so use toBeNull instead)
    expect(screen.queryByText('Air-yards share')).toBeNull()
    expect(screen.queryByText('WOPR')).toBeNull()
    expect(screen.queryByText('RACR')).toBeNull()

    // No NaN/null/undefined rendered
    expect(container.textContent).not.toMatch(/NaN|null|undefined/i)
  })
})

// ---------------------------------------------------------------------------
// 3. QB → panel returns null
// ---------------------------------------------------------------------------
describe('QB position', () => {
  it('renders nothing (panel returns null)', () => {
    const { container } = render(
      <AdvancedStatsPanel
        position="QB"
        advStats={WR_ADVSTATS}
        advStatsSeason={2025}
        snapShare={0.90}
        usageShare={{ value: 0.50, season: 2025 }}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 4. Total absence (all nulls, WR position)
// ---------------------------------------------------------------------------
describe('total absence', () => {
  it('renders nothing when all data is null', () => {
    const { container } = render(
      <AdvancedStatsPanel
        position="WR"
        advStats={null}
        snapShare={null}
        usageShare={null}
      />
    )
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 5. Partial advstats — WR with racr: null
// ---------------------------------------------------------------------------
describe('partial advstats', () => {
  it('omits RACR row when racr is null, renders the other three advanced rows', () => {
    render(
      <AdvancedStatsPanel
        position="WR"
        advStats={{ targetShare: 0.25, airYardsShare: 0.30, wopr: 0.62, racr: null }}
        advStatsSeason={2025}
        snapShare={0.82}
        usageShare={{ value: 0.24, season: 2025 }}
      />
    )

    // "Target share" appears twice for WR: once in the advanced group (advStats.targetShare)
    // and once in the usage group (usageShare label for non-RB) — use getAllByText
    expect(screen.getAllByText('Target share')).toHaveLength(2)
    expect(screen.getByText('Air-yards share')).toBeInTheDocument()
    expect(screen.getByText('WOPR')).toBeInTheDocument()
    expect(screen.queryByText('RACR')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// 6. Extensibility smoke — row count matches applicable+present descriptors
// ---------------------------------------------------------------------------
describe('extensibility smoke', () => {
  it('WR full case renders exactly 6 data rows (matches ADV_STAT_ROWS applicable+present count)', () => {
    const { container } = render(
      <AdvancedStatsPanel
        position="WR"
        advStats={WR_ADVSTATS}
        advStatsSeason={2025}
        snapShare={0.82}
        usageShare={{ value: 0.24, season: 2025 }}
      />
    )
    // Count <tr> elements — one per rendered stat row
    const rows = container.querySelectorAll('tr')
    expect(rows).toHaveLength(6)
  })
})
