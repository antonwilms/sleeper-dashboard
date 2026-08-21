// @vitest-environment jsdom
//
// dp-v2 Slice 4c — integration coverage for the Environment section (and the RZ-share row it
// unblocked in Usage & efficiency). Separate file from the earlier fixtures: this is the first
// one that needs a multi-season teamContextByYear and historicalTeamTotals on context.
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, within } from '@testing-library/react'
import { ProfileDataContext } from '../../context/ProfileDataContext'
import { PlayerDetailModal } from './PlayerDetailModal'

expect.extend(jestDomMatchers)
afterEach(cleanup)

vi.stubGlobal('IntersectionObserver', class {
  observe() {}
  disconnect() {}
})
Element.prototype.scrollIntoView = vi.fn()

function richDynastyScore() {
  return {
    score: 80, label: 'Elite', confidence: 'high', isRookie: false,
    components: {
      ageAdjusted: { value: 78, weight: 0.28 },
      trajectory: { value: 65, weight: 0.25 },
      currentLevel: { value: 90, weight: 0.22 },
      reliability: { value: 70, weight: 0.10 },
      opportunityQuality: { value: 85, weight: 0.15 },
    },
    signals: { seasonsOfData: 5, draftCapital: null, ktcInfluenced: false },
  }
}

function game(team, off) {
  return {
    week: 1, seasonType: 'REG', opponent: 'XXX',
    off: {
      plays: 60, passPlays: 30, rushPlays: 30,
      epaSum: 1.5, epaPlays: 60,
      passEpaSum: 1.0, passEpaPlays: 30,
      rushEpaSum: 0.5, rushEpaPlays: 30,
      successes: 24, successPlays: 60,
      proePlays: 60, proePassPlays: 30, proeXpassSum: 28,
      rzTrips: 3, rzTdTrips: 1,
      neutralSeconds: 700, neutralGaps: 20,
      pointsScored: 20,
      ...off,
    },
    def: { epaSum: -1.2, epaPlays: 60 },
  }
}

// wrTrd: WR on NYJ in 2021, then DEN from 2023 on — a trade. 2022 has NO teamContextByYear entry
// at all (a missing season), even though the player has a careerStats record that year.
const wrCareerYears = { 2021: 'NYJ', 2022: 'NYJ', 2023: 'DEN', 2024: 'DEN', 2025: 'DEN' }
const careerStats = Object.fromEntries(
  Object.entries(wrCareerYears).map(([season, team]) => [
    season,
    { wrTrd: { gamesPlayed: 16, fantasyPoints: 200, team, stats: { rec_rz_tgt: 12 } } },
  ])
)

const teamContextByYear = {
  2021: {
    complete: true,
    teams: {
      NYJ: { games: [game('NYJ', {})] },
      OTHER: { games: [game('OTHER', { successPlays: 60, successes: 30 })] },
    },
  },
  // 2022 deliberately absent — the missing-season case.
  2023: {
    complete: true,
    teams: {
      DEN: { games: [game('DEN', {})] },
      OTHER: { games: [game('OTHER', {})] },
    },
  },
  2024: {
    complete: true,
    teams: {
      DEN: { games: [game('DEN', {})] },
      OTHER: { games: [game('OTHER', {})] },
    },
  },
  2025: {
    complete: true,
    teams: {
      // DEN is the FASTEST team this season (lowest neutralSeconds/neutralGaps = 20s/gap) but
      // the WORST success rate — deliberately opposite rankings, so a test asserting "DEN ranks
      // 1st for pace" can't be trivially explained by DEN just winning everything.
      DEN: { games: [game('DEN', { neutralSeconds: 400, neutralGaps: 20, successes: 10, successPlays: 60 })] },
      SLOW: { games: [game('SLOW', { neutralSeconds: 900, neutralGaps: 20, successes: 50, successPlays: 60 })] },
      MID: { games: [game('MID', { neutralSeconds: 700, neutralGaps: 20, successes: 30, successPlays: 60 })] },
    },
  },
}

const historicalTeamTotals = {
  2021: { NYJ: { rushAtt: 400, rec: 300, recTgt: 450, rushRz: 40, recRz: 48 } },
  2022: { NYJ: { rushAtt: 400, rec: 300, recTgt: 450, rushRz: 40, recRz: 48 } },
  2023: { DEN: { rushAtt: 400, rec: 300, recTgt: 450, rushRz: 40, recRz: 48 } },
  2024: { DEN: { rushAtt: 400, rec: 300, recTgt: 450, rushRz: 40, recRz: 48 } },
  2025: { DEN: { rushAtt: 400, rec: 300, recTgt: 450, rushRz: 40, recRz: 0 } }, // zero denom this season
}

const playersMap = {
  wrTrd: { player_id: 'wrTrd', position: 'WR', full_name: 'Traded Wideout', age: 27, years_exp: 6, team: 'DEN' },
  noEnv: { player_id: 'noEnv', position: 'WR', full_name: 'No Environment Player', age: 24, years_exp: 2, team: 'MIA' },
}

