// @vitest-environment jsdom
// Import-integrity smoke — §0 failure-mode guard.
// Verifies that RostersTab and MyTeamView mount without throwing after
// their sibling-component and shared-constant imports were split into
// separate files. No deep output assertions — interfaces are unchanged.

import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { RostersTab } from '../league/RostersTab'
import { MyTeamView } from '../roster/MyTeamView'

expect.extend(jestDomMatchers)
afterEach(cleanup)

// Minimal fixture rosterTeams for RostersTab
const FIXTURE_ROSTER_TEAMS = [
  {
    rosterId: 1, ownerId: 'u1', rank: 1, teamName: 'Team A', managerName: 'Manager A',
    starters: [{ id: 'p1', slot: 'Starter', full_name: 'Player One', position: 'QB', team: 'KC', age: 28 }],
    bench:    [{ id: 'p2', slot: 'Bench',   full_name: 'Player Two', position: 'RB', team: 'SF', age: 24 }],
    reserve:  [],
  },
]

// ---------------------------------------------------------------------------
// RostersTab (depends on extracted SlotBadge + POSITION_ORDER)
// ---------------------------------------------------------------------------
describe('RostersTab import integrity', () => {
  it('mounts without throwing', () => {
    expect(() => render(<RostersTab rosterTeams={FIXTURE_ROSTER_TEAMS} />)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// MyTeamView (depends on extracted PlayerCard + Sparkline + POSITION_ORDER)
// ---------------------------------------------------------------------------
describe('MyTeamView import integrity', () => {
  it('mounts in noRoster branch without throwing', () => {
    expect(() =>
      render(<MyTeamView data={{ noRoster: true }} loading={false} error={null} projections={null} />)
    ).not.toThrow()
  })

  it('mounts in noStatsYet branch without throwing', () => {
    const data = {
      team: { teamName: 'My Team', managerName: 'Me' },
      players: [
        {
          id: 'p1', slot: 'Starter', position: 'QB', full_name: 'Player One',
          team: 'KC', age: 28, projected: 22.5, lastWeekPts: null,
          last4: [null, null, null, null], avg: null,
        },
      ],
      noStatsYet: true,
    }
    expect(() =>
      render(<MyTeamView data={data} loading={false} error={null} projections={null} />)
    ).not.toThrow()
  })

  it('mounts in normal stats branch without throwing (exercises PlayerCard + Sparkline)', () => {
    const data = {
      team: { teamName: 'My Team', managerName: 'Me' },
      players: [
        {
          id: 'p1', slot: 'Starter', position: 'QB', full_name: 'Player One',
          team: 'KC', age: 28, projected: 22.5, lastWeekPts: 18.5,
          last4: [18.5, 20.0, 16.0, 19.0], avg: 18.5,
        },
        {
          id: 'p2', slot: 'Bench', position: 'RB', full_name: 'Player Two',
          team: 'SF', age: 24, projected: 14.0, lastWeekPts: null,
          last4: [null, null, null, null], avg: null,
        },
      ],
      noStatsYet: false,
    }
    expect(() =>
      render(<MyTeamView data={data} loading={false} error={null} projections={null} />)
    ).not.toThrow()
  })
})
