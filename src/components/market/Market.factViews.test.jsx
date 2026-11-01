// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react'
import { Market } from './Market'

expect.extend(jestDomMatchers)
afterEach(() => {
  cleanup()
  for (const k of ['market-sort', 'market-column-set', 'market-window', 'market-stats-mode', 'market-filters']) {
    localStorage.removeItem(k)
  }
})

// ---------------------------------------------------------------------------
// Fixtures (hand-checkable)
// ---------------------------------------------------------------------------
// WR FP/G 2023 (floor ceil(.5*17)=9 gp): w1 15.0 (14gp) #1, w3 10.0 #2; w2 (3gp) unranked.
// WR FP/G 2024: w2 20.0 #1, w3 15.0 #2, w1 10.0 (12gp) #3; w4 (5gp) unranked.
// WR Rec Yd 2024: w2 1000 #1, w1 900 #2, w3 800 #3, w4 300 #4. Rec Yd/G: w1 75.0 #1, w2 58.8 #2, w3 47.1 #3; w4 60.0 unranked.
// Career games: w1 14+14+12=40 (pool max), w2 3+17=20, w3 17+17=34.
const SNAP = { off_snp: 800, tm_off_snp: 1000 }
const row = (gp, fp, stats, team = 'DAL', extra = {}) => ({
  gamesPlayed: gp, gamesStarted: gp, fantasyPoints: fp, scoringBasis: 'league', team,
  stats: { ...SNAP, ...stats }, ...extra,
})
const wr = (gp, fp, recYd) => row(gp, fp, { rec_tgt: 100, rec: 70, rec_yd: recYd, rec_td: 5, rush_att: 2, rush_yd: 10 })

const careerStats = {
  2022: { w1: wr(14, 140, 700) },
  2023: {
    w1: wr(14, 210, 800), w2: wr(3, 30, 150), w3: wr(17, 170, 700),
    q1: row(17, 340, { pass_att: 500, pass_cmp: 330, pass_yd: 3800, pass_td: 28, rush_att: 40, rush_yd: 150 }, 'KC'),
    r1: row(17, 180, { rush_att: 220, rush_yd: 900, rush_td: 6, rec_tgt: 40, rec: 30, rec_yd: 200 }, 'SF'),
  },
  2024: {
    w1: wr(12, 120, 900), w2: wr(17, 340, 1000), w3: wr(17, 255, 800), w4: wr(5, 50, 300),
    q1: row(17, 374, { pass_att: 550, pass_cmp: 370, pass_yd: 4000, pass_td: 32, rush_att: 45, rush_yd: 200 }, 'KC'),
    r1: row(17, 190, { rush_att: 240, rush_yd: 1000, rush_td: 8, rec_tgt: 45, rec: 35, rec_yd: 250 }, 'SF'),
  },
}
const currentSeasonTotals = {
  season: 2025, complete: true,
  players: { w1: wr(5, 60, 300), w2: wr(5, 100, 400), q1: row(5, 110, { pass_att: 150, pass_cmp: 100, pass_yd: 1200, pass_td: 9 }, 'KC') },
}
const playerMap = {
  q1: { player_id: 'q1', position: 'QB', full_name: 'Quarterback One' },
  r1: { player_id: 'r1', position: 'RB', full_name: 'Running Back One' },
  w1: { player_id: 'w1', position: 'WR', full_name: 'Receiver One' },
  w2: { player_id: 'w2', position: 'WR', full_name: 'Receiver Two' },
  w3: { player_id: 'w3', position: 'WR', full_name: 'Receiver Three' },
  w4: { player_id: 'w4', position: 'WR', full_name: 'Receiver Four' },
  ghost: { player_id: 'ghost', position: 'WR', full_name: 'Ghost Receiver' },
}
const playerRows = Object.values(playerMap).map((p, i) => ({
  player_id: p.player_id, position: p.position, full_name: p.full_name, nfl_team: 'DAL',
  dynastyScore: { score: 50 + i, label: 'Solid', confidence: 'high' },
  ktcValue: 1000 + i, ownerTeamName: p.player_id === 'ghost' ? 'Ghost Team' : null,
}))

