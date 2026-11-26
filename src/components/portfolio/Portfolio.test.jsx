// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { Portfolio } from './Portfolio'
import { parseKtcPickRows } from '../../utils/ktcPicks'
import { AGE_CAUTION } from '../../utils/twoYearBaseline'
import { PPG_RANK_MIN_GAMES } from '../../utils/weeklyRanks'

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
    expect(screen.queryByTestId('league-ladders')).not.toBeInTheDocument()
    expect(screen.queryByTestId('weakest-slots')).not.toBeInTheDocument()
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

describe('picks on the bench', () => {
  const rosterTeams = [
    { rosterId: 1, teamName: 'Third Team', starters: [], bench: [], reserve: [] },
    { rosterId: 2, teamName: 'My Team', starters: [], bench: [], reserve: [] },
    { rosterId: 3, teamName: 'Other Team', starters: [], bench: [], reserve: [] },
  ]
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

  // T11 — picks live in their own block, in and out of season; the Bench lists players only.
  it.each([['off-season', undefined], ['in season', { week: 4, season: '2026', season_type: 'regular', season_start_date: '2026-09-09' }]])(
    'T11 (%s): picks sit in the bench-picks block, not among the Bench rows; the Bench header counts players only',
    (_label, nflState) => {
      render(
        <Portfolio
          playerRows={[]} rosterTeams={rosterTeams} myTeamName="My Team"
          tradedPicks={tradedPicks} ktcPickTable={ktcPickTable}
          firstLiveDraftSeason={firstLiveDraftSeason} draftRounds={draftRounds} nflState={nflState}
        />
      )
      const bench = screen.getByTestId('bench')
      expect(bench.querySelectorAll('[data-testid^="bench-pick-"]').length).toBe(0)
      expect(bench.querySelectorAll('[data-testid="col-player"]').length).toBe(0) // a pick row in the Bench table would render a player cell
      expect(bench.textContent).toContain('Bench · 0 players')
      expect(bench.textContent).not.toMatch(/pick/i)
      const block = screen.getByTestId('bench-picks')
      expect(block.querySelectorAll('[data-testid^="bench-pick-"]').length).toBe(2) // own 2027 R2 + traded-in 2027 R1; my own R1 was traded away
      expect(block.querySelector('[data-testid="bench-pick-2027-2-2"]')).not.toBeNull()
      expect(block.querySelector('[data-testid="bench-pick-2027-1-3"]')).not.toBeNull()
      expect(block.textContent).toContain('Draft picks · 2')
      expect(block.querySelector('[data-testid="col-script"]')).toBeNull()
    }
  )

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
    const unpriced = screen.getByTestId('bench-picks').querySelector('[data-testid="bench-pick-2027-3-2"]')
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
  // Every 2025 offence row carries `weeklyStats` whose played-week sums equal its `stats`, so the season is
  // `covered` and Market's games-played share resolves (F1). w1/w2 spread rec_tgt (25 over 15 weeks, 75 over 17);
  // every other key's total sits in the row's first played week. DAL targets in w1's 15 weeks = 25 + 45 = 70.
  for (const row of Object.values(careerStats[2025])) {
    const ws = {}
    for (const [k, v] of Object.entries(row.stats)) ws[1] = { ...(ws[1] ?? {}), [k]: v }
    row.weeklyStats = ws
  }
  careerStats[2025].w1.weeklyStats = {}
  for (let wk = 1; wk <= 15; wk++) careerStats[2025].w1.weeklyStats[wk] = { rec_tgt: wk <= 10 ? 2 : 1, ...(wk === 1 ? { off_snp: 900, tm_off_snp: 1000 } : {}) }
  careerStats[2025].w2.weeklyStats = {}
  for (let wk = 1; wk <= 17; wk++) careerStats[2025].w2.weeklyStats[wk] = { rec_tgt: wk <= 15 ? 3 : 15 }

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
    // Games-played share (Market's): 25 targets of DAL's 70 in w1's 15 played weeks — the season-total share would read 25%.
    expect(row3.querySelector('[data-testid="col-share"]').textContent).toBe('36%')
    expect(row3.querySelector('[data-testid="col-role"]').textContent).toBe('LWR1')
    expect(row3.querySelector('[data-testid="col-games"]').textContent).toContain('15/17')
    expect(row3.querySelector('[data-testid="col-posrank"]').textContent).toBe('WR1 · WR1/g')
    expect(row3.querySelector('[data-testid="col-ktc"]').textContent).toBe('6,000')
    expect(row3.querySelector('[data-testid="col-delta"]').textContent).toBe('+1.0')

    expect(starterRow(4).querySelector('[data-testid="col-posrank"]').textContent).toBe('WR2 · WR2/g')
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

  it('7. picks in their own block, below the Bench', () => {
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
    expect(bench.querySelectorAll('[data-testid^="bench-pick-"]').length).toBe(0)
    expect(bench.textContent).toContain('Bench · 3 players')
    expect(bench.textContent).not.toContain('pick')
    const block = screen.getByTestId('bench-picks')
    const rows = [...block.querySelectorAll('tbody tr')]
    expect(rows.length).toBe(1)
    const last = rows[0]
    expect(last.dataset.testid).toBe('bench-pick-2027-1-1')
    expect(last.querySelectorAll('td').length).toBe(2)
    expect(last.textContent).toContain('2027 1st')
    expect(last.textContent).toContain('own pick')
    expect(last.textContent).toContain('3,690')
    expect(block.textContent).toContain('Draft picks · 1')
    // The block follows the Bench in the document.
    expect(bench.compareDocumentPosition(block) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
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
    expect(screen.getByTestId('tile-lineup-last-value').textContent).toBe('—')
    // The projected ladder is independent of `careerStats` — it is built from `seasonProjections`
    // — so this tile keeps a real value while `tile-lineup-last-value` degrades to `—`. That is
    // the contract, not a leak. 139.0 is Fixture M's own optimal-ten projected total:
    // 22 + 14 + 12 + 17 + 15 + 13 + 10 + 11 + 9 + 16.
    expect(screen.getByTestId('tile-lineup-proj-value').textContent).toBe('139.0')
  })

  it('F2-2. no projections either → both ladder tiles degrade', () => {
    render(<Portfolio {...commonProps} careerStats={null} playerMap={null} seasonProjections={null} />)
    expect(screen.getByTestId('tile-lineup-last-value').textContent).toBe('—')
    expect(screen.getByTestId('tile-lineup-proj-value').textContent).toBe('—')
    expect(screen.queryByTestId('summary-sentence')).not.toBeInTheDocument()
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

  it('11. league ladders and weakest slots both render', () => {
    render(<Portfolio {...commonProps} />)
    expect(screen.getByTestId('league-ladders')).toBeInTheDocument()
    expect(screen.getByTestId('weakest-slots')).toBeInTheDocument()
    const ladders = screen.getByTestId('league-ladders')
    for (const pos of ['QB', 'RB', 'WR', 'TE', 'Lineup']) {
      expect(ladders.querySelector(`[data-testid="ladder-row-${pos}"]`)).not.toBeNull()
    }
    expect(ladders.querySelectorAll('[data-testid^="ladder-row-"]').length).toBe(5)
  })

  // ── P5b — in-season columns (season-phase layout, total-points ranks) ──────────────────────
  const REG_WK4 = { week: 4, season: '2026', season_type: 'regular', season_start_date: '2026-09-09' }
  const LIVE = { season: 2026, complete: true, players: {
    w1: { gamesPlayed: 3, fantasyPoints: 54, scoringBasis: 'league' },   // 18.0
    w2: { gamesPlayed: 3, fantasyPoints: 60, scoringBasis: 'league' },   // 20.0 — WR1 so far
  } }
  const scoredProj = { ...seasonProjections,
    w1: { projectedPPG: 17, inSeason: { n: 3, ros: { prior: 16, weight: 0.3, value: 17 } } } }
  const inSeasonProps = { ...commonProps, seasonProjections: scoredProj, nflState: REG_WK4, liveSeasonTotals: LIVE }
  const cell = (row, key) => row.querySelector(`[data-testid="${key}"]`)
  const startHeader = () => screen.getByTestId('starting-ten').querySelector('thead').textContent

  it('P5b-1 rank basis is total points, not PPG', () => {
    const cs = { 2025: { ...careerStats[2025], w2: { ...careerStats[2025].w2, gamesPlayed: 5 } } }
    render(<Portfolio {...commonProps} careerStats={cs} />)
    expect(cell(starterRow(3), 'col-posrank').textContent).toBe('WR1 · WR2/g')
    expect(cell(starterRow(4), 'col-posrank').textContent).toBe('WR2 · WR1/g')
    expect(screen.getByTestId('starting-ten').textContent).toContain('by total points, then, dimmer, by points per game')
  })

  it('P5b-2 in-season layout: last · so far · ROS · Δ', () => {
    render(<Portfolio {...inSeasonProps} />)
    const header = startHeader()
    expect(header).toContain('2026 so far')
    expect(header).toContain('ROS')
    expect(header).toContain('SHARE 2026')
    expect(header).not.toContain('SHARE 2025')
    const row3 = starterRow(3)
    expect(cell(row3, 'col-ppg')).toBeNull()
    expect(cell(row3, 'col-posrank')).toBeNull()
    expect(cell(row3, 'col-last').textContent).toContain('16.0')
    expect(cell(row3, 'col-last').textContent).toContain('WR1 · WR1/g')
    expect(cell(row3, 'col-sofar').textContent).toContain('18.0')
    expect(cell(row3, 'col-sofar').textContent).toContain('WR2 · WR2/g · 3 G')
    // T14: the ROS cell is the bare number; the % lives in its popover.
    expect(cell(row3, 'col-ros').textContent).toBe('17.0')
    expect(cell(row3, 'col-delta').textContent).toBe('+1.0')
    const row4 = starterRow(4)
    expect(cell(row4, 'col-sofar').textContent).toContain('20.0')
    expect(cell(row4, 'col-sofar').textContent).toContain('WR1 · WR1/g')
    expect(cell(row4, 'col-ros').textContent).toBe('—')
    expect(cell(row4, 'col-delta').textContent).toBe('—')
    const benchRow = screen.getByTestId('bench').querySelector('tbody tr')
    expect(benchRow.dataset.testid ?? '').not.toMatch(/pick/)
    expect(cell(benchRow, 'col-sofar').textContent).toMatch(/\d|—/)
    expect(cell(benchRow, 'col-ros').textContent).toMatch(/\d|—/)
    expect(screen.getByTestId('starting-ten').textContent).not.toContain('2026 projected')
    expect(screen.queryByTestId('live-missing-note')).not.toBeInTheDocument()
    expect(screen.queryByTestId('ros-missing-note')).not.toBeInTheDocument()
  })

  it('P5b-F the so-far per-game rank applies the games floor, and the pair never wraps', () => {
    const live = { ...LIVE, players: { ...LIVE.players, w2: { gamesPlayed: 2, fantasyPoints: 60, scoringBasis: 'league' } } }
    render(<Portfolio {...inSeasonProps} liveSeasonTotals={live} />)
    expect(cell(starterRow(4), 'col-sofar').textContent).toContain('WR1 · —/g · 2 G')
    expect(cell(starterRow(3), 'col-sofar').textContent).toContain('WR2 · WR1/g · 3 G')
    const subLine = cell(starterRow(3), 'col-sofar').querySelector('[data-testid="rank-pair"]').parentElement
    expect(subLine.tagName).toBe('DIV')
    expect(subLine.classList.contains('whitespace-nowrap')).toBe(true)
  })

  it('P5b-3 a rookie with no last-season row and no live row reads — in both', () => {
    render(<Portfolio {...inSeasonProps} />)
    const row9 = starterRow(9)
    expect(cell(row9, 'col-last').textContent).toBe('—')
    expect(cell(row9, 'col-sofar').textContent).toBe('—')
  })

  it('P5b-4 in-season column counts match header to row, including the empty slot row', () => {
    const ktcRows = [
      { name: '2027 Early 1st', position: null, team: 'FA', value: 4000 },
      { name: '2027 Mid 1st', position: null, team: 'FA', value: 3690 },
      { name: '2027 Late 1st', position: null, team: 'FA', value: 3200 },
    ]
    render(
      <Portfolio
        {...inSeasonProps}
        tradedPicks={[]}
        ktcPickTable={parseKtcPickRows(ktcRows)}
        firstLiveDraftSeason={2027}
        draftRounds={1}
      />
    )
    const ten = screen.getByTestId('starting-ten')
    expect(ten.querySelectorAll('thead th').length).toBe(14)
    expect(starterRow(0).querySelectorAll('td').length).toBe(14)
    const bench = screen.getByTestId('bench')
    expect(bench.querySelectorAll('thead th').length).toBe(14)
    const rows = [...bench.querySelectorAll('tbody tr')]
    expect(rows[0].querySelectorAll('td').length).toBe(14)
    // Pick rows are counted in their own two-column block.
    const pick = screen.getByTestId('bench-picks').querySelector('tbody tr')
    expect(pick.dataset.testid).toBe('bench-pick-2027-1-1')
    expect(pick.querySelectorAll('td').length).toBe(2)
    expect(screen.getByTestId('bench-picks').querySelectorAll('thead th').length).toBe(2)
  })

  it('P5b-5 week 1 keeps today\'s layout', () => {
    render(<Portfolio {...inSeasonProps} nflState={{ ...REG_WK4, week: 1 }} />)
    expect(cell(starterRow(3), 'col-ppg')).not.toBeNull()
    expect(cell(starterRow(3), 'col-sofar')).toBeNull()
    expect(startHeader()).toContain('2025 → 2026 PPG')
  })

  it('P5b-6 unknown phase (no nflState) keeps today\'s layout, no lag note', () => {
    render(<Portfolio {...commonProps} />)
    expect(cell(starterRow(3), 'col-sofar')).toBeNull()
    expect(screen.queryByTestId('season-lag-note')).not.toBeInTheDocument()
  })

  it('P5b-7 live file missing: in-season headers, — cells, live-missing-note', () => {
    render(<Portfolio {...inSeasonProps} liveSeasonTotals={null} />)
    expect(startHeader()).toContain('2026 so far')
    for (let i = 0; i < 10; i++) expect(cell(starterRow(i), 'col-sofar').textContent).toBe('—')
    expect(cell(starterRow(3), 'col-ros').textContent).toBe('—')
    expect(cell(starterRow(3), 'col-delta').textContent).toBe('—')
    expect(screen.getByTestId('live-missing-note').textContent).toContain('No 2026 season data is loaded')
    expect(screen.queryByTestId('ros-missing-note')).not.toBeInTheDocument()
  })

  it('P5b-8 post-season lag: today\'s layout plus the season-lag note', () => {
    render(<Portfolio {...commonProps} nflState={{ season: '2026', season_type: 'post', week: 1 }} />)
    expect(cell(starterRow(3), 'col-ppg')).not.toBeNull()
    const note = screen.getByTestId('season-lag-note').textContent
    expect(note).toContain('The 2026 season is over')
    expect(note).toContain('compare 2025 with 2026')
  })

  it('P5b-9 a live file for another season is ignored', () => {
    render(<Portfolio {...inSeasonProps} liveSeasonTotals={{ ...LIVE, season: 2025 }} />)
    expect(screen.getByTestId('live-missing-note')).toBeInTheDocument()
    expect(cell(starterRow(3), 'col-sofar').textContent).toBe('—')
  })

  it('P5b-10 live file but no in-season records: ros-missing-note, so-far still shown', () => {
    render(<Portfolio {...inSeasonProps} seasonProjections={seasonProjections} />)
    expect(cell(starterRow(3), 'col-sofar').textContent).toContain('18.0')
    expect(cell(starterRow(3), 'col-ros').textContent).toBe('—')
    expect(screen.getByTestId('ros-missing-note')).toBeInTheDocument()
    expect(screen.queryByTestId('live-missing-note')).not.toBeInTheDocument()
  })

  it('S-L5 injury clause survives in-season; a live row without weeklyStatus has no count', () => {
    render(<Portfolio {...inSeasonProps} />)
    const tile = screen.getByTestId('tile-games-missed')
    expect(tile.textContent).toContain('GAMES MISSED · 2026')
    expect(tile.textContent).toContain('1 questionable now')
    expect(screen.getByTestId('tile-games-missed-value').textContent).toBe('—')
    expect(tile.textContent).not.toContain('of ')
  })

  // ── Brief M1 — live-season usage (myteam-m1-live-season.md §3.3, Fixture M) ────────────────
  const wkStats = (from, to, stat) => Object.fromEntries(Array.from({ length: to - from + 1 }, (_, i) => [from + i, stat]))
  const LIVE_U = { ...LIVE, players: {
    ...LIVE.players,
    w1: { ...LIVE.players.w1, team: 'DAL', weeklyStatus: W(3), stats: { rec_tgt: 9, off_snp: 120, tm_off_snp: 200 }, weeklyStats: wkStats(1, 3, { rec_tgt: 3 }) },
    w2: { ...LIVE.players.w2, team: 'DAL', weeklyStatus: W(3), stats: { rec_tgt: 21 }, weeklyStats: wkStats(1, 3, { rec_tgt: 7 }) },
    q1: { gamesPlayed: 3, fantasyPoints: 60, team: 'DAL', weeklyStatus: W(3), stats: { off_snp: 60, tm_off_snp: 60 }, weeklyStats: {} },
  } }
  const CS_U = { 2025: {
    ...careerStats[2025],
    w1: { ...careerStats[2025].w1, stats: { off_snp: 900, tm_off_snp: 1000, rec_tgt: 30 }, weeklyStats: wkStats(1, 15, { rec_tgt: 2 }) },
    w2: { ...careerStats[2025].w2, stats: { rec_tgt: 90 }, weeklyStats: { ...wkStats(1, 15, { rec_tgt: 4 }), ...wkStats(16, 17, { rec_tgt: 15 }) } },
  } }
  const uProps = { ...inSeasonProps, careerStats: CS_U, liveSeasonTotals: LIVE_U }
  const PRE_2026 = { season: '2026', season_type: 'pre' }

  it('T1 in season: the live season is the main usage value, the data season sits grey beneath (games-played share)', () => {
    render(<Portfolio {...uProps} />)
    const row3 = starterRow(3)
    const share = cell(row3, 'col-share').textContent
    expect(share).toContain('30%')
    expect(share).toContain('2025 33%') // games-played share; the season-total share would read 25%
    expect(share.startsWith('30%')).toBe(true)
    const snap = cell(row3, 'col-snap').textContent
    expect(snap.startsWith('60%')).toBe(true)
    expect(snap).toContain('2025 90%')
    const games = cell(row3, 'col-games').textContent
    expect(games).not.toContain('3/3') // the live count left with the old strip (M3 §2.2)
    expect(games).toContain('2025 15/17')
    expect(games).not.toContain('NaN')
  })

  it('T2 a quarterback has no snap share in season', () => {
    render(<Portfolio {...uProps} />)
    expect(cell(starterRow(0), 'col-snap').textContent).toBe('—')
    expect(cell(starterRow(0), 'col-share').textContent).toBe('—')
  })

  it('T3 usage headers name the live season in season and the data season out of it', () => {
    render(<Portfolio {...uProps} />)
    for (const h of [startHeader(), screen.getByTestId('bench').querySelector('thead').textContent]) {
      expect(h).toContain('2026 WEEKS')
      expect(h).not.toContain('GAMES 2026')
      expect(h).toContain('SHARE 2026')
      expect(h).toContain('SNAP 2026')
      expect(h).not.toContain('SHARE 2025')
    }
    cleanup()
    render(<Portfolio {...uProps} nflState={PRE_2026} />)
    for (const h of [startHeader(), screen.getByTestId('bench').querySelector('thead').textContent]) {
      expect(h).toContain('GAMES 2025')
      expect(h).not.toContain('GAMES 2026')
      expect(h).not.toContain('SHARE 2026')
    }
  })

  it('T4 the legend names the live season and the unsplit caption follows the loaded gamelogs', () => {
    render(<Portfolio {...uProps} />)
    const legend = screen.getByTestId('starting-ten-legend').textContent
    expect(legend).toContain(`with position rank by total points and, dimmer, by points per game (/g, among players with at least ${PPG_RANK_MIN_GAMES} games — fewer until someone at the position has played ${PPG_RANK_MIN_GAMES}); SO FAR adds games played.`)
    expect(legend).toContain('2026 WEEKS has one bar per completed week')
    expect(legend).toContain("are 2026's so far, with 2025 in grey beneath")
    expect(legend).toContain('in the games he played')
    expect(legend).toContain('not split for 2026, 2025')
    cleanup()
    render(<Portfolio {...uProps} gameLogsByYear={{ 2025: { complete: true, players: {} }, 2026: { complete: true, players: {} } }} />)
    expect(screen.getByTestId('starting-ten-legend').textContent).not.toContain('not split')
    cleanup()
    // live logs still pending: the caption follows what the shares were computed with, naming both seasons
    render(<Portfolio {...uProps} gameLogsByYear={{ 2025: { complete: true, players: {} } }} />)
    expect(screen.getByTestId('starting-ten-legend').textContent).toContain('not split for 2026, 2025')
  })

  it('T5 the live gamelogs are requested in season, once absent, and never off-season', () => {
    const spy = vi.fn()
    render(<Portfolio {...uProps} onNeedGameLogSeason={spy} />)
    expect(spy).toHaveBeenCalledWith(2026)
    cleanup()
    const off = vi.fn()
    render(<Portfolio {...uProps} nflState={PRE_2026} onNeedGameLogSeason={off} />)
    expect(off).not.toHaveBeenCalled()
    cleanup()
    const have = vi.fn()
    render(<Portfolio {...uProps} gameLogsByYear={{ 2026: { complete: false, players: {} } }} onNeedGameLogSeason={have} />)
    expect(have).not.toHaveBeenCalled()
  })

  it('T10 every bench player row carries the so-far line and its position rank', () => {
    const live = { ...LIVE_U, players: { ...LIVE_U.players, q3: { gamesPlayed: 3, fantasyPoints: 45, weeklyStatus: W(3) } } }
    render(<Portfolio {...uProps} liveSeasonTotals={live} />)
    const q3 = [...screen.getByTestId('bench').querySelectorAll('tbody tr')].find(r => r.textContent.includes('Player q3'))
    const sofar = cell(q3, 'col-sofar').textContent
    expect(sofar).toContain('15.0')
    expect(sofar).toContain('QB2') // q1's 60 total outranks q3's 45
  })

  it('T12 IR / Out players and my reserve list sink to the bottom of the Bench', () => {
    const benchNames = () => [...screen.getByTestId('bench').querySelectorAll('tbody [data-testid="col-player"]')].map(td => td.textContent)
    const order = names => names.map(n => n.match(/Player [a-z]\d/)[0])
    render(<Portfolio {...commonProps} playerMap={{ ...playerMap, q3: { ...playerMap.q3, injury_status: 'IR' } }} />)
    expect(order(benchNames())).toEqual(['Player r4', 'Player t2', 'Player q3'])
    cleanup()
    const withReserve = [{ ...rosterTeams[0], reserve: [{ id: 'r4', slot: 'IR', full_name: 'Player r4', position: 'RB' }] }, rosterTeams[1]]
    render(<Portfolio {...commonProps} rosterTeams={withReserve} />)
    expect(order(benchNames())).toEqual(['Player q3', 'Player t2', 'Player r4'])
  })

  it('T14 the ROS % lives in a popover: opening it never opens the player', () => {
    const onOpen = vi.fn()
    render(<Portfolio {...inSeasonProps} onOpenPlayerDetail={onOpen} />)
    const ros = cell(starterRow(3), 'col-ros')
    expect(ros.textContent).toBe('17.0')
    fireEvent.click(ros.querySelector('button'))
    expect(screen.getByText(/30% of this estimate comes from this season's games/)).toBeInTheDocument()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('T14k keyboard on the ROS popover trigger never opens the player; Escape closes the popover', () => {
    const onOpen = vi.fn()
    render(<Portfolio {...inSeasonProps} onOpenPlayerDetail={onOpen} />)
    const trigger = cell(starterRow(3), 'col-ros').querySelector('button')
    fireEvent.keyDown(trigger, { key: 'Enter' })
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(trigger)
    expect(screen.getByText(/30% of this estimate comes from this season's games/)).toBeInTheDocument()
    fireEvent.keyDown(trigger, { key: 'Escape' }) // bubbles through the wrapper to DefinitionPopover's document listener
    expect(screen.queryByText(/30% of this estimate comes from this season's games/)).not.toBeInTheDocument()
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('T15 out of season nothing live leaks into the layout', () => {
    const tc = { complete: true, teams: {} }
    render(
      <Portfolio
        {...uProps} nflState={PRE_2026} teamContextByYear={{ 2026: tc }}
        gameLogsByYear={{ 2026: { complete: true, players: {} } }}
      />
    )
    const row3 = starterRow(3)
    expect(cell(row3, 'col-share').textContent).toBe('33%') // games-played share, as in season's grey line (the season-total share is 25%)
    expect(cell(row3, 'col-snap').textContent).toBe('90%')
    expect(cell(row3, 'col-games').textContent).toContain('15/17')
    expect(cell(row3, 'col-games').textContent).not.toContain('3/3')
    expect(cell(row3, 'col-ppg')).not.toBeNull()
    expect(cell(row3, 'col-sofar')).toBeNull()
    const ladders = screen.getByTestId('league-ladders').textContent
    expect(ladders).toContain('2025 · SCORED')
    expect(ladders).toContain('2026 · PROJECTED')
    expect(screen.queryByTestId('weak-sofar')).not.toBeInTheDocument()
    expect(screen.getByTestId('starting-ten-legend').textContent).toContain(
      `POS RANK is last season's position rank among all players at the position in this league's scoring: by total points, then, dimmer, by points per game (/g, at least ${PPG_RANK_MIN_GAMES} games).` +
      " SHARE is the player's share of his team's targets (pass-catchers) or carries (backs) in the games he played, as on Market. SNAP is offensive snap share; not tracked for quarterbacks. Dashed week is a bye or a week with no game recorded. Mid-season team changes are not split for 2025."
    )
    const legend = screen.getByTestId('starting-ten-legend').textContent
    expect(legend).toContain('in the games he played, as on Market')
    expect(legend).not.toContain('8+ games')
  })

  it('F1-T2 out of season SHARE/SNAP equal the grey prior line in season shows for the same season', () => {
    const { unmount } = render(<Portfolio {...uProps} />)
    const inSeasonSub = cell(starterRow(3), 'col-share').textContent // "30%2025 33%"
    expect(inSeasonSub).toContain('2025 33%')
    const priorShare = inSeasonSub.slice(inSeasonSub.indexOf('2025 ') + 5)
    const inSeasonSnap = cell(starterRow(3), 'col-snap').textContent
    const priorSnap = inSeasonSnap.slice(inSeasonSnap.indexOf('2025 ') + 5)
    unmount()
    render(<Portfolio {...uProps} liveSeasonTotals={null} nflState={PRE_2026} teamContextByYear={{ 2026: { complete: true, teams: {} } }} gameLogsByYear={{ 2026: { complete: true, players: {} } }} />)
    expect(cell(starterRow(3), 'col-share').textContent).toBe(priorShare)
    expect(cell(starterRow(3), 'col-snap').textContent).toBe(priorSnap)
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
      'Your starting ten scored 49.0 points a week last season, 2nd of 4. Our projection: 56.0 for 2026, 3rd. ' +
      'Last season by position: QB 2nd, RB 3rd, WR 2nd, TE 3rd.'
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

  it('13. no verdict clause, even where one position is clearly weakest', () => {
    const { playerMap, playerRows, seasonProjections, careerStats, rosterTeams } = buildFixtureS(17)
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
      />
    )
    const text = screen.getByTestId('summary-sentence').textContent
    expect(text).toMatch(/Our projection: 59\.0 for 2026, 2nd\. Last season by position: (QB|RB|WR|TE) \d+(st|nd|rd|th)(, (QB|RB|WR|TE) \d+(st|nd|rd|th))*\.$/)
    for (const phrase of ['carr', 'weak spot', 'keep it out']) expect(text).not.toContain(phrase)
  })

  it('F2-T3 no last-season line: the sentence is the labelled projection alone, with no by-position line', () => {
    const { playerMap, playerRows, seasonProjections, rosterTeams } = buildFixtureS()
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" careerStats={{ 2025: {} }} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
      />
    )
    const text = screen.getByTestId('summary-sentence').textContent
    expect(text).toMatch(/^Our projection for your starting ten is \d+\.\d for 2026, \d+(st|nd|rd|th) of 4\.$/)
    expect(text).not.toContain('Last season by position')
  })

  it('14. header meta leads with the fantasy team name, never a Sleeper username', () => {
    const { playerMap, playerRows, seasonProjections, careerStats, rosterTeams } = buildFixtureS()
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
        leagueName="Dynasty 040" scoringSettings={{ rec: 0.5 }} username="Colts_420_Reloaded"
      />
    )
    expect(screen.getByText('My Team · Dynasty 040 · 4-team 1QB · half-PPR')).toBeInTheDocument()
    expect(screen.queryByText(/Colts_420_Reloaded/)).not.toBeInTheDocument()
    cleanup()

    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
        leagueName="Dynasty 040" scoringSettings={{ rec: 0.5 }}
      />
    )
    expect(screen.getByText('My Team · Dynasty 040 · 4-team 1QB · half-PPR')).toBeInTheDocument()
  })

  // ── L1 — header tiles follow the season phase (my-team-in-season-tiles.md) ─────────────────
  const WK = st => [...st, ...Array(18 - st.length).fill('X')]
  const LIVE_PPG = {
    1: { QB: 24, RB: 12, WR: 16, TE: 8 },
    2: { QB: 21, RB: 14, WR: 15, TE: 9 },
    3: { QB: 15, RB: 10, WR: 9, TE: 5 },
    4: { QB: 14, RB: 8, WR: 10, TE: 12 },
  }
  const livePlayers = {}
  for (const [rosterId, byPos] of Object.entries(LIVE_PPG)) {
    for (const [pos, ppg] of Object.entries(byPos)) {
      livePlayers[`${rosterId}-${pos}`] = { gamesPlayed: 3, fantasyPoints: ppg * 3, weeklyStatus: WK(['P', 'P', 'P']) }
    }
  }
  livePlayers['1-RB'] = { gamesPlayed: 2, fantasyPoints: 24, weeklyStatus: WK(['P', 'P', 'D']) } // 12.0
  livePlayers['1-TE'] = { gamesPlayed: 1, fantasyPoints: 8, weeklyStatus: WK(['P', 'D', 'D']) }  // 8.0
  const REG_WK4 = { week: 4, season: '2026', season_type: 'regular', season_start_date: '2026-09-09' }
  const LIVE_S = { season: 2026, complete: true, players: livePlayers }

  function renderS(extra) {
    const { playerMap, playerRows, seasonProjections, careerStats, rosterTeams } = buildFixtureS()
    const scoredS = { ...seasonProjections,
      '1-QB': { projectedPPG: 25, inSeason: { n: 3, ros: { prior: 24, weight: 0.3, value: 25 } } } }
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={scoredS}
        myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} rosterPositions={ROSTER_POSITIONS}
        nflState={REG_WK4} liveSeasonTotals={LIVE_S}
        {...(extra?.(seasonProjections) ?? {})}
      />
    )
  }

  it('S-L1 in-season tiles: so-far lineup, ROS, live games missed', () => {
    renderS()
    const last = screen.getByTestId('tile-lineup-last')
    expect(last.textContent).toContain('LINEUP PPG · 2026 SO FAR')
    expect(screen.getByTestId('tile-lineup-last-value').textContent).toBe('60.0')
    expect(last.textContent).toContain('1st')
    expect(last.textContent).toContain('league median 51.5')
    expect(last.textContent).not.toContain('49.0')

    const proj = screen.getByTestId('tile-lineup-proj')
    expect(proj.textContent).toContain('ROS · 2026')
    expect(screen.getByTestId('tile-lineup-proj-value').textContent).toBe('56.0')
    expect(proj.textContent).toContain('3rd')
    expect(proj.textContent).toContain('league median 56.5 · −4.0 on 2026 so far')
    expect(proj.textContent).not.toContain('on last year')
    expect(proj.textContent).not.toContain('PROJECTED')

    const games = screen.getByTestId('tile-games-missed')
    expect(games.textContent).toContain('GAMES MISSED · 2026')
    expect(screen.getByTestId('tile-games-missed-value').textContent).toBe('3')
    expect(games.textContent).toContain('of 12')
  })

  it('FP1-1/FP1-2 a served X week is not a miss — the store classifies absences (CR-28)', () => {
    const rows = JSON.parse(JSON.stringify(livePlayers))
    for (const r of Object.values(rows)) r.team = 'DAL'
    rows['1-WR'] = { team: 'DAL', gamesPlayed: 2, fantasyPoints: 32, weeklyStatus: WK(['P', 'X', 'P']) }
    rows['1-TE'] = { team: 'NYJ', gamesPlayed: 1, fantasyPoints: 8, weeklyStatus: WK(['P', 'X', 'D']) }
    renderS(() => ({ liveSeasonTotals: { ...LIVE_S, players: rows } }))
    const tile = screen.getByTestId('tile-games-missed')
    expect(screen.getByTestId('tile-games-missed-value').textContent).toBe('2')
    expect(tile.textContent).toContain('of 10')
    expect(tile.textContent).not.toMatch(/of 2\d/)
  })

  it('FP1-3 ROS tile shows a + delta against the so-far total', () => {
    const rows = { ...livePlayers, '1-QB': { gamesPlayed: 3, fantasyPoints: 30, weeklyStatus: WK(['P', 'P', 'P']) } }
    renderS(() => ({ liveSeasonTotals: { ...LIVE_S, players: rows } }))
    expect(screen.getByTestId('tile-lineup-proj').textContent).toContain('league median 56.5 · +10.0 on 2026 so far')
  })

  it('FP1-4 live file present but my so-far total null: tile 1 reads — without the missing-file note', () => {
    const rows = { ...livePlayers }
    for (const k of ['1-QB', '1-RB', '1-WR', '1-TE']) rows[k] = { ...livePlayers[k], gamesPlayed: 0, fantasyPoints: 0 }
    renderS(() => ({ liveSeasonTotals: { ...LIVE_S, players: rows } }))
    const last = screen.getByTestId('tile-lineup-last')
    expect(screen.getByTestId('tile-lineup-last-value').textContent).toBe('—')
    expect(last.textContent).toContain('LINEUP PPG · 2026 SO FAR')
    expect(last.textContent).not.toContain('season data loaded')
  })

  it('S-L2 ROS not computed: tile 2 falls back to PROJECTED', () => {
    renderS(plain => ({ seasonProjections: plain }))
    const proj = screen.getByTestId('tile-lineup-proj')
    expect(proj.textContent).toContain('PROJECTED · 2026')
    expect(proj.textContent).toContain('league median 56.5 · +7.0 on last year')
    expect(proj.textContent).not.toContain('ROS ·')
    expect(screen.getByTestId('tile-lineup-last-value').textContent).toBe('60.0')
    expect(screen.getByTestId('ros-missing-note')).toBeInTheDocument()
  })

  it('S-L3 live file missing: tiles 1 and 3 read —, tile 2 falls back', () => {
    renderS(() => ({ liveSeasonTotals: null }))
    const last = screen.getByTestId('tile-lineup-last')
    expect(last.textContent).toContain('LINEUP PPG · 2026 SO FAR')
    expect(screen.getByTestId('tile-lineup-last-value').textContent).toBe('—')
    expect(last.textContent).toContain('no 2026 season data loaded')
    expect(screen.getByTestId('tile-lineup-proj').textContent).toContain('PROJECTED · 2026')
    const games = screen.getByTestId('tile-games-missed')
    expect(games.textContent).toContain('GAMES MISSED · 2026')
    expect(screen.getByTestId('tile-games-missed-value').textContent).toBe('—')
    expect(games.textContent).not.toContain('of ')
  })

  it('S-L4 week 1 keeps today\'s tiles', () => {
    renderS(() => ({ nflState: { ...REG_WK4, week: 1 } }))
    const last = screen.getByTestId('tile-lineup-last')
    expect(last.textContent).toContain('LINEUP PPG · 2025')
    expect(last.textContent).toContain('49.0')
    expect(last.textContent).toContain('2nd')
    expect(last.textContent).toContain('league median 46.0')
    const proj = screen.getByTestId('tile-lineup-proj')
    expect(proj.textContent).toContain('PROJECTED · 2026')
    expect(proj.textContent).toContain('league median 56.5 · +7.0 on last year')
    expect(screen.getByTestId('tile-games-missed').textContent).toContain('GAMES MISSED · 2025')
  })

  it('T8 in season the sentence is factual: so far, ROS, a per-position line, no verdict', () => {
    renderS()
    const text = screen.getByTestId('summary-sentence').textContent
    expect(text).toBe(
      'Your starting ten is scoring 60.0 points a week in 2026 so far, 1st of 4. Rest-of-season projection 56.0, 3rd. ' +
      'So far by position: QB 1st, RB 2nd, WR 1st, TE 3rd.'
    )
    for (const banned of ['carr', 'weak spot', 'keep it out', 'last season']) expect(text).not.toContain(banned)
  })

  it('T9 without the live file the sentence never falls back to last season', () => {
    renderS(() => ({ liveSeasonTotals: null }))
    const text = screen.getByTestId('summary-sentence').textContent
    expect(text).toBe("Your starting ten's season projection is 56.0 for 2026, 3rd of 4.")
    expect(text).not.toContain('last season')
    expect(text).not.toContain('So far by position')
  })

  it('T17 the ladders read the live ranks in season', () => {
    renderS()
    const row = screen.getByTestId('ladder-row-RB')
    expect(row.querySelector('[data-testid="ladder-last"] [data-testid="ladder-rank"]').textContent).toBe('2nd')
    expect(row.querySelector('[data-testid="ladder-proj"] [data-testid="ladder-rank"]').textContent).toBe('4th')
    expect(row.querySelector('[data-testid="ladder-move"]').textContent).toBe('down 2')
  })

  it('T21 the weakest slots carry the live comparison in season', () => {
    renderS()
    const sofar = screen.getByTestId('weak-row-1').querySelector('[data-testid="weak-sofar"]').textContent
    expect(sofar).toContain('+2.0')
    expect(sofar).toContain('12.0 vs med 10.0')
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
        tradedPicks={tradedPicks} ktcPickTable={ktcPickTable}
        firstLiveDraftSeason={firstLiveDraftSeason} draftRounds={draftRounds}
      />
    )

    // Priced picks live in their own block; they never count toward the Bench collapse.
    expect(screen.getByTestId('bench-picks')).toBeInTheDocument()
    const bench = screen.getByTestId('bench')
    expect(bench.querySelectorAll('tbody tr').length).toBe(10)
    const toggle = screen.getByTestId('bench-toggle')
    expect(toggle.textContent).toBe('show all 11 →')
    fireEvent.click(toggle)
    expect(bench.querySelectorAll('tbody tr').length).toBe(11)
    expect(toggle.textContent).toBe('show fewer')
  })
})

// ---------------------------------------------------------------------------
// F1-5 (fix pass 1) — an unfillable slot
// ---------------------------------------------------------------------------
describe('F1-5 (unfillable slot)', () => {
  it('F1-5. an unfillable slot renders an empty row, not a fabricated one', () => {
    const rosterPositions = ['QB', 'TE', 'BN']
    const myQb = baseRow({ player_id: 'myqb', position: 'QB', full_name: 'My QB', ownerTeamName: 'My Team', projectedPPG: 20 })
    const otherQb = baseRow({ player_id: 'oqb', position: 'QB', full_name: 'Other QB', ownerTeamName: 'Other Team', projectedPPG: 10 })

    const playerRows = [myQb, otherQb]
    const seasonProjections = Object.fromEntries(playerRows.map(r => [r.player_id, { projectedPPG: r.projectedPPG }]))
    const rosterTeams = [
      { rosterId: 1, teamName: 'My Team', starters: [], bench: [{ id: 'myqb', slot: 'Bench', full_name: 'My QB', position: 'QB' }], reserve: [] },
      { rosterId: 2, teamName: 'Other Team', starters: [], bench: [{ id: 'oqb', slot: 'Bench', full_name: 'Other QB', position: 'QB' }], reserve: [] },
    ]

    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" rosterPositions={rosterPositions}
      />
    )

    const emptySlot = screen.getByTestId('starter-1')
    expect(emptySlot).toBeInTheDocument()
    expect(emptySlot.querySelector('[data-testid="col-player"]').textContent).toBe('empty')
    for (const key of ['col-ppg', 'col-delta', 'col-posrank', 'col-games', 'col-ktc']) {
      expect(emptySlot.querySelector(`[data-testid="${key}"]`).textContent).toBe('—')
    }

    const starterZero = screen.getByTestId('starting-ten').querySelectorAll('tbody tr')[0]
    expect(starterZero.textContent).toContain('My QB')
  })

  it('F1-5 (P5b). the in-season empty slot has 14 cells, each in-season cell —', () => {
    const rosterPositions = ['QB', 'TE', 'BN']
    const myQb = baseRow({ player_id: 'myqb', position: 'QB', full_name: 'My QB', ownerTeamName: 'My Team', projectedPPG: 20 })
    const otherQb = baseRow({ player_id: 'oqb', position: 'QB', full_name: 'Other QB', ownerTeamName: 'Other Team', projectedPPG: 10 })
    const playerRows = [myQb, otherQb]
    const seasonProjections = Object.fromEntries(playerRows.map(r => [r.player_id, { projectedPPG: r.projectedPPG }]))
    const rosterTeams = [
      { rosterId: 1, teamName: 'My Team', starters: [], bench: [{ id: 'myqb', slot: 'Bench', full_name: 'My QB', position: 'QB' }], reserve: [] },
      { rosterId: 2, teamName: 'Other Team', starters: [], bench: [{ id: 'oqb', slot: 'Bench', full_name: 'Other QB', position: 'QB' }], reserve: [] },
    ]
    const REG_WK4 = { week: 4, season: '2026', season_type: 'regular', season_start_date: '2026-09-09' }
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" rosterPositions={rosterPositions} nflState={REG_WK4}
      />
    )
    const emptySlot = screen.getByTestId('starter-1')
    expect(emptySlot.querySelectorAll('td').length).toBe(14)
    for (const key of ['col-last', 'col-sofar', 'col-ros', 'col-delta']) {
      expect(emptySlot.querySelector(`[data-testid="${key}"]`).textContent).toBe('—')
    }
    expect(screen.getByTestId('starting-ten').querySelector('thead').textContent).not.toContain('null')
    expect(screen.getByTestId('bench').querySelector('thead').textContent).not.toContain('null')
  })
})

// ---------------------------------------------------------------------------
// Slice D — team offences block + GAME SCRIPT column (both call sites)
// ---------------------------------------------------------------------------
describe('Slice D — team offences and GAME SCRIPT', () => {
  const ids = ['rb1', 'wl1', 'wb1', 'wz1', 'wf1']
  const spec = {
    rb1: { position: 'RB', team: 'DET', proj: 14, name: 'Rex Back' },      // starter, DET (leads · run-heavy)
    wl1: { position: 'WR', team: 'LAR', proj: 15, name: 'Wes Rams' },      // starter, Sleeper-domain LAR → LA
    wb1: { position: 'WR', team: 'DET', proj: 5, name: 'Ben Bench' },      // bench, DET
    wz1: { position: 'WR', team: 'ZZZ', proj: 4, name: 'Zed Nometrics' },  // bench, team with no teamcontext row
    wf1: { position: 'WR', team: 'FA', proj: 3, name: 'Free Agent' },      // bench, literal 'FA'
  }
  const playerRows = ids.map(id => baseRow({
    player_id: id, position: spec[id].position, full_name: spec[id].name, nfl_team: spec[id].team,
    ownerTeamName: 'My Team', projectedPPG: spec[id].proj,
  }))
  const rosterTeams = [{
    rosterId: 1, teamName: 'My Team', starters: [], reserve: [],
    bench: ids.map(id => ({ id, slot: 'Bench', full_name: spec[id].name, position: spec[id].position, team: spec[id].team, age: 25 })),
  }]
  const seasonProjections = Object.fromEntries(ids.map(id => [id, { projectedPPG: spec[id].proj }]))
  const playerMap = {
    ...Object.fromEntries(ids.map(id => [id, { position: spec[id].position, full_name: spec[id].name }])),
    qbDet: { position: 'QB', full_name: 'Jared Goff' },
  }
  // Era-keyed league-scored points allowed (App.jsx's `defenceAllowed`): DET 20/g, LA 25/g, CHI 15/g
  // at every position, 17 games.
  const allowedTeam = (fpa) => ({ gp: 17, pts: { qb: fpa * 17, rb: fpa * 17, wr: fpa * 17, te: fpa * 17 }, passYd: 0, rushYd: 0 })
  const careerStats = { 2025: {} }
  const defenceAllowed = { prior: { season: 2025, weeks: [], failedWeeks: [], teams: { DET: allowedTeam(20), LA: allowedTeam(25), CHI: allowedTeam(15) } }, current: null }

  // Two REG games per team. DET: +10 margin, run-heavy. LA: −10 margin, pass-heavy. CHI: filler.
  const tcGame = (scored, allowed, passPlays) => ({
    week: 1, seasonType: 'REG', opponent: 'X',
    off: { plays: 60, passPlays, proePlays: 60, proeXpassSum: 30, pointsScored: scored, rzTrips: 3, epaSum: 6, epaPlays: 60, neutralSeconds: 700, neutralGaps: 20 },
    def: { epaSum: -3, epaPlays: 60, pointsAllowed: allowed },
  })
  const teamContextByYear = {
    2025: {
      complete: true,
      teams: {
        DET: { games: [tcGame(30, 20, 20), tcGame(30, 20, 20)] },
        LA: { games: [tcGame(14, 24, 40), tcGame(14, 24, 40)] },
        CHI: { games: [tcGame(20, 20, 30), tcGame(20, 20, 30)] },
      },
    },
  }
  const gameLogsByYear = {
    2025: { complete: true, players: { qbDet: { games: [{ seasonType: 'REG', team: 'DET', attempts: 300, passingEpa: 60 }] } } },
  }
  const g = (home, away) => ({ gameType: 'REG', homeTeam: home, awayTeam: away, homeScore: null, awayScore: null, result: null })
  const nflScheduleByYear = { 2026: { complete: true, games: [g('DET', 'LA'), g('CHI', 'DET'), g('LA', 'CHI')] } }

  const base = {
    playerRows, rosterTeams, seasonProjections, myTeamName: 'My Team',
    careerStats, playerMap, rosterPositions: ['RB', 'WR', 'BN'],
  }
  const withData = { ...base, teamContextByYear, gameLogsByYear, nflScheduleByYear, defenceAllowed }

  const scriptCells = testId => [...screen.getByTestId(testId).querySelectorAll('tbody [data-testid="col-script"]')]
  const scriptOf = (testId, name) => {
    const tr = [...screen.getByTestId(testId).querySelectorAll('tbody tr')].find(r => r.textContent.includes(name))
    return tr.querySelector('[data-testid="col-script"]')
  }

  it('with the four new props supplied, the block renders and a known team row is present', () => {
    render(<Portfolio {...withData} />)
    expect(screen.getByTestId('team-offences')).toBeInTheDocument()
    const det = screen.getByTestId('offence-DET')
    expect(det.textContent).toContain('Detroit Lions')
    expect(det.querySelector('[data-testid="offence-pts"]').textContent).toBe('30.0')
    expect(det.querySelector('[data-testid="offence-margin"]').textContent).toBe('+10.0')
    expect(det.querySelector('[data-testid="offence-qb"]').textContent).toContain('Jared Goff')
    expect(det.querySelector('[data-testid="offence-qb"]').textContent).toContain('+0.200')
    expect(det.querySelector('[data-testid="offence-sos"]').textContent).toMatch(/RB \d+(st|nd|rd|th).*WR \d+(st|nd|rd|th)/)
    expect(screen.getByTestId('team-offences').textContent).toContain('teamContext · 3 TEAMS')
    // FA and the no-metrics team never bucket into a fabricated row for FA.
    expect(screen.queryByTestId('offence-FA')).not.toBeInTheDocument()
  })

  it('the LA offence row carries the Sleeper LAR logo through the era bucket (CR-16 Rams)', () => {
    render(<Portfolio {...withData} />)
    const logo = screen.getByTestId('offence-LA').querySelector('[data-testid="team-logo"]')
    expect(logo.getAttribute('src')).toMatch(/\/lar\.png$/)
    expect(logo.getAttribute('src')).not.toMatch(/\/la\.png$/)
  })

  it('with all four props omitted the block is absent and the rest of the screen still renders', () => {
    render(<Portfolio {...base} />)
    expect(screen.queryByTestId('team-offences')).not.toBeInTheDocument()
    expect(screen.getByTestId('starting-ten')).toBeInTheDocument()
    expect(screen.getByTestId('bench')).toBeInTheDocument()
    expect(screen.getByTestId('league-ladders')).toBeInTheDocument()
    for (const c of scriptCells('starting-ten')) expect(c.textContent).toBe('—')
  })

  it('an incomplete teamContext season is treated as absent (gated on complete, not key presence)', () => {
    render(<Portfolio {...withData} teamContextByYear={{ 2025: { ...teamContextByYear[2025], complete: false } }} />)
    expect(screen.queryByTestId('team-offences')).not.toBeInTheDocument()
  })

  it('GAME SCRIPT: a real, position-coloured descriptor in the Starting ten AND the Bench, — where there is none', () => {
    render(<Portfolio {...withData} />)
    // Starting ten (call site 1)
    const rb = scriptOf('starting-ten', 'Rex Back')
    expect(rb.textContent).toBe('leads · run-heavy')
    expect(rb.querySelector('span').className).toContain('text-dp-up-text') // backs want leading + run-heavy
    const wr = scriptOf('starting-ten', 'Wes Rams')
    expect(wr.textContent).toBe('trails · pass-heavy') // LAR row landed on the LA teamcontext key (CR-16)
    expect(wr.querySelector('span').className).toContain('text-dp-up-text')
    // Bench (call site 2)
    const benchWr = scriptOf('bench', 'Ben Bench')
    expect(benchWr.textContent).toBe('leads · run-heavy')
    expect(benchWr.querySelector('span').className).toContain('text-dp-down-text') // a WR on a run-heavy lead
    expect(scriptOf('bench', 'Zed Nometrics').textContent).toBe('—')
    expect(scriptOf('bench', 'Free Agent').textContent).toBe('—')
  })

  it('a draft-pick row sits in bench-picks and has no GAME SCRIPT cell', () => {
    const tradedPicks = []
    const ktcPickTable = parseKtcPickRows([{ name: '2027 Mid 1st', position: null, team: 'FA', value: 3690 }])
    render(<Portfolio {...withData} tradedPicks={tradedPicks} ktcPickTable={ktcPickTable} firstLiveDraftSeason={2027} draftRounds={1} />)
    expect(screen.getByTestId('bench').querySelector('[data-testid^="bench-pick-"]')).toBeNull()
    const pickRow = screen.getByTestId('bench-picks').querySelector('[data-testid^="bench-pick-"]')
    expect(pickRow).not.toBeNull()
    expect(pickRow.querySelector('[data-testid="col-script"]')).toBeNull()
  })

  // ── Brief M1 — offences on the live season ───────────────────────────────────────────────
  const REG_WK4_D = { week: 4, season: '2026', season_type: 'regular', season_start_date: '2026-09-09' }
  const tc2026 = (complete = true) => ({
    complete,
    teams: {
      DET: { games: [tcGame(24, 20, 20), tcGame(24, 20, 20)] },
      LA: { games: [tcGame(14, 24, 40), tcGame(14, 24, 40)] },
      CHI: { games: [tcGame(20, 20, 30), tcGame(20, 20, 30)] },
    },
  })
  const logs2026 = {
    2025: gameLogsByYear[2025],
    2026: { complete: true, players: { qbNew: { games: [{ seasonType: 'REG', team: 'DET', attempts: 200, passingEpa: 20 }] } } },
  }
  const mapNew = { ...playerMap, qbNew: { position: 'QB', full_name: 'Hendon Hooker' } }

  it('T6 in season the offences read the live season\'s team context and quarterbacks', () => {
    render(<Portfolio {...withData} nflState={REG_WK4_D} playerMap={mapNew} teamContextByYear={{ ...teamContextByYear, 2026: tc2026() }} gameLogsByYear={logs2026} />)
    const det = screen.getByTestId('offence-DET')
    expect(det.querySelector('[data-testid="offence-pts"]').textContent).toBe('24.0')
    expect(det.querySelector('[data-testid="offence-qb"]').textContent).toContain('Hendon Hooker')
    expect(det.querySelector('[data-testid="offence-qb"]').textContent).toContain('+0.100')
    const card = screen.getByTestId('team-offences').textContent
    expect(card).toContain('2026 season so far')
    expect(card).toContain('QB 2026')
    expect(screen.queryByTestId('offences-fallback-note')).not.toBeInTheDocument()
  })

  it('T7 an incomplete live file falls back to the data season with a caption; off-season never reads it', () => {
    render(<Portfolio {...withData} nflState={REG_WK4_D} teamContextByYear={{ ...teamContextByYear, 2026: tc2026(false) }} />)
    expect(screen.getByTestId('offence-DET').querySelector('[data-testid="offence-pts"]').textContent).toBe('30.0')
    expect(screen.getByTestId('offences-fallback-note').textContent)
      .toBe('No 2026 team data loaded yet — this table shows 2025, the last full season.')
    cleanup()
    render(<Portfolio {...withData} nflState={{ season: '2026', season_type: 'pre' }} teamContextByYear={{ ...teamContextByYear, 2026: tc2026() }} />)
    expect(screen.getByTestId('offence-DET').querySelector('[data-testid="offence-pts"]').textContent).toBe('30.0')
    expect(screen.queryByTestId('offences-fallback-note')).not.toBeInTheDocument()
    expect(screen.getByTestId('team-offences').textContent).toContain('2025 season, regular season only')
  })

  // ── Brief M2a — offences merge: WEEK MARGIN and PACE ─────────────────────────────────────
  const tcWeek = (week, scored, allowed, passPlays, neutralSeconds = 700) => ({
    ...tcGame(scored, allowed, passPlays), week,
    off: { ...tcGame(scored, allowed, passPlays).off, neutralSeconds },
  })
  const tc2026W = (complete = true) => ({
    complete,
    teams: {
      DET: { games: [tcWeek(1, 24, 20, 20, 600), tcWeek(3, 30, 10, 20, 600)] }, // bye week 2; pace 30 ≠ 2025's 35
      LA: { games: [tcWeek(1, 14, 24, 40, 800), tcWeek(2, 14, 24, 40, 800)] },
      CHI: { games: [tcWeek(2, 20, 20, 30, 760), tcWeek(3, 20, 20, 30, 760)] },
    },
  })
  const cell = (team, id) => screen.getByTestId(`offence-${team}`).querySelector(`[data-testid="${id}"]`)
  const headTexts = () => [...screen.getByTestId('team-offences').querySelectorAll('thead th')].map(th => th.textContent)

  it('M2a T1 every metric of both old tables renders on My Team in season, in the D2 column order', () => {
    render(<Portfolio {...withData} nflState={REG_WK4_D} playerMap={mapNew} teamContextByYear={{ ...teamContextByYear, 2026: tc2026W() }} gameLogsByYear={logs2026} />)
    const det = screen.getByTestId('offence-DET')
    expect(cell('DET', 'offence-pts').textContent).toBe('27.0')
    expect(cell('DET', 'offence-pts').querySelector('[data-testid="pts-bar"]')).not.toBeNull()
    expect(cell('DET', 'offence-allowed').textContent).toBe('15.0')
    expect(cell('DET', 'offence-margin').textContent).toBe('+12.0')
    expect(cell('DET', 'offence-week-margin').textContent).toBe('WK 3+20.0')
    expect(cell('DET', 'offence-epa').textContent).toBe('+0.100')
    expect(cell('DET', 'offence-proe').textContent).toBe('−16.7%')
    expect(cell('DET', 'offence-pace').textContent).toBe('30.0')
    expect(cell('DET', 'offence-plays').textContent).toBe('60.0')
    expect(cell('DET', 'offence-rz').textContent).toBe('3.00')
    expect(cell('DET', 'offence-def').textContent).toBe('−0.050')
    expect(cell('DET', 'offence-qb').textContent).toContain('Hendon Hooker')
    expect(cell('DET', 'offence-qb').textContent).toContain('+0.100')
    expect(cell('DET', 'offence-sos').textContent).toMatch(/RB \d+(st|nd|rd|th).*WR \d+(st|nd|rd|th)/)
    expect(cell('DET', 'offence-players').querySelector('[data-testid="chip-starter"]').textContent).toBe('Back')
    expect(cell('DET', 'offence-players').querySelector('[data-testid="chip-bench"]').textContent).toBe('Bench')
    expect(det.querySelector('td').textContent).toContain('DET')
    expect(det.querySelector('td [data-testid="team-logo"]')).not.toBeNull()
    expect(headTexts()).toEqual(['TEAM', 'YOUR PLAYERS', 'PTS/G', 'PTS ALLOWED', 'MARGIN', 'WEEK MARGIN',
      'OFF EPA/PL', 'PROE', 'PACE', 'PLAYS/G', 'RZ TRIPS/G', 'DEF EPA ALL', 'QB 2026 · EPA/ATT', 'SOS 2026'])
    expect(cell('LA', 'offence-week-margin').textContent).toBe('WK 2−10.0')
    // T5(b) — DET is the fastest of three (rank 1): blue
    expect(cell('DET', 'offence-pace').querySelector('span').className).toContain('text-dp-up-text')
  })

  it('M2a T3 out of season the table keeps its 13 columns (PACE, no WEEK MARGIN) and the live file never leaks', () => {
    render(<Portfolio {...withData} nflState={{ season: '2026', season_type: 'pre' }} teamContextByYear={{ ...teamContextByYear, 2026: tc2026W() }} />)
    expect(headTexts()).toEqual(['TEAM', 'YOUR PLAYERS', 'PTS/G', 'PTS ALLOWED', 'MARGIN', 'OFF EPA/PL',
      'PROE', 'PACE', 'PLAYS/G', 'RZ TRIPS/G', 'DEF EPA ALL', 'QB 2025 · EPA/ATT', 'SOS 2026'])
    const card = screen.getByTestId('team-offences')
    expect(cell('DET', 'offence-pace').textContent).toBe('35.0') // 2025's value, not the live file's 30.0
    expect(cell('DET', 'offence-pace').textContent).not.toBe('30.0')
    expect(cell('DET', 'offence-pace').querySelector('span').className).toContain('text-dp-up-text')
    expect(card.querySelector('[data-testid="offence-week-margin"]')).toBeNull()
    expect(cell('DET', 'offence-pts').textContent).toBe('30.0')
    const footer = [...card.querySelectorAll('span.text-dp-muted')].find(sp => sp.textContent.includes('PTS/G against PTS ALLOWED'))
    expect(footer.textContent).toContain('PACE is seconds per neutral play')
    expect(footer.textContent).not.toContain('WEEK MARGIN')
  })

  it('M2a T4 in-season fallback keeps the caption and last season\'s PACE, with no week margin', () => {
    render(<Portfolio {...withData} nflState={REG_WK4_D} teamContextByYear={{ ...teamContextByYear, 2026: tc2026W(false) }} />)
    expect(screen.getByTestId('offences-fallback-note').textContent)
      .toBe('No 2026 team data loaded yet — this table shows 2025, the last full season.')
    expect(cell('DET', 'offence-pts').textContent).toBe('30.0')
    expect(cell('DET', 'offence-pace').textContent).toBe('35.0')
    expect(cell('DET', 'offence-week-margin').textContent).toBe('—')
    expect(headTexts()).toContain('WEEK MARGIN')
  })

  it('M2a T7 PROE is aggregated from components across weeks, never the mean or sum of stored rates', () => {
    const game = (week, plays, passPlays, xSum, proePlays) => {
      const base = tcWeek(week, 24, 20, passPlays)
      return { ...base, off: { ...base.off, plays, passPlays, proeXpassSum: xSum, proePlays, proe: passPlays / plays - xSum / proePlays } }
    }
    const tc = { complete: true, teams: { DET: { games: [game(1, 70, 40, 33, 60), game(2, 50, 20, 15, 40)] } } }
    render(<Portfolio {...withData} nflState={REG_WK4_D} teamContextByYear={{ ...teamContextByYear, 2026: tc }} />)
    expect(cell('DET', 'offence-proe').textContent).toBe('+2.0%')
  })

  it('the stale "Not built yet" gloss is gone from the GAME SCRIPT header', () => {
    render(<Portfolio {...withData} />)
    const head = screen.getByTestId('starting-ten').querySelector('thead')
    fireEvent.click(head.querySelector('button')) // GAME SCRIPT is the only popover trigger in this header
    expect(screen.getByRole('dialog').textContent).toContain('scoring margin')
    expect(screen.getByRole('dialog').textContent).not.toContain('Not built yet')
  })
})

// ---------------------------------------------------------------------------
// lineup-pool-startable.md — reserve (IR) and taxi are pooled out of the best lineup
// ---------------------------------------------------------------------------
describe('lineup pool excludes reserve and taxi', () => {
  it('starts the bench player, not IR or taxi, and lists IR/taxi on the Bench', () => {
    const rosterPositions = ['RB']
    const okPlayer = { player_id: 'rb-ok', position: 'RB', full_name: 'RB Okay', ownerTeamName: 'My Team', projectedPPG: 10 }
    const irPlayer = { player_id: 'rb-ir', position: 'RB', full_name: 'RB On IR', ownerTeamName: 'My Team', projectedPPG: 20 }
    const taxiPlayer = { player_id: 'rb-tx', position: 'RB', full_name: 'RB On Taxi', ownerTeamName: 'My Team', projectedPPG: 30 }

    const playerRows = [okPlayer, irPlayer, taxiPlayer]
    const seasonProjections = Object.fromEntries(playerRows.map(r => [r.player_id, { projectedPPG: r.projectedPPG }]))
    const rosterTeams = [{
      rosterId: 1, teamName: 'My Team', starters: [],
      bench: [{ id: 'rb-ok', slot: 'Bench', full_name: 'RB Okay', position: 'RB' }],
      reserve: [{ id: 'rb-ir', slot: 'IR', full_name: 'RB On IR', position: 'RB' }],
      taxi: [{ id: 'rb-tx', slot: 'Taxi', full_name: 'RB On Taxi', position: 'RB' }],
    }]

    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} seasonProjections={seasonProjections}
        myTeamName="My Team" rosterPositions={rosterPositions}
      />
    )

    const startingRow0 = screen.getByTestId('starting-ten').querySelectorAll('tbody tr')[0]
    expect(startingRow0.querySelector('[data-testid="col-player"]').textContent).toContain('RB Okay')

    const bench = screen.getByTestId('bench')
    expect(bench.textContent).toContain('RB On IR')
    expect(bench.textContent).toContain('RB On Taxi')
  })
})

describe('2-YR RANK column', () => {
  const vetScore = { score: 50, label: 'Solid', confidence: 'high', components: {} }
  const careerStats = { 2024: {
    mine: { gamesPlayed: 16, fantasyPoints: 160 },
    young: { gamesPlayed: 16, fantasyPoints: 80 },
    other: { gamesPlayed: 16, fantasyPoints: 320 },
  } }
  const playerMap = {
    mine: { position: 'WR', age: 27 },
    young: { position: 'WR', age: 22, birth_date: '2002-09-01' },
    other: { position: 'WR', age: 27 },
  }
  const playerRows = [
    baseRow({ player_id: 'mine', full_name: 'Mine Vet', ownerTeamName: 'My Team', dynastyScore: vetScore }),
    baseRow({ player_id: 'young', full_name: 'Young Vet', ownerTeamName: 'My Team', dynastyScore: vetScore }),
    baseRow({ player_id: 'other', full_name: 'Other Vet', ownerTeamName: 'Other Team', dynastyScore: vetScore }),
  ]
  it('Bench: header directly after KTC; rank is league-wide; under marker on the 22-year-old', () => {
    render(<Portfolio playerRows={playerRows} myTeamName="My Team" careerStats={careerStats} playerMap={playerMap} />)
    const bench = screen.getByTestId('bench')
    const heads = [...bench.querySelectorAll('thead th')].map(th => th.textContent)
    expect(heads[heads.indexOf('KTC') + 1]).toBe('2-YR RANK')
    // other (320 pts, 20.0) outranks mine (160, 10.0) though not rostered by the user → WR2; young (80, 5.0) → WR3
    expect(bench.textContent).toContain('2-yr WR2 · WR2/g')
    expect(bench.textContent).toContain('2-yr WR3 · WR3/g')
    expect(bench.querySelector('[aria-label*="too low"]')).not.toBeNull()
  })
  it('Starting ten: header directly after KTC; starter row carries the rank, empty slot the blank cell', () => {
    const rosterTeams = [
      { rosterId: 1, teamName: 'My Team', starters: [{ id: 'mine', slot: 'WR', full_name: 'Mine Vet', position: 'WR' }], bench: [], reserve: [] },
    ]
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} myTeamName="My Team"
        rosterPositions={['WR', 'TE', 'BN']} careerStats={careerStats} playerMap={playerMap}
        seasonProjections={{ mine: { projectedPPG: 10 } }}
      />
    )
    const ten = screen.getByTestId('starting-ten')
    const heads = [...ten.querySelectorAll('thead th')].map(th => th.textContent)
    expect(heads[heads.indexOf('KTC') + 1]).toBe('2-YR RANK')
    expect(ten.querySelectorAll('tbody tr')[0].querySelector('[data-testid="col-2yr"]').textContent).toBe('2-yr WR2 · WR2/g')
    expect(ten.querySelector('[data-testid="starter-1"]').querySelector('[data-testid="col-2yr"]').textContent).toBe('')
  })
  it('Starting ten: a 31+ veteran (by birthdate on dataSeason+1-06-01) shows the over marker; the 22-year-old still shows under', () => {
    const oldMap = { ...playerMap, old: { position: 'WR', age: 31, birth_date: '1993-07-29' } }
    const oldStats = { 2024: { ...careerStats[2024], old: { gamesPlayed: 16, fantasyPoints: 200 } } }
    const rows = [
      ...playerRows,
      baseRow({ player_id: 'old', full_name: 'Old Vet', ownerTeamName: 'My Team', dynastyScore: vetScore }),
    ]
    const rosterTeams = [
      {
        rosterId: 1, teamName: 'My Team',
        starters: [
          { id: 'old', slot: 'WR', full_name: 'Old Vet', position: 'WR' },
          { id: 'young', slot: 'WR', full_name: 'Young Vet', position: 'WR' },
        ],
        bench: [], reserve: [],
      },
    ]
    render(
      <Portfolio
        playerRows={rows} rosterTeams={rosterTeams} myTeamName="My Team"
        rosterPositions={['WR', 'WR', 'BN']} careerStats={oldStats} playerMap={oldMap}
        seasonProjections={{ old: { projectedPPG: 10 }, young: { projectedPPG: 10 } }}
      />
    )
    const ten = screen.getByTestId('starting-ten')
    const rowFor = name => [...ten.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes(name))
    const oldRow = rowFor('Old Vet')
    const youngRow = rowFor('Young Vet')
    expect(oldRow.querySelector(`[aria-label="${AGE_CAUTION.over.text}"]`)).not.toBeNull()
    expect(oldRow.textContent).toContain('▲ age')
    // T17 the marker sits on the shared cell's name line, outside the truncating span
    const nameLine = oldRow.querySelector('[data-testid="player-cell-name"]')
    const marker = nameLine.querySelector(`[aria-label="${AGE_CAUTION.over.text}"]`)
    expect(marker).not.toBeNull()
    expect(nameLine.querySelector('span.truncate')).not.toContainElement(marker)
    expect(oldRow.querySelector(`[aria-label="${AGE_CAUTION.under.text}"]`)).toBeNull()
    expect(youngRow.querySelector(`[aria-label="${AGE_CAUTION.under.text}"]`)).not.toBeNull()
    expect(youngRow.querySelector(`[aria-label="${AGE_CAUTION.over.text}"]`)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Column views (option 1) and status beside the player (option 3)
// ---------------------------------------------------------------------------
describe('Starting ten / Bench column views', () => {
  const playerRows = [
    baseRow({ player_id: 's1', full_name: 'Starter One', ownerTeamName: 'My Team', ktcValue: 5000 }),
    baseRow({ player_id: 'b1', full_name: 'Bench One', ownerTeamName: 'My Team', ktcValue: 3000 }),
  ]
  const rosterTeams = [
    { rosterId: 1, teamName: 'My Team', starters: [{ id: 's1', slot: 'WR', full_name: 'Starter One', position: 'WR' }], bench: [{ id: 'b1', slot: 'BN', full_name: 'Bench One', position: 'WR' }], reserve: [] },
  ]
  const renderIt = () => render(
    <Portfolio
      playerRows={playerRows} rosterTeams={rosterTeams} myTeamName="My Team"
      rosterPositions={['WR', 'BN']} seasonProjections={{ s1: { projectedPPG: 12 }, b1: { projectedPPG: 8 } }}
    />
  )
  const hidden = el => el.className.split(/\s+/).includes('hidden')
  const starterCell = id => screen.getByTestId('starting-ten').querySelector(`tbody tr [data-testid="${id}"]`)
  const benchCell = id => screen.getByTestId('bench').querySelector(`tbody tr [data-testid="${id}"]`)

  it('defaults to Scoring: scoring cells shown, usage and market cells hidden; fixed cells never hidden', () => {
    renderIt()
    expect(hidden(starterCell('col-delta'))).toBe(false)
    expect(hidden(starterCell('col-games'))).toBe(true)
    expect(hidden(starterCell('col-ktc'))).toBe(true)
    for (const id of ['col-slot', 'col-player', 'col-status', 'col-ppg']) expect(hidden(starterCell(id))).toBe(false)
  })

  it('one switch drives both tables: picking Market in the Bench header shows KTC in Starting ten too', () => {
    renderIt()
    const benchSwitch = screen.getByRole('group', { name: 'Bench columns' })
    fireEvent.click([...benchSwitch.querySelectorAll('button')].find(b => b.textContent === 'Market'))
    expect(hidden(starterCell('col-ktc'))).toBe(false)
    expect(hidden(benchCell('col-ktc'))).toBe(false)
    expect(hidden(starterCell('col-delta'))).toBe(true)
    const tenSwitch = screen.getByRole('group', { name: 'Starting ten columns' })
    expect([...tenSwitch.querySelectorAll('button')].find(b => b.textContent === 'Market').getAttribute('aria-pressed')).toBe('true')
  })

  it('T16 Starting ten and Bench player cells use the shared cell and carry the popover lift (T14b)', () => {
    renderIt()
    for (const table of [screen.getByTestId('starting-ten'), screen.getByTestId('bench')]) {
      const td = table.querySelector('tbody tr [data-testid="col-player"]')
      expect(td.querySelector('[data-testid="player-cell"]')).not.toBeNull()
      expect(td.className).toContain('has-[[role=dialog]]:z-[3]')
    }
  })

  it('STATUS sits directly after PLAYER in both tables, header and rows', () => {
    renderIt()
    for (const table of [screen.getByTestId('starting-ten'), screen.getByTestId('bench')]) {
      const heads = [...table.querySelectorAll('thead th')].map(th => th.textContent)
      expect(heads[heads.indexOf('PLAYER') + 1]).toBe('STATUS')
      const player = table.querySelector('tbody tr [data-testid="col-player"]')
      expect(player.nextElementSibling.getAttribute('data-testid')).toBe('col-status')
    }
  })
})

describe('Starting ten and Bench frozen columns (T20)', () => {
  const playerRows = [
    baseRow({ player_id: 's1', full_name: 'Starter One', ownerTeamName: 'My Team', ktcValue: 5000 }),
    baseRow({ player_id: 'b1', full_name: 'Bench One', ownerTeamName: 'My Team', ktcValue: 3000 }),
  ]
  const rosterTeams = [
    { rosterId: 1, teamName: 'My Team', starters: [{ id: 's1', slot: 'WR', full_name: 'Starter One', position: 'WR' }], bench: [{ id: 'b1', slot: 'BN', full_name: 'Bench One', position: 'WR' }], reserve: [] },
  ]
  const tradedPicks = [{ season: '2027', round: 1, roster_id: 1, owner_id: 1, previous_owner_id: 1 }]
  const ktcPickTable = parseKtcPickRows([{ name: '2027 Mid 1st', position: null, team: 'FA', value: 3690 }])

  it('slot and player cells stick at the left; no md escape; scroll wrappers; REC_FLEX label capped', () => {
    render(
      <Portfolio
        playerRows={playerRows} rosterTeams={rosterTeams} myTeamName="My Team"
        rosterPositions={['REC_FLEX', 'WR', 'BN']} seasonProjections={{ s1: { projectedPPG: 12 }, b1: { projectedPPG: 8 } }}
        tradedPicks={tradedPicks} ktcPickTable={ktcPickTable} firstLiveDraftSeason={2027} draftRounds={1}
      />
    )
    const ten = screen.getByTestId('starting-ten')
    const bench = screen.getByTestId('bench')
    const slots = [...ten.querySelectorAll('tbody [data-testid="col-slot"]')]
    const recFlex = slots.find(td => td.textContent === 'REC_FLEX')
    expect(recFlex).toBeDefined() // setup: the fixture has a REC_FLEX slot
    const benchRows = bench.querySelectorAll('tbody tr')
    const picksBlock = screen.getByTestId('bench-picks')
    expect(picksBlock.querySelectorAll('[data-testid^="bench-pick-"]').length).toBeGreaterThanOrEqual(1)
    for (const td of picksBlock.querySelectorAll('tbody [data-testid="col-player"]')) {
      expect(td.className).toContain('sticky')
      expect(td.className).toContain('left-0')
    }
    expect(bench.querySelectorAll('[data-testid^="bench-pick-"]').length).toBe(0)
    expect([...benchRows].some(tr => tr.textContent.includes('Bench One'))).toBe(true)
    expect(ten.querySelector('tbody [data-testid="col-slot"]').className).toContain('left-0')
    expect(ten.querySelector('tbody [data-testid="col-slot"]').className).toContain('w-[56px]')
    for (const td of ten.querySelectorAll('tbody [data-testid="col-player"]')) expect(td.className).toContain('left-[56px]')
    const benchPlayers = bench.querySelectorAll('tbody [data-testid="col-player"]')
    expect(benchPlayers.length).toBeGreaterThanOrEqual(1) // the fixture's one bench player (picks have their own block)
    for (const td of benchPlayers) {
      expect(td.className).toContain('sticky')
      expect(td.className).toContain('left-0')
    }
    for (const el of [...ten.querySelectorAll('th, td'), ...bench.querySelectorAll('th, td')]) expect(el.className).not.toContain('md:static')
    // the test ids sit on the table itself or its section; either way the scroll wrapper must hold the table
    for (const el of [ten, bench]) {
      const table = el.tagName === 'TABLE' ? el : el.querySelector('table')
      expect(table.closest('[data-testid="frozen-scroll"]')).not.toBeNull()
    }
    const label = recFlex.querySelector('span')
    expect(label.className).toContain('w-[34px]')
    expect(label.className).toContain('truncate')
  })
})
