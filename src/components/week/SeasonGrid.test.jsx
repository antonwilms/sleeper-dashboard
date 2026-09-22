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
  it('a played cell is scaled by value: the highest-points cell is stronger than a low one, and a 0 stays filled', () => {
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
    // A 0 cell is still a FILLED cell (a background colour is set), never empty/transparent.
    expect(zeroCell.style.backgroundColor).not.toBe('')
    expect(parseFloat(highCell.style.opacity)).toBeGreaterThan(parseFloat(zeroCell.style.opacity))
  })
})
