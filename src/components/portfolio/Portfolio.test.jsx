// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Portfolio } from './Portfolio'
import { parseKtcPickRows } from '../../utils/ktcPicks'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function baseRow(overrides) {
  return {
    player_id: 'x', position: 'WR', full_name: 'X Player', age: null, years_exp: null, nfl_team: null,
    ownerTeamName: null, ktcValue: null, projectedPPG: null,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// myTeamName === null — one empty state
// ---------------------------------------------------------------------------
describe('myTeamName null', () => {
  it('renders a single explanatory empty state, not the tile grid', () => {
    render(<Portfolio playerRows={[baseRow({ ownerTeamName: 'Some Team', ktcValue: 100 })]} myTeamName={null} />)
    expect(screen.getByText('My Team')).toBeInTheDocument()
    expect(screen.getByText(/No roster found/)).toBeInTheDocument()
    expect(screen.queryByTestId('tile-lineup-last')).not.toBeInTheDocument()
  })
})

describe('mounting with no props', () => {
  it('does not crash and renders the myTeamName-null empty state (its default)', () => {
    render(<Portfolio />)
    expect(screen.getByText('My Team')).toBeInTheDocument()
    expect(screen.getByText(/No roster found/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Row interaction — with rosterTeams defaulting to [] there is no lineup, so the
// owned row renders as a bench row.
// ---------------------------------------------------------------------------
describe('row interaction', () => {
  const playerRows = [
    baseRow({ player_id: 'r1', full_name: 'Row One', ownerTeamName: 'My Team', ktcValue: 100 }),
  ]

  it('row click calls onOpenPlayerDetail with the player_id', () => {
    const onOpenPlayerDetail = vi.fn()
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" onOpenPlayerDetail={onOpenPlayerDetail} />)
    expect(screen.getByText('Row One')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Row One').closest('tr'))
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('r1')
  })

  it('keyboard activation (Enter) calls onOpenPlayerDetail with the player_id', () => {
    const onOpenPlayerDetail = vi.fn()
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" onOpenPlayerDetail={onOpenPlayerDetail} />)
    fireEvent.keyDown(screen.getByText('Row One').closest('tr'), { key: 'Enter' })
    expect(onOpenPlayerDetail).toHaveBeenCalledWith('r1')
  })
})

// ---------------------------------------------------------------------------
// Picks — traded-in/own meta, traded-away absent, unpriced, pick click, gloss popover
// ---------------------------------------------------------------------------
describe('picks on the bench', () => {
  const rosterTeams = [
    { rosterId: 1, teamName: 'Third Team', starters: [], bench: [], reserve: [] },
    { rosterId: 2, teamName: 'My Team', starters: [], bench: [], reserve: [] },
    { rosterId: 3, teamName: 'Other Team', starters: [], bench: [], reserve: [] },
  ]
  const tradedPicks = [
    { season: '2027', round: 1, roster_id: 2, owner_id: 3, previous_owner_id: 2 },
    { season: '2027', round: 1, roster_id: 3, owner_id: 2, previous_owner_id: 3 },
  ]
  const ktcRows = [
    { name: '2027 Early 1st', position: null, team: 'FA', value: 4000 },
    { name: '2027 Mid 1st', position: null, team: 'FA', value: 3690 },
    { name: '2027 Late 1st', position: null, team: 'FA', value: 3200 },
    { name: '2027 Mid 2nd', position: null, team: 'FA', value: 1500 },
  ]
  const ktcPickTable = parseKtcPickRows(ktcRows)
  const firstLiveDraftSeason = 2027
  const draftRounds = 2

  it('a traded-in pick and an own pick both appear, with the correct meta line each', () => {
    render(
      <Portfolio
        playerRows={[]} rosterTeams={rosterTeams} myTeamName="My Team"
        tradedPicks={tradedPicks} ktcPickTable={ktcPickTable}
        firstLiveDraftSeason={firstLiveDraftSeason} draftRounds={draftRounds}
      />
    )
    const own = screen.getByTestId('bench-pick-2027-2-2')
    expect(own.textContent).toContain('2027 2nd')
    expect(own.textContent).toContain('own pick')
    const tradedIn = screen.getByTestId('bench-pick-2027-1-3')
    expect(tradedIn.textContent).toContain('2027 1st')
    expect(tradedIn.textContent).toContain('via Other Team')
  })

  it('the traded-away pick does NOT appear among "My Team"\'s holdings', () => {
    render(
      <Portfolio
        playerRows={[]} rosterTeams={rosterTeams} myTeamName="Other Team"
        tradedPicks={tradedPicks} ktcPickTable={ktcPickTable}
        firstLiveDraftSeason={firstLiveDraftSeason} draftRounds={draftRounds}
      />
    )
    expect(screen.getByTestId('bench-pick-2027-1-2').textContent).toContain('via My Team')
    expect(screen.getByTestId('bench-pick-2027-2-3').textContent).toContain('own pick')
  })

  it('an unpriced round renders "—" (col-ktc), never "0"', () => {
    render(
      <Portfolio
        playerRows={[]} rosterTeams={rosterTeams} myTeamName="My Team"
        tradedPicks={tradedPicks} ktcPickTable={ktcPickTable}
        firstLiveDraftSeason={firstLiveDraftSeason} draftRounds={3}
      />
    )
    const unpriced = screen.getByTestId('bench-pick-2027-3-2')
    const ktcCell = unpriced.querySelector('[data-testid="col-ktc"]')
    expect(ktcCell.textContent).toBe('—')
  })

  it('a pick row click does NOT call onOpenPlayerDetail — picks have no player_id', () => {
    const onOpenPlayerDetail = vi.fn()
    render(
      <Portfolio
        playerRows={[]} rosterTeams={rosterTeams} myTeamName="My Team"
        tradedPicks={tradedPicks} ktcPickTable={ktcPickTable}
        firstLiveDraftSeason={firstLiveDraftSeason} draftRounds={draftRounds}
        onOpenPlayerDetail={onOpenPlayerDetail}
      />
    )
    fireEvent.click(screen.getByTestId('bench-pick-2027-2-2'))
    expect(onOpenPlayerDetail).not.toHaveBeenCalled()
  })

  it('clicking a priced pick reveals Early/Mid/Late in gloss text, priced at Mid', () => {
    render(
      <Portfolio
        playerRows={[]} rosterTeams={rosterTeams} myTeamName="My Team"
        tradedPicks={tradedPicks} ktcPickTable={ktcPickTable}
        firstLiveDraftSeason={firstLiveDraftSeason} draftRounds={draftRounds}
      />
    )
    const trigger = screen.getByTestId('bench-pick-2027-1-3').querySelector('button')
    fireEvent.click(trigger)
    expect(screen.getByText(/Early 4,000/)).toBeInTheDocument()
    expect(screen.getByText(/Mid 3,690/)).toBeInTheDocument()
    expect(screen.getByText(/Late 3,200/)).toBeInTheDocument()
    expect(screen.getByText(/priced at Mid/)).toBeInTheDocument()
    expect(screen.queryByText(/LEAGUE 10th/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Fixture M (main) — starting ten, bench, tiles
// ---------------------------------------------------------------------------
describe('Fixture M', () => {
  const LEAGUE = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'SUPER_FLEX', 'BN', 'BN']
  const W = (p, d = 0) => [...Array(p).fill('P'), ...Array(d).fill('D'), ...Array(18 - p - d).fill('X')]

  const team1Ids = ['q1', 'q2', 'q3', 'r1', 'r2', 'r3', 'r4', 'w1', 'w2', 'w3', 'w4', 't1', 't2']
  const team2Ids = ['a1', 'a2', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'd1']

  const posOf = id => {
    if (id.startsWith('q') || id.startsWith('a')) return 'QB'
    if (id.startsWith('r') || id.startsWith('b')) return 'RB'
    if (id.startsWith('w') || id.startsWith('c')) return 'WR'
    return 'TE'
  }
  const fullNameOf = id => (id === 'q2' ? 'Rookie Qb' : `Player ${id}`)

  const projectedPPG = {
    q1: 22, q2: 16, q3: 14, r1: 14, r2: 12, r3: 11, r4: 6, w1: 17, w2: 15, w3: 13, w4: 9, t1: 10, t2: 5,
    a1: 10, a2: 10, b1: 10, b2: 10, b3: 10, b4: 10, c1: 10, c2: 10, c3: 10, d1: 10,
  }

  const careerRow = (fp, weeklyStatus, stats) => ({ fantasyPoints: fp, gamesPlayed: 10, weeklyStatus, stats: stats ?? {} })

  const careerStats = {
    2025: {
      q1: careerRow(210, W(17)),
      // q2: none — rookie, no line
      q3: careerRow(120, W(17)),
      r1: careerRow(130, W(16, 1), { off_snp: 500, tm_off_snp: 1000 }),
      r2: careerRow(110, W(17)),
      r3: careerRow(100, W(17)),
      r4: careerRow(50, W(17)),
      w1: careerRow(160, W(15, 2), { off_snp: 900, tm_off_snp: 1000, rec_tgt: 25 }),
      w2: careerRow(140, W(17), { rec_tgt: 75 }),
      w3: careerRow(120, W(17)),
      w4: careerRow(80, W(17)),
      t1: careerRow(90, W(17)),
      t2: careerRow(40, W(17)),
    },
  }
  // w1/w2 carry `team` (era-accurate grain) so buildTeamShareTotals/buildPerSeasonTeamShares can
  // attribute a DAL share; every other player has no `team` in careerStats and is skipped by both.
  careerStats[2025].w1.team = 'DAL'
  careerStats[2025].w2.team = 'DAL'

  const playerMapExtras = {
    q1: { depth_chart_position: 'QB', depth_chart_order: 1 },
    w1: { depth_chart_position: 'LWR', depth_chart_order: 1 },
    t1: { injury_status: 'Questionable', injury_body_part: 'Hamstring' },
  }
  const playerMap = {}
  for (const id of [...team1Ids, ...team2Ids]) {
    playerMap[id] = { position: posOf(id), full_name: fullNameOf(id), ...(playerMapExtras[id] ?? {}) }
  }

  const playerRowsExtras = {
    q1: { ktcValue: 7000 },
    q2: { years_exp: 0 },
    w1: { ktcValue: 6000 },
  }
  const playerRows = [
    ...team1Ids.map(id => baseRow({
      player_id: id, position: posOf(id), full_name: fullNameOf(id), ownerTeamName: 'My Team',
      projectedPPG: projectedPPG[id], ...(playerRowsExtras[id] ?? {}),
    })),
    ...team2Ids.map(id => baseRow({
      player_id: id, position: posOf(id), full_name: fullNameOf(id), ownerTeamName: 'Other Team',
      projectedPPG: projectedPPG[id],
    })),
  ]

  const rosterEntry = id => ({ id, slot: 'Bench', full_name: fullNameOf(id), position: posOf(id), team: 'DAL', age: 25 })
  const rosterTeams = [
    { rosterId: 1, teamName: 'My Team', starters: [], bench: team1Ids.map(rosterEntry), reserve: [] },
    { rosterId: 2, teamName: 'Other Team', starters: [], bench: team2Ids.map(rosterEntry), reserve: [] },
  ]

  const seasonProjections = Object.fromEntries(
    [...team1Ids, ...team2Ids].map(id => [id, { projectedPPG: projectedPPG[id] }])
  )

  const commonProps = {
    playerRows, rosterTeams, seasonProjections, myTeamName: 'My Team',
    careerStats, playerMap, rosterPositions: LEAGUE,
  }

  // ClickableRow (src/components/dp/cells.jsx, on the "must not change" list) does not forward a
  // data-testid to its <tr> — only the empty-slot branch (a plain <tr>) gets `starter-{i}`
  // directly. Filled slots are therefore located positionally within the tbody instead; the cell
  // testids (`col-*`) are unaffected since those <td>s are written directly by Portfolio.jsx.
  const starterRow = i => screen.getByTestId('starting-ten').querySelectorAll('tbody tr')[i]

  it('1. slot order and expected players', () => {
    render(<Portfolio {...commonProps} />)
    const expectedSlots = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLX', 'FLX', 'SF']
    const actual = expectedSlots.map((_, i) => starterRow(i).querySelector('[data-testid="col-slot"]').textContent)
    expect(actual).toEqual(expectedSlots)
    expect(starterRow(9).textContent).toContain('Rookie Qb')
    expect(starterRow(7).querySelector('[data-testid="col-player"]').textContent).toContain('Player r3')
  })

  it('2. rookie row degrades', () => {
    render(<Portfolio {...commonProps} />)
    const row9 = starterRow(9)
    expect(row9.querySelector('[data-testid="col-ppg"]').textContent).toContain('16.0')
    expect(row9.querySelector('[data-testid="col-ppg"]').textContent).toContain('—')
    expect(row9.querySelector('[data-testid="col-delta"]').textContent).toBe('—')
    expect(row9.querySelector('[data-testid="col-posrank"]').textContent).toBe('—')
    expect(row9.querySelector('[data-testid="col-games"]').textContent).toBe('—')
    expect(row9.querySelector('[data-testid="col-snap"]').textContent).toBe('—')
    expect(screen.getByTestId('starting-ten').textContent).toContain(
      'Rookie Qb is a rookie: no 2025 line, projection from draft capital and college profile.'
    )
  })

  it('3. real columns', () => {
    render(<Portfolio {...commonProps} />)
    const row3 = starterRow(3)
    expect(row3.querySelector('[data-testid="col-snap"]').textContent).toBe('90%')
    expect(row3.querySelector('[data-testid="col-share"]').textContent).toBe('25%')
    expect(row3.querySelector('[data-testid="col-role"]').textContent).toBe('LWR1')
    expect(row3.querySelector('[data-testid="col-games"]').textContent).toContain('15/17')
    expect(row3.querySelector('[data-testid="col-posrank"]').textContent).toBe('WR1')
    expect(row3.querySelector('[data-testid="col-ktc"]').textContent).toBe('6,000')
    expect(row3.querySelector('[data-testid="col-delta"]').textContent).toBe('+1.0')

    expect(starterRow(4).querySelector('[data-testid="col-posrank"]').textContent).toBe('WR2')
    expect(starterRow(0).querySelector('[data-testid="col-snap"]').textContent).toBe('—')
    expect(starterRow(0).querySelector('[data-testid="col-share"]').textContent).toBe('—')
    expect(starterRow(2).querySelector('[data-testid="col-role"]').textContent).toBe('—')
    expect(starterRow(6).querySelector('[data-testid="col-status"]').textContent).toBe('Q · HAMSTRING')
  })

  it('4. GAME SCRIPT degraded, header present', () => {
    render(<Portfolio {...commonProps} />)
    for (let i = 0; i < 10; i++) {
      expect(starterRow(i).querySelector('[data-testid="col-script"]').textContent).toBe('—')
    }
    const header = screen.getByTestId('starting-ten').querySelector('thead').textContent
    expect(header).toContain('GAME SCRIPT')
    expect(header).toContain('SNAP')
    expect(header).toContain('STATUS')
  })

  it('5. tile GAMES MISSED', () => {
    render(<Portfolio {...commonProps} />)
    expect(screen.getByTestId('tile-games-missed-value').textContent).toBe('3')
    const tile = screen.getByTestId('tile-games-missed')
    expect(tile.textContent).toContain('of 153')
    expect(tile.textContent).toContain('by your ten starters')
    expect(tile.textContent).toContain('1 questionable now')
  })

  it('6. bench order and VS MEDIAN STARTER', () => {
    render(<Portfolio {...commonProps} />)
    const bench = screen.getByTestId('bench')
    const rows = [...bench.querySelectorAll('tbody tr')]
    expect(rows.map(r => r.querySelector('[data-testid="col-player"]').textContent)).toEqual([
      expect.stringContaining('Player q3'), expect.stringContaining('Player r4'), expect.stringContaining('Player t2'),
    ])
    expect(rows[0].querySelector('[data-testid="col-vsmedian"]').textContent).toBe('+1.0 vs SF')
    expect(rows[1].querySelector('[data-testid="col-vsmedian"]').textContent).toBe('−3.5 vs FLX')
    const t2Cell = rows[2].querySelector('[data-testid="col-vsmedian"]')
    expect(t2Cell.textContent).toBe('−4.5 vs FLX')
    expect(t2Cell.querySelector('span').className).toContain('text-dp-down-text')
  })

  it('7. picks in bench', () => {
    const ktcRows = [
      { name: '2027 Early 1st', position: null, team: 'FA', value: 4000 },
      { name: '2027 Mid 1st', position: null, team: 'FA', value: 3690 },
      { name: '2027 Late 1st', position: null, team: 'FA', value: 3200 },
    ]
    render(
      <Portfolio
        {...commonProps}
        tradedPicks={[]}
        ktcPickTable={parseKtcPickRows(ktcRows)}
        firstLiveDraftSeason={2027}
        draftRounds={1}
      />
    )
    const bench = screen.getByTestId('bench')
    const rows = [...bench.querySelectorAll('tbody tr')]
    const last = rows[rows.length - 1]
    expect(last.dataset.testid).toBe('bench-pick-2027-1-1')
    expect(last.querySelector('[data-testid="col-ppg"]').textContent).toBe('—')
    expect(last.querySelector('[data-testid="col-vsmedian"]').textContent).toBe('—')
    expect(last.querySelector('[data-testid="col-posrank"]').textContent).toBe('—')
    expect(last.querySelector('[data-testid="col-games"]').textContent).toBe('—')
    expect(last.querySelector('[data-testid="col-share"]').textContent).toBe('—')
    expect(last.querySelector('[data-testid="col-snap"]').textContent).toBe('—')
    expect(last.querySelector('[data-testid="col-role"]').textContent).toBe('—')
    expect(last.textContent).toContain('2027 1st')
    expect(last.textContent).toContain('own pick')
    expect(last.textContent).toContain('3,690')
    expect(bench.textContent).toContain('Bench · 3 players and 1 pick')
  })

  it('8. degraded inputs (careerStats/playerMap null) do not throw', () => {
    render(<Portfolio {...commonProps} careerStats={null} playerMap={null} />)
    for (let i = 0; i < 10; i++) {
      const row = starterRow(i)
      for (const key of ['col-share', 'col-snap', 'col-role', 'col-status', 'col-posrank', 'col-games']) {
        expect(row.querySelector(`[data-testid="${key}"]`).textContent).toBe('—')
      }
    }
    expect(screen.getByTestId('tile-games-missed-value').textContent).toBe('—')
    expect(screen.getByTestId('tile-games-missed').textContent).not.toContain('questionable')
  })

  it('9. ownership — Other Team players never appear', () => {
    render(<Portfolio {...commonProps} />)
    expect(screen.queryByText('Player a1')).not.toBeInTheDocument()
    expect(screen.queryByText('Player b1')).not.toBeInTheDocument()
  })

  it('10. nav-free heading', () => {
    render(<Portfolio {...commonProps} />)
    expect(screen.getByRole('heading', { name: 'My Team' })).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Fixture S (summary sentence + ladder tiles)
// ---------------------------------------------------------------------------
describe('Fixture S', () => {
  const W17 = [...Array(17).fill('P'), 'X']
  const ROSTER_POSITIONS = ['QB', 'RB', 'WR', 'TE']

  function buildFixtureS(wrProjTeam1 = 14) {
    const teams = [
      { rosterId: 1, teamName: 'My Team', QB: [25, 20], RB: [8, 10], WR: [wrProjTeam1, 12], TE: [9, 7] },
      { rosterId: 2, teamName: 'Team 2', QB: [20, 22], RB: [15, 14], WR: [16, 15], TE: [10, 8] },
      { rosterId: 3, teamName: 'Team 3', QB: [18, 16], RB: [12, 11], WR: [12, 10], TE: [6, 5] },
      { rosterId: 4, teamName: 'Team 4', QB: [15, 14], RB: [10, 9], WR: [11, 9], TE: [21, 11] },
    ]
    const playerMap = {}
    const playerRows = []
    const seasonProjections = {}
    const careerStats = { 2025: {} }
    const rosterTeams = []

    for (const t of teams) {
      const bench = []
      for (const pos of ROSTER_POSITIONS) {
        const id = `${t.rosterId}-${pos}`
        const [proj, last] = t[pos]
        playerMap[id] = { position: pos, full_name: id }
        playerRows.push({
          player_id: id, position: pos, full_name: id, ownerTeamName: t.teamName,
          projectedPPG: proj, ktcValue: null, age: null, years_exp: null, nfl_team: null,
        })
        seasonProjections[id] = { projectedPPG: proj }
        careerStats[2025][id] = { fantasyPoints: last * 10, gamesPlayed: 10, weeklyStatus: W17 }
        bench.push({ id, slot: 'Bench', full_name: id, position: pos, team: null, age: null })
      }
      rosterTeams.push({ rosterId: t.rosterId, teamName: t.teamName, starters: [], bench, reserve: [] })
    }

    return { playerMap, playerRows, seasonProjections, careerStats, rosterTeams }
  }

  it('11. summary sentence — carry + drag (top-half form)', () => {
    const { playerMap, playerRows, seasonProjections, careerStats, rosterTeams } = buildFixtureS()
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
      />
    )
    expect(screen.getByTestId('summary-sentence').textContent).toBe(
      'Your starting ten scored 49.0 points a week last season, 2nd of 4. Projected 56.0 for 2026, 3rd. ' +
      'The quarterbacks carry it; the backfield is what keeps it out of the top half.'
    )
  })

  it('12. tile text', () => {
    const { playerMap, playerRows, seasonProjections, careerStats, rosterTeams } = buildFixtureS()
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
      />
    )
    const last = screen.getByTestId('tile-lineup-last')
    expect(last.textContent).toContain('49.0')
    expect(last.textContent).toContain('2nd')
    expect(last.textContent).toContain('league median 46.0')
    const proj = screen.getByTestId('tile-lineup-proj')
    expect(proj.textContent).toContain('56.0')
    expect(proj.textContent).toContain('3rd')
    expect(proj.textContent).toContain('league median 56.5 · +7.0 on last year')
  })

  it('13. tie omits carry; weak-spot form', () => {
    const { playerMap, playerRows, seasonProjections, careerStats, rosterTeams } = buildFixtureS(17)
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
      />
    )
    const text = screen.getByTestId('summary-sentence').textContent
    expect(text).toMatch(/Projected 59\.0 for 2026, 2nd\. The backfield is the weak spot\.$/)
    expect(text).not.toContain('carr')
  })

  it('14. header meta', () => {
    const { playerMap, playerRows, seasonProjections, careerStats, rosterTeams } = buildFixtureS()
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
        leagueName="Dynasty 040" scoringSettings={{ rec: 0.5 }}
      />
    )
    expect(screen.getByText('My Team · Dynasty 040 · 4-team 1QB · half-PPR')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Fixture C (bench collapse)
// ---------------------------------------------------------------------------
describe('Fixture C', () => {
  it('15. bench collapses to 10 with a toggle', () => {
    const rosterPositions = ['QB', 'BN']
    const myQb = { player_id: 'myqb', position: 'QB', full_name: 'My QB', ownerTeamName: 'My Team', projectedPPG: 20, ktcValue: null, age: null, years_exp: null, nfl_team: null }
    const rbs = Array.from({ length: 11 }, (_, i) => ({
      player_id: `x${i + 1}`, position: 'RB', full_name: `X${i + 1}`, ownerTeamName: 'My Team',
      projectedPPG: 11 - i, ktcValue: null, age: null, years_exp: null, nfl_team: null,
    }))
    const otherQb = { player_id: 'oqb', position: 'QB', full_name: 'Other QB', ownerTeamName: 'Other Team', projectedPPG: 15, ktcValue: null, age: null, years_exp: null, nfl_team: null }

    const playerRows = [myQb, ...rbs, otherQb]
    const seasonProjections = Object.fromEntries(playerRows.map(r => [r.player_id, { projectedPPG: r.projectedPPG }]))
    const rosterTeams = [
      { rosterId: 1, teamName: 'My Team', starters: [], bench: [myQb, ...rbs].map(r => ({ id: r.player_id, slot: 'Bench', full_name: r.full_name, position: r.position })), reserve: [] },
      { rosterId: 2, teamName: 'Other Team', starters: [], bench: [{ id: otherQb.player_id, slot: 'Bench', full_name: otherQb.full_name, position: otherQb.position }], reserve: [] },
    ]

    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" rosterPositions={rosterPositions}
      />
    )

    const bench = screen.getByTestId('bench')
    expect(bench.querySelectorAll('tbody tr').length).toBe(10)
    const toggle = screen.getByTestId('bench-toggle')
    expect(toggle.textContent).toBe('show all 11 →')
    fireEvent.click(toggle)
    expect(bench.querySelectorAll('tbody tr').length).toBe(11)
    expect(toggle.textContent).toBe('show fewer')
  })
})
