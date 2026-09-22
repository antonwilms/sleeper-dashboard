// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { SeasonGrid } from './SeasonGrid'
import { buildRegWeekIndex } from '../../utils/weeklySchedule'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function game(week, homeTeam, awayTeam) {
  return { week, gameType: 'REG', homeTeam, awayTeam, homeScore: null, awayScore: null }
}

function starterRow(id, name, team = 'KC') {
  return { slot: 'QB', player_id: id, name, team, opponent: null, opponentEra: null, bye: false, allows: null, allowsRank: null, weight: null, usage: null, form: [null, null, null], points: null }
}

function reservePlayer(id, name, team = 'KC') {
  return { id, full_name: name, position: 'RB', team, age: null }
}

// A played cell's background is `color-mix(in srgb, var(--color-dp-up) X%, transparent)`
// (SeasonGrid.jsx, fix pass 2 item 2.1). Extract X, or null if the string doesn't match that
// shape at all (e.g. a literal 'transparent', or the pre-2.1 flat `var(--color-dp-up)`).
function bgPercent(el) {
  const m = /\(in srgb, var\(--color-dp-up\) ([\d.]+)%, transparent\)/.exec(el.style.backgroundColor)
  return m ? parseFloat(m[1]) : null
}

describe('SeasonGrid', () => {
  const schedule = buildRegWeekIndex({ games: [game(1, 'KC', 'DEN'), game(2, 'KC', 'DEN')] })

  it('renders three groups, in order, with dividers', () => {
    const starters = [starterRow('p1', 'Starter One')]
    const bench = [{ ...starterRow('p2', 'Bench One'), slot: 'BN' }]
    const reserve = [reservePlayer('p3', 'IR One')]
    const { getByText, container } = render(
      <SeasonGrid starters={starters} bench={bench} reserve={reserve} weeklyMaps={[]} failedWeeks={[]} scheduleIndex={schedule} currentWeek={1} />
    )
    expect(getByText('STARTERS')).toBeInTheDocument()
    expect(getByText('BENCH')).toBeInTheDocument()
    expect(getByText('IR')).toBeInTheDocument()

    const labels = [...container.querySelectorAll('td')].map(td => td.textContent).filter(t => ['STARTERS', 'BENCH', 'IR'].includes(t))
    expect(labels).toEqual(['STARTERS', 'BENCH', 'IR'])
  })

  it('an empty group omits its divider', () => {
    const starters = [starterRow('p1', 'Starter One')]
    const { queryByText } = render(
      <SeasonGrid starters={starters} bench={[]} reserve={[]} weeklyMaps={[]} failedWeeks={[]} scheduleIndex={schedule} currentWeek={1} />
    )
    expect(queryByText('BENCH')).toBeNull()
    expect(queryByText('IR')).toBeNull()
  })

  it('unknown renders with no glyph (neither — nor dashed)', () => {
    const starters = [starterRow('p1', 'Starter One', 'KC')]
    const { getByTestId } = render(
      <SeasonGrid starters={starters} bench={[]} reserve={[]} weeklyMaps={[]} failedWeeks={[]} scheduleIndex={null} currentWeek={2} />
    )
    const cell = getByTestId('grid-cell-p1-1')
    expect(cell.getAttribute('data-kind')).toBe('unknown')
    expect(cell.textContent.trim()).toBe('')
  })

  // Fix pass 1, item 1.6 (§3 fidelity) — a played cell's fill is scaled by value.
  // Fix pass 2, items 2.1/2.3 — the intensity lands on the background only (a color-mix alpha
  // on the `--color-dp-up` token), never on `opacity`, so the number inside a 0-point cell stays
  // full-strength. The 0 cell's own fill must be visibly present, not transparent/zero-alpha.
  it('a played cell is scaled by value: the highest-points cell is stronger than a low one, and a 0 stays visibly filled with full-strength text', () => {
    const starters = [starterRow('p1', 'Starter One', 'KC')]
    const weeklyMaps = [
      { week: 1, rows: { p1: { stats: { gp: 1, pass_yd: 400 }, team: 'KC' } } }, // high points
      { week: 2, rows: { p1: { stats: { gp: 1, pass_yd: 0 }, team: 'KC' } } }, // 0 points
    ]
    const { getByTestId } = render(
      <SeasonGrid
        starters={starters} bench={[]} reserve={[]} weeklyMaps={weeklyMaps} failedWeeks={[]}
        scheduleIndex={schedule} scoringSettings={{ pass_yd: 0.04 }} currentWeek={3}
      />
    )
    const highCell = getByTestId('grid-cell-p1-1').firstElementChild
    const zeroCell = getByTestId('grid-cell-p1-2').firstElementChild
    expect(getByTestId('grid-cell-p1-1').getAttribute('data-kind')).toBe('played')
    expect(getByTestId('grid-cell-p1-2').getAttribute('data-kind')).toBe('played')

    const highPct = bgPercent(highCell)
    const zeroPct = bgPercent(zeroCell)

    // The 0 cell's own fill is visibly present: a real background is set, and it is neither
    // `transparent` nor a zero-alpha mix. (mutation a: MIN_INTENSITY = 0 → zeroPct is 0 → red)
    // (mutation b: a fully-transparent background for the lowest intensity → red)
    expect(zeroCell.style.backgroundColor).not.toBe('')
    expect(zeroCell.style.backgroundColor).not.toBe('transparent')
    expect(zeroPct).not.toBeNull()
    expect(zeroPct).toBeGreaterThan(0)

    // Ordering is preserved: high > low.
    expect(highPct).toBeGreaterThan(zeroPct)

    // The number never inherits the fill's intensity — the cell must carry no `opacity` at all.
    // (mutation c: apply the intensity to the whole cell, i.e. revert 2.1 → red, opacity is set)
    expect(zeroCell.style.opacity).toBe('')
    expect(highCell.style.opacity).toBe('')
  })

  // Fix pass 2, item 2.2 — an all-zero grid must not invert the scale: every played cell with
  // maxPlayedPoints <= 0 gets the MINIMUM intensity, never the maximum.
  it('an all-zero grid renders every played cell at the minimum intensity, not the maximum', () => {
    const starters = [starterRow('p1', 'Starter One', 'KC')]
    const weeklyMaps = [
      { week: 1, rows: { p1: { stats: { gp: 1, pass_yd: 0 }, team: 'KC' } } },
      { week: 2, rows: { p1: { stats: { gp: 1, pass_yd: 0 }, team: 'KC' } } },
    ]
    const { getByTestId } = render(
      <SeasonGrid
        starters={starters} bench={[]} reserve={[]} weeklyMaps={weeklyMaps} failedWeeks={[]}
        scheduleIndex={schedule} scoringSettings={{ pass_yd: 0.04 }} currentWeek={3}
      />
    )
    const cell1 = getByTestId('grid-cell-p1-1').firstElementChild
    const cell2 = getByTestId('grid-cell-p1-2').firstElementChild
    // MIN_INTENSITY is 0.18 (SeasonGrid.jsx) — both cells land at exactly the minimum, not 100%.
    expect(bgPercent(cell1)).toBeCloseTo(18, 1)
    expect(bgPercent(cell2)).toBeCloseTo(18, 1)
  })
})
