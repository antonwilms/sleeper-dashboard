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

  it('taxi is absent (never passed in); an IR player is present in the IR group', () => {
    const reserve = [reservePlayer('p3', 'IR One')]
    const { getByTestId } = render(
      <SeasonGrid starters={[]} bench={[]} reserve={reserve} weeklyMaps={[]} failedWeeks={[]} scheduleIndex={schedule} currentWeek={1} />
    )
    expect(getByTestId('grid-row-p3')).toBeInTheDocument()
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
})
