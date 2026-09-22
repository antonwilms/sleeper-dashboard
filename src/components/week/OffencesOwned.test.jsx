// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { OffencesOwned } from './OffencesOwned'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function row(overrides = {}) {
  return { slot: 'WR', player_id: 'p1', name: 'P1', team: 'LAR', ...overrides }
}

function regGame(week, off, def) {
  return { week, seasonType: 'REG', off, def }
}

const OFF_BASE = {
  plays: 60, passPlays: 35, proeXpassSum: 30, proePlays: 60, neutralSeconds: 1800, neutralGaps: 60,
  successes: 25, successPlays: 60, rzTdTrips: 2, rzTrips: 3, epaSum: 6, epaPlays: 60,
  passEpaSum: 4, passEpaPlays: 35, rushEpaSum: 2, rushEpaPlays: 25, pointsScored: 24,
}
const DEF_BASE = { epaSum: -3, epaPlays: 60, pointsAllowed: 17 }

function loadedTeamContext(teams) {
  return { teams, year: 2025, complete: true, rowCount: 100 }
}

describe('OffencesOwned', () => {
  it("a LAR-rostered player's team reads the LA teamcontext row", () => {
    const starters = [row({ team: 'LAR' })]
    const liveTeamContext = loadedTeamContext({
      LA: { games: [regGame(1, OFF_BASE, DEF_BASE)] },
    })
    const { getByTestId } = render(
      <OffencesOwned starters={starters} bench={[]} liveTeamContext={liveTeamContext} currentWeek={2} />
    )
    expect(getByTestId('offences-owned-LAR')).toBeInTheDocument()
    expect(getByTestId('offences-owned-LAR').textContent).toContain('LA')
  })

  it('taxi, IR and FA teams are not listed (they are simply not present in starters/bench)', () => {
    const starters = [row({ team: 'FA' }), row({ player_id: 'p2', team: null })]
    const liveTeamContext = loadedTeamContext({})
    const { queryAllByTestId } = render(
      <OffencesOwned starters={starters} bench={[]} liveTeamContext={liveTeamContext} currentWeek={2} />
    )
    expect(queryAllByTestId(/^offences-owned-/).length).toBe(0)
  })

  it('complete: false renders the empty state and throws nothing', () => {
    const starters = [row()]
    const emptyLoad = { teams: {}, year: null, complete: false, rowCount: 0 }
    let getByTestId
    expect(() => {
      ;({ getByTestId } = render(<OffencesOwned starters={starters} bench={[]} liveTeamContext={emptyLoad} currentWeek={2} />))
    }).not.toThrow()
    expect(getByTestId('offences-owned').textContent).toContain('Team-context figures')
    expect(getByTestId('offences-owned').querySelector('table')).toBeNull()
  })

  it('complete: true against a real-shaped fixture renders real values', () => {
    const starters = [row({ team: 'KC' })]
    const liveTeamContext = loadedTeamContext({ KC: { games: [regGame(1, OFF_BASE, DEF_BASE)] } })
    const { getByTestId } = render(
      <OffencesOwned starters={starters} bench={[]} liveTeamContext={liveTeamContext} currentWeek={2} />
    )
    const cell = getByTestId('offences-owned-KC')
    // proe = passPlays/plays - proeXpassSum/proePlays = 35/60 - 30/60 = +8.3%
    expect(cell.textContent).toContain('8.3%')
  })

  it('an aggregation test that fails if a stored rate is summed instead of component-aggregated', () => {
    // Two weeks with identical rate-shaped inputs but different volume — summing PROE's raw
    // per-week rate would double it; component-aggregation keeps it the same as a single week.
    const starters = [row({ team: 'KC' })]
    const liveTeamContext = loadedTeamContext({
      KC: { games: [regGame(1, OFF_BASE, DEF_BASE), regGame(2, OFF_BASE, DEF_BASE)] },
    })
    const summedWrong = 2 * (35 / 60 - 30 / 60)
    const { getByTestId } = render(
      <OffencesOwned starters={starters} bench={[]} liveTeamContext={liveTeamContext} currentWeek={3} />
    )
    const cell = getByTestId('offences-owned-KC')
    expect(cell.textContent).toContain('8.3%') // component-aggregated: unchanged across two identical weeks
    expect(cell.textContent).not.toContain(`${(summedWrong * 100).toFixed(1)}%`)
  })

  it('WK {n} MARGIN reads a single week, per team, from the latest REG week <= currentWeek - 1', () => {
    const starters = [row({ team: 'KC' })]
    const liveTeamContext = loadedTeamContext({
      KC: {
        games: [
          regGame(1, OFF_BASE, DEF_BASE),
          regGame(2, { ...OFF_BASE, pointsScored: 30 }, { ...DEF_BASE, pointsAllowed: 10 }),
        ],
      },
    })
    const { getByTestId } = render(
      <OffencesOwned starters={starters} bench={[]} liveTeamContext={liveTeamContext} currentWeek={3} />
    )
    expect(getByTestId('offences-owned-KC').textContent).toContain('WK 2')
    expect(getByTestId('offences-owned-KC').textContent).toContain('+20.0')
  })
})