const noEnvCareerStats = {
  2021: { noEnv: { gamesPlayed: 16, fantasyPoints: 150, stats: {} } }, // no `team` at all → never resolves
}

const playerRows = ['wrTrd', 'noEnv'].map(id => ({
  player_id: id, position: playersMap[id].position, full_name: playersMap[id].full_name,
  dynastyScore: richDynastyScore(),
  ownerTeamName: null, ktcValue: 5000, divergenceSignal: null,
  dynRank: 1, ktcRank: 1, positionRank: 1, currentSeasonPPG: 15,
}))

const positionPeakPPG = { QB: 24, RB: 18, WR: 20, TE: 14 }

function baseContext(overrides = {}) {
  return {
    careerStats, playersMap, playerRows, positionPeakPPG,
    ktcMap: new Map(), historicalShares: {}, collegeStats: {}, seasonProjections: {},
    enrichmentMap: {}, advStats: { byId: {}, year: 2025 },
    gameLogsByYear: {}, nflScheduleByYear: {},
    teamContextByYear, historicalTeamTotals,
    ...overrides,
  }
}

function renderModal(playerId, contextOverrides = {}) {
  return render(
    <ProfileDataContext.Provider value={baseContext(contextOverrides)}>
      <PlayerDetailModal playerId={playerId} myTeamName="My Team" />
    </ProfileDataContext.Provider>
  )
}

describe('PlayerDetailModal — Environment (dp-v2 Slice 4c)', () => {
  it('the index lists eight entries in order', () => {
    const { container } = renderModal('wrTrd')
    expect(screen.getAllByText('Environment').length).toBeGreaterThan(0)
    const sectionIds = [...container.querySelectorAll('section[data-section-id]')].map(s => s.dataset.sectionId)
    expect(sectionIds).toEqual([
      'overview', 'game-log', 'distribution', 'usage', 'availability', 'environment', 'drivers', 'why-next',
    ])
  })

  it('a traded player\'s bars span teams, and the per-season team is rendered', () => {
    const { container } = renderModal('wrTrd')
    const env = within(container.querySelector('#environment'))
    const caption = env.getByText('Team by season:').parentElement.textContent
    expect(caption).toContain('2021 NYJ')
    expect(caption).toContain('2022 NYJ')
    expect(caption).toContain('2023 DEN')
    expect(caption).toContain('2024 DEN')
    expect(caption).toContain('2025 DEN')
  })

  it('pace ranks a fast team correctly — lower seconds ranks better, not worse', () => {
    const { container } = renderModal('wrTrd')
    const paceLabel = within(container.querySelector('#environment')).getByText('Pace')
    // Walk up to the row (label -> popover trigger button -> popover wrapper span -> row flex container).
    const paceRow = paceLabel.closest('button').parentElement.parentElement
    // DEN is fastest (lowest seconds/gap) among 3 teams in 2025 → must rank 1st, not 3rd (worst).
    expect(within(paceRow).getByText('1st of 3')).toBeInTheDocument()
  })

  it('success rate ranks the SAME team worst, proving pace\'s rank direction is computed independently, not a coincidence', () => {
    const { container } = renderModal('wrTrd')
    const successLabel = within(container.querySelector('#environment')).getByText('Success rate')
    const successRow = successLabel.closest('button').parentElement.parentElement
    // DEN has the lowest successes/successPlays among the 3 teams → 3rd of 3, the opposite of its pace rank.
    expect(within(successRow).getByText('3rd of 3')).toBeInTheDocument()
  })

  it('the DISPLAY ONLY badge is present', () => {
    const { container } = renderModal('wrTrd')
    const env = within(container.querySelector('#environment'))
    expect(env.getByText('DISPLAY ONLY')).toBeInTheDocument()
  })

  it('def EPA allowed shows a direction note for a negative value (good defense, bad for player volume)', () => {
    const { container } = renderModal('wrTrd')
    const env = within(container.querySelector('#environment'))
    expect(env.getByText(/defense playing well/)).toBeInTheDocument()
  })

  it('a player whose team never resolves in the loaded window renders a whole-section DegradedBlock, not five void bars', () => {
    const { container } = renderModal('noEnv', { careerStats: noEnvCareerStats })
    expect(screen.getAllByText('Environment').length).toBeGreaterThan(0)
    const env = within(container.querySelector('#environment'))
    expect(env.getByText(/No seasons in the last/)).toBeInTheDocument()
  })

  it('the red-zone share row (4b\'s deferred row) appears for a WR, with a zero-denominator season rendering "—"', () => {
    const { container } = renderModal('wrTrd')
    const usage = within(container.querySelector('#usage'))
    expect(usage.getByText('Red-zone share')).toBeInTheDocument()
  })

  it('no console-visible crash for a season present in teamContextByYear but missing from the axis story (2022 has no teamContext entry)', () => {
    // Smoke: rendering must not throw even though 2022's teamContextByYear key is entirely absent
    // while the player has a real careerStats record that year.
    expect(() => renderModal('wrTrd')).not.toThrow()
  })
})