function renderMarket(overrides = {}) {
  const props = { playerRows, loaded: true, careerStats, playerMap, currentSeasonTotals, myTeamName: 'Me', onOpenPlayerDetail: vi.fn(), ...overrides }
  return render(<Market {...props} />)
}
const headerNames = () => screen.getAllByRole('columnheader').map(h => h.textContent.trim())
const baseName = h => h.replace(/ [↑↓]$/, '')
function cellOf(playerName, header) {
  const idx = headerNames().map(baseName).indexOf(header)
  expect(idx, `header ${header} in ${headerNames()}`).toBeGreaterThan(-1)
  return screen.getByText(playerName).closest('tr').querySelectorAll('td')[idx]
}
const pill = name => fireEvent.click(screen.getByRole('button', { name }))
const pickWindow = id => fireEvent.change(screen.getByRole('combobox', { name: 'Window' }), { target: { value: id } })
const windowOptions = () => within(screen.getByRole('combobox', { name: 'Window' })).getAllByRole('option').map(o => o.textContent)

describe('Market fact views', () => {
  it('fixture precondition: no player has more than 40 career games', () => {
    const gp = {}
    for (const season of Object.values(careerStats)) for (const [id, r] of Object.entries(season)) gp[id] = (gp[id] ?? 0) + r.gamesPlayed
    expect(Math.max(...Object.values(gp))).toBe(40)
  })

  it('1. opens on Overview on a clean store, with no Trend gutter', () => {
    renderMarket()
    expect(screen.getByRole('button', { name: 'Overview' }).className).toContain('font-semibold')
    for (const h of ['G', 'FP ↓', 'FP/G', 'Prev rk', 'Owner', 'KTC', 'Dynasty']) {
      expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
    }
    expect(screen.queryByRole('columnheader', { name: /Trend/ })).not.toBeInTheDocument()
  })

  it('2. migrates volume and production to Stats, and an unknown value to Overview', () => {
    localStorage.setItem('market-column-set', 'volume')
    renderMarket()
    expect(screen.getByRole('columnheader', { name: /Pass Yd/ })).toBeInTheDocument()
    expect(localStorage.getItem('market-column-set')).toBe('stats')
    cleanup()
    localStorage.setItem('market-column-set', 'production')
    renderMarket()
    expect(screen.getByRole('columnheader', { name: /Pass Yd/ })).toBeInTheDocument()
    expect(localStorage.getItem('market-column-set')).toBe('stats')
    cleanup()
    localStorage.setItem('market-column-set', 'bogus')
    renderMarket()
    expect(screen.getByRole('columnheader', { name: 'Prev rk' })).toBeInTheDocument()
  })

  it('3. offers the live window only when liveSeasonUsable', () => {
    renderMarket({ liveSeasonUsable: true })
    expect(windowOptions()).toContain('2025 so far')
    cleanup()
    renderMarket({ liveSeasonUsable: false })
    expect(windowOptions()).not.toContain('2025 so far')
  })

  it('4. switching the window changes a WR\'s FP/G value and rank', () => {
    renderMarket()
    pickWindow('2023')
    expect(cellOf('Receiver One', 'FP/G').textContent).toBe('15.0#1')
    pickWindow('2024')
    expect(cellOf('Receiver One', 'FP/G').textContent).toBe('10.0#3')
  })

  it('5. the career window ranks only players with 32+ games', () => {
    renderMarket({ liveSeasonUsable: false })
    pill('WR')
    pickWindow('career')
    expect(cellOf('Receiver One', 'FP/G').textContent).toMatch(/#\d+$/)
    // 20 career games would rank under the default half-of-max floor (20); the career floor is 32.
    const w2 = cellOf('Receiver Two', 'FP/G').textContent
    expect(w2).toMatch(/^\d+\.\d$/)
    expect(w2).not.toContain('#')
  })

  it('6. the Per game toggle swaps in the twin metrics and ranks, keeping the sort column', () => {
    renderMarket({ liveSeasonUsable: false })
    pill('Stats')
    pill('WR')
    expect(cellOf('Receiver Two', 'Rec Yd').textContent).toBe('1000#1')
    fireEvent.click(screen.getByRole('columnheader', { name: /^Rec Yd/ }))
    expect(JSON.parse(localStorage.getItem('market-sort')).column).toBe('recYd')
    pill('Per game')
    expect(screen.getByRole('button', { name: 'Per game' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByRole('columnheader', { name: 'Rec Yd' })).not.toBeInTheDocument()
    expect(cellOf('Receiver One', 'Rec Yd/G').textContent).toBe('75.0#1')
    expect(cellOf('Receiver Two', 'Rec Yd/G').textContent).toBe('58.8#2')
    expect(localStorage.getItem('market-stats-mode')).toBe('perGame')
    expect(JSON.parse(localStorage.getItem('market-sort')).column).toBe('recYd')
    expect(screen.getByRole('columnheader', { name: 'Rec Yd/G ↓' })).toBeInTheDocument()
  })

  it('7. a player under the games floor shows a per-game value with no rank', () => {
    localStorage.setItem('market-stats-mode', 'perGame')
    renderMarket({ liveSeasonUsable: false })
    pill('Stats')
    pill('WR')
    const t = cellOf('Receiver Four', 'Rec Yd/G').textContent
    expect(t).toBe('60.0')
  })

  it('8. Pass Yd under ALL is — for a WR and ranked for the QB', () => {
    renderMarket({ liveSeasonUsable: false })
    pill('Stats')
    expect(cellOf('Receiver One', 'Pass Yd').textContent).toBe('—')
    expect(cellOf('Quarterback One', 'Pass Yd').textContent).toBe('4000#1')
  })

  it('9. Prev rk follows the prior season and is hidden for last3 and career', () => {
    renderMarket({ liveSeasonUsable: true })
    // default is the live window → prior season is 2024
    expect(screen.getByRole('columnheader', { name: 'Prev rk' }).getAttribute('title')).toContain('2024')
    pickWindow('2024')
    expect(screen.getByRole('columnheader', { name: 'Prev rk' }).getAttribute('title')).toContain('2023')
    expect(cellOf('Receiver One', 'Prev rk').textContent).toBe('#1')
    pickWindow('last3')
    expect(screen.queryByRole('columnheader', { name: 'Prev rk' })).not.toBeInTheDocument()
    pickWindow('career')
    expect(screen.queryByRole('columnheader', { name: 'Prev rk' })).not.toBeInTheDocument()
  })

  it('10. KTC and Dynasty appear on Overview only', () => {
    renderMarket()
    expect(screen.getByRole('columnheader', { name: 'KTC' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Dynasty' })).toBeInTheDocument()
    for (const v of ['Stats', 'Usage']) {
      pill(v)
      expect(screen.queryByRole('columnheader', { name: 'KTC' })).not.toBeInTheDocument()
      expect(screen.queryByRole('columnheader', { name: 'Dynasty' })).not.toBeInTheDocument()
    }
  })

  it('11. a stale stored window falls back to the default without being rewritten', () => {
    localStorage.setItem('market-window', 'live')
    renderMarket({ liveSeasonUsable: false })
    expect(screen.getByRole('combobox', { name: 'Window' })).toHaveValue('2024')
    expect(localStorage.getItem('market-window')).toBe('live')
  })

  it('12. default sorts, the pill reset and an invalid restored sort', () => {
    renderMarket()
    pill('Usage')
    expect(screen.getByRole('columnheader', { name: 'Opp/G ↓' })).toBeInTheDocument()
    pill('Stats')
    fireEvent.click(screen.getByRole('columnheader', { name: /Player/ }))
    expect(screen.queryByRole('columnheader', { name: 'FP ↓' })).not.toBeInTheDocument()
    pill('QB')
    expect(screen.getByRole('columnheader', { name: 'FP ↓' })).toBeInTheDocument()
    cleanup()
    localStorage.setItem('market-column-set', 'overview')
    localStorage.setItem('market-sort', JSON.stringify({ column: 'dynastyScoreValue', direction: 'desc' }))
    renderMarket()
    expect(screen.getByRole('columnheader', { name: 'FP ↓' })).toBeInTheDocument()
  })

  it('13. a player with no window stats shows — and sorts last, but keeps Owner and KTC', () => {
    const ghostRow = playerRows.find(r => r.player_id === 'ghost')
    const reordered = [ghostRow, ...playerRows.filter(r => r !== ghostRow)]
    const { container } = renderMarket({ liveSeasonUsable: false, playerRows: reordered })
    const lastRow = () => { const rows = [...container.querySelectorAll('tbody tr')]; return rows[rows.length - 1] }
    expect(within(lastRow()).getByText('Ghost Receiver')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('columnheader', { name: 'FP ↓' }))
    expect(screen.getByRole('columnheader', { name: 'FP ↑' })).toBeInTheDocument()
    expect(within(lastRow()).getByText('Ghost Receiver')).toBeInTheDocument()
    expect(cellOf('Ghost Receiver', 'FP').textContent).toBe('—')
    expect(cellOf('Ghost Receiver', 'Owner').textContent).toBe('Ghost Team')
    expect(cellOf('Ghost Receiver', 'KTC').textContent).toBe('1006')
  })

  it('14. the caption states league scoring, and the 2020 snap note only where coverage is partial', () => {
    renderMarket({ liveSeasonUsable: false })
    expect(screen.getByText('2024 · League scoring')).toBeInTheDocument()
    cleanup()
    const noSnap = { gamesPlayed: 5, gamesStarted: 5, fantasyPoints: 50, scoringBasis: 'league', team: 'DAL', stats: { rec_tgt: 20, rec: 10, rec_yd: 100 } }
    renderMarket({ liveSeasonUsable: false, careerStats: { ...careerStats, 2019: { w3: noSnap } } })
    pickWindow('career')
    expect(screen.getByText(/Snap % covers 2020 onward/)).toBeInTheDocument()
    pill('Stats')
    expect(screen.queryByText(/Snap % covers/)).not.toBeInTheDocument()
  })

  it('14b. the caption names the Half-PPR basis, and is just the window label for an empty pool', () => {
    const half = { ...careerStats, 2024: { ...careerStats[2024], w2: { ...careerStats[2024].w2, scoringBasis: 'half_ppr' } } }
    renderMarket({ liveSeasonUsable: false, careerStats: half })
    expect(screen.getByText(/Half-PPR basis \(Sleeper's own scoring, not necessarily this league's\)/)).toBeInTheDocument()
    expect(screen.queryByText(/League scoring/)).not.toBeInTheDocument()
    cleanup()
    renderMarket({ liveSeasonUsable: false, careerStats: { 2024: {} } })
    const caption = screen.getAllByText('2024', { exact: true }).find(el => el.tagName === 'P')
    expect(caption).toBeDefined()
    expect(caption.textContent).toBe('2024')
  })

  it('14c. the chosen window persists across a remount', () => {
    renderMarket({ liveSeasonUsable: false })
    pickWindow('2023')
    expect(localStorage.getItem('market-window')).toBe('2023')
    cleanup()
    renderMarket({ liveSeasonUsable: false })
    expect(screen.getByRole('combobox', { name: 'Window' })).toHaveValue('2023')
  })

  it('15. the old views are still reachable, with no Window select and no Volume', () => {
    renderMarket()
    expect(screen.queryByRole('button', { name: 'Volume' })).not.toBeInTheDocument()
    for (const [btn, head] of [['Value', /Dynasty score/], ['Outlook', 'Proj ↓'], ['In-season', /Opp shift/], ['Efficiency', /Target share/]]) {
      pill(btn)
      expect(screen.getByRole('columnheader', { name: head })).toBeInTheDocument()
      expect(screen.queryByRole('combobox', { name: 'Window' })).not.toBeInTheDocument()
    }
  })
})
