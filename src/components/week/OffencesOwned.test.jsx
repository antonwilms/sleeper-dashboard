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
    const cell = getByTestId('offences-owned-LAR')
    expect(cell).toBeInTheDocument()
    // A value only the LA fixture row can produce — 'LAR' textContent would still contain the
    // substring 'LA' even with the CR-16 hop dropped, so assert the computed PROE instead.
    // proe = passPlays/plays - proeXpassSum/proePlays = 35/60 - 30/60 = +8.3%
    expect(cell.textContent).toContain('8.3%')
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

  it('an aggregation test that fails if a stored rate is averaged or summed instead of component-aggregated', () => {
    // Fix pass 1, item 1.2 — two weeks with DIFFERENT volumes, each carrying a stored per-week
    // `off.proe` equal to that week's own single-game value. With identical weeks (the prior
    // fixture), the mean of two equal values coincides with the component-aggregated answer, so
    // an averaging bug wasn't caught. Here the three candidate answers are all distinct:
    //   week 1: plays 70, passPlays 40, proePlays 60, proeXpassSum 33 -> own proe = 40/70 - 33/60 = 0.021428571 (2.1%)
    //   week 2: plays 50, passPlays 20, proePlays 40, proeXpassSum 15 -> own proe = 20/50 - 15/40 = 0.025 (2.5%)
    //   mean of the two stored per-week values   = 0.023214286 (2.3%)
    //   sum of the two stored per-week values     = 0.046428571 (4.6%)
    //   component-aggregated (correct): passPlays 60 / plays 120 - proeXpassSum 48 / proePlays 100 = 0.02 (2.0%)
    const week1Off = { ...OFF_BASE, plays: 70, passPlays: 40, proeXpassSum: 33, proePlays: 60, proe: 40 / 70 - 33 / 60 }
    const week2Off = { ...OFF_BASE, plays: 50, passPlays: 20, proeXpassSum: 15, proePlays: 40, proe: 20 / 50 - 15 / 40 }
    const starters = [row({ team: 'KC' })]
    const liveTeamContext = loadedTeamContext({
      KC: { games: [regGame(1, week1Off, DEF_BASE), regGame(2, week2Off, DEF_BASE)] },
    })
    const { getByTestId } = render(
      <OffencesOwned starters={starters} bench={[]} liveTeamContext={liveTeamContext} currentWeek={3} />
    )
    const cell = getByTestId('offences-owned-KC')
    expect(cell.textContent).toContain('2.0%') // component-aggregated, the correct answer
    expect(cell.textContent).not.toContain('2.3%') // the average of the two stored per-week values
    expect(cell.textContent).not.toContain('4.6%') // the sum of the two stored per-week values
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
