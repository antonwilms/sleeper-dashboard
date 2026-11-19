// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import { LineupTable } from './LineupTable'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function row(overrides = {}) {
  return {
    slot: 'QB', player_id: 'p1', name: 'Player One', position: 'QB', team: 'KC',
    opponent: 'DEN', opponentEra: 'DEN', bye: false, allows: null, allowsRank: null, weight: null,
    usage: null, form: [null, null, null], points: 12.3,
    counts: null, ranks: null, depth: null, backup: false,
    ...overrides,
  }
}

function emptyRow(slot = 'RB') {
  return {
    slot, player_id: null, name: null, position: null, team: null,
    opponent: null, opponentEra: null, bye: false, allows: null, allowsRank: null,
    weight: null, usage: null, form: [null, null, null], points: null,
    counts: null, ranks: null, depth: null, backup: false,
  }
}

describe('LineupTable — PROJ rendering (weekly-decision-2a-lineup-truth.md §7)', () => {
  it('an unprojected bench row renders PROJ "—", and a real-zero row renders "0.0"', () => {
    const bench = [
      row({ slot: 'BN', player_id: 'unproj', name: 'Unprojected', points: null }),
      row({ slot: 'BN', player_id: 'zero', name: 'Real Zero', points: 0 }),
    ]
    const { container } = render(<LineupTable starters={[]} bench={bench} />)
    // The 4th <td> of each data row is the PROJ cell (fixed columns: slot, player, VS, PROJ) — target
    // it directly so the ALLOWS column's own unconditional `—` (allows: null on both fixture rows)
    // can't make this pass spuriously.
    const dataRows = [...container.querySelectorAll('tbody tr')].filter(tr => tr.textContent.includes('Unprojected') || tr.textContent.includes('Real Zero'))
    const projCellFor = name => dataRows.find(tr => tr.textContent.includes(name)).querySelector('td:nth-child(4)').textContent
    expect(projCellFor('Unprojected')).toBe('—')
    expect(projCellFor('Real Zero')).toBe('0.0')
  })
})

describe('LineupTable — empty starter row and the BENCH divider', () => {
  it('an empty starter row renders "Empty" in the player cell', () => {
    const { getByText } = render(<LineupTable starters={[emptyRow('RB')]} bench={[]} />)
    expect(getByText('Empty')).toBeInTheDocument()
  })

  it('the BENCH divider renders only when the bench is non-empty', () => {
    const withBench = render(<LineupTable starters={[row()]} bench={[row({ slot: 'BN', player_id: 'b1' })]} />)
    expect(withBench.getByText('BENCH · 1')).toBeInTheDocument()
    withBench.unmount()

    const withoutBench = render(<LineupTable starters={[row()]} bench={[]} />)
    expect(withoutBench.queryByText(/BENCH ·/)).toBeNull()
  })
})

describe('LineupTable — subtitle', () => {
  it('states starters-as-set, not projection framing', () => {
    const { getByText } = render(<LineupTable starters={[row(), row({ player_id: 'p2' })]} bench={[]} />)
    expect(getByText(/2 slots as set in Sleeper, then the bench/)).toBeInTheDocument()
  })
})

describe('LineupTable — prior-season SNAP sub-line (weekly-decision-2-panels.md §1a)', () => {
  it('a bench row gets its sub-line', () => {
    const bench = [row({ slot: 'BN', player_id: 'b1', usage: { rush: null, target: null, touch: null, snap: 0.6 } })]
    const { getByText } = render(
      <LineupTable starters={[]} bench={bench} priorSnapByPlayer={{ b1: 0.42 }} lastSeason={2025} />
    )
    expect(getByText('2025 · 42%')).toBeInTheDocument()
  })

  it('only SNAP renders a grey value — RUSH/TARGET/TOUCH render nothing beneath, no dash', () => {
    const starters = [row({ usage: { rush: 0.3, target: 0.2, touch: 0.25, snap: 0.6 } })]
    const { container, queryByText } = render(
      <LineupTable starters={starters} bench={[]} priorSnapByPlayer={{ p1: 0.42 }} />
    )
    // Only one sub-line value anywhere in the row — RUSH/TARGET/TOUCH have no equivalent prop, so
    // no grey sub-line can appear beneath them.
    expect(container.querySelectorAll('[data-testid="prior-share"]').length).toBe(1)
    // the RUSH main value itself renders fine (the share is a dimmed span, so match the whole line)
    expect(queryByText((_, el) => el?.tagName === 'DIV' && el.textContent === '— · 30%')).toBeInTheDocument()
  })

  it('an absent prior share renders nothing beneath (not missing player, not missing prop)', () => {
    const starters = [row({ usage: { rush: null, target: null, touch: null, snap: 0.6 } })]
    const { container } = render(<LineupTable starters={starters} bench={[]} priorSnapByPlayer={{ p1: null }} />)
    expect(container.querySelectorAll('[data-testid="prior-share"]').length).toBe(0)
  })

  it('an empty starter row renders no sub-line', () => {
    const { container } = render(<LineupTable starters={[emptyRow('RB')]} bench={[]} priorSnapByPlayer={{}} />)
    expect(container.querySelectorAll('[data-testid="prior-share"]').length).toBe(0)
  })
})

const FULL_USAGE = { rush: 0.37, target: 0.2, touch: 0.3, rzRush: 0.5, rzTarget: 0.1, snap: 0.6 }
const FULL_COUNTS = { rush: 22, target: 8, touch: 27, rzRush: 4, rzTarget: 1, snap: 120 }

function headerCount(container) {
  return container.querySelectorAll('thead tr th').length
}

describe('LineupTable — rows open the player pop-up', () => {
  it('click and Enter on a player row call onOpenPlayerDetail with its player_id; an empty slot is inert', () => {
    const onOpen = vi.fn()
    const { container, getByText } = render(
      <LineupTable
        starters={[row(), emptyRow('RB')]}
        bench={[row({ slot: 'BN', player_id: 'b1', name: 'Benchy' })]}
        onOpenPlayerDetail={onOpen}
      />
    )
    const buttons = container.querySelectorAll('tr[role="button"]')
    expect(buttons.length).toBe(2) // one starter + one bench; the empty slot is not a button
    fireEvent.click(buttons[0])
    expect(onOpen).toHaveBeenLastCalledWith('p1')
    fireEvent.keyDown(buttons[1], { key: 'Enter' })
    expect(onOpen).toHaveBeenLastCalledWith('b1')
    const calls = onOpen.mock.calls.length
    fireEvent.click(getByText('Empty').closest('tr'))
    expect(onOpen.mock.calls.length).toBe(calls)
  })
})

describe('LineupTable — usage cells: count · share', () => {
  it('RUSH renders `22 · 37%`; a WR RUSH renders `—`; count 0 with null share renders `0 · —`', () => {
    const rb = row({ player_id: 'rb', position: 'RB', usage: FULL_USAGE, counts: FULL_COUNTS })
    const wr = row({
      player_id: 'wr', position: 'WR',
      usage: { ...FULL_USAGE, rush: null, rzRush: null },
      counts: { ...FULL_COUNTS, rush: null, rzRush: null },
    })
    const zero = row({ player_id: 'z', usage: { ...FULL_USAGE, rzRush: null }, counts: { ...FULL_COUNTS, rzRush: 0 } })
    const { container } = render(<LineupTable starters={[rb, wr, zero]} bench={[]} />)
    const tds = i => container.querySelectorAll('tbody tr')[i].querySelectorAll('td')
    // cells: slot, player, VS, PROJ, ALLOWS, RUSH, TARGET, TOUCH, RZ RUSH, RZ TGT, SNAP, LAST 3, OURS
    expect(tds(0)[5].textContent).toBe('22 · 37%')
    expect(tds(0)[8].textContent).toBe('4 · 50%')
    expect(tds(1)[5].textContent).toBe('—')
    expect(tds(1)[8].textContent).toBe('—')
    expect(tds(2)[8].textContent).toBe('0 · —')
  })
})

describe('LineupTable — columns', () => {
  it('has RZ RUSH, RZ TGT and OURS headers, and every player/empty row has as many tds as the header has ths (13); BENCH divider colSpan 13', () => {
    const { container, getByText } = render(
      <LineupTable
        starters={[row({ usage: FULL_USAGE, counts: FULL_COUNTS }), emptyRow('RB')]}
        bench={[row({ slot: 'BN', player_id: 'b1' })]}
      />
    )
    expect(getByText('RZ RUSH')).toBeInTheDocument()
    expect(getByText('RZ TGT')).toBeInTheDocument()
    expect(getByText('OURS')).toBeInTheDocument()
    const ths = headerCount(container)
    expect(ths).toBe(13)
    const bodyRows = [...container.querySelectorAll('tbody tr')].filter(tr => !tr.textContent.startsWith('BENCH'))
    expect(bodyRows.length).toBe(3)
    for (const tr of bodyRows) expect(tr.querySelectorAll('td').length).toBe(ths)
    expect(getByText(/^BENCH ·/).getAttribute('colspan')).toBe('13')
  })
})

describe('LineupTable — OURS cell (week-own-projection.md §6)', () => {
  const vegas = { implied: 26, baseline: 24, baselineWeeks: 3, minBaselineWeeks: 2, factor: 1.0416667 }
  const cellFor = (own, extra = {}) => {
    const { container } = render(
      <LineupTable starters={[row({ player_id: 'o1', ...extra })]} bench={[]} ownByPlayer={own === undefined ? {} : { o1: own }} thisSeason={2026} />
    )
    const tds = container.querySelectorAll('tbody tr')[0].querySelectorAll('td')
    return { tds, ours: tds[12], proj: tds[3] }
  }

  it('a valued row renders the number, `imp 26.0 · +2.0` and the full tooltip; PROJ sits in the fixed columns after VS', () => {
    const { ours, proj, tds } = cellFor({ value: 14.791666, reason: null, base: 14.2, baseKind: 'ros', status: null, vegas })
    expect(ours.textContent).toBe('14.8imp 26.0 · +2.0')
    expect(ours.querySelector('[data-testid="own-implied"]').textContent).toBe('imp 26.0 · +2.0')
    expect(ours.getAttribute('title')).toMatch(/^Rest-of-season projection 14\.2 PPG × 1\.04 = 14\.8\./)
    expect(ours.getAttribute('title')).toContain('over 3 earlier 2026 games with a line (24.0)')
    expect(proj).toBe(tds[3])
    expect(ours).toBe(tds[tds.length - 1])
    expect(proj.textContent).toBe('12.3')
  })

  it('a season-kind base says "Season projection"', () => {
    const { ours } = cellFor({ value: 14.0, reason: null, base: 14.0, baseKind: 'season', status: null, vegas: { ...vegas, implied: 24, factor: 1 } })
    expect(ours.getAttribute('title')).toMatch(/^Season projection 14\.0 PPG × 1\.00 = 14\.0\./)
  })

  it('implied below baseline shows U+2212, not a hyphen', () => {
    const { ours } = cellFor({ value: 13.0, reason: null, base: 14.2, baseKind: 'ros', status: null, vegas: { ...vegas, implied: 21, factor: 0.9375 } })
    expect(ours.querySelector('[data-testid="own-implied"]').textContent).toBe('imp 21.0 · \u22123.0')
  })

  it("'out' renders OUT with the Sleeper status in the title", () => {
    const { ours } = cellFor({ value: null, reason: 'out', base: 14.2, baseKind: 'ros', status: 'IR', vegas })
    expect(ours.textContent).toBe('OUTimp 26.0 · +2.0')
    expect(ours.querySelector('[data-testid="own-implied"]').textContent).toBe('imp 26.0 · +2.0')
    expect(ours.getAttribute('title')).toBe('Listed IR in Sleeper — no number.')
  })

  it("'no-baseline' renders — plus the implied total with no delta", () => {
    const { ours } = cellFor({ value: null, reason: 'no-baseline', base: 14.2, baseKind: 'ros', status: null, vegas: { implied: 27, baseline: null, baselineWeeks: 1, minBaselineWeeks: 2, factor: null } })
    expect(ours.textContent).toBe('—imp 27.0')
    expect(ours.querySelector('[data-testid="own-implied"]').textContent).toBe('imp 27.0')
    expect(ours.getAttribute('title')).toContain('fewer than 2 earlier')
  })

  it("'bye' renders — with no sub-line; 'no-line' and 'no-base' explain themselves", () => {
    const bye = cellFor({ value: null, reason: 'bye', base: null, baseKind: null, status: null, vegas: null })
    expect(bye.ours.textContent).toBe('—')
    expect(bye.ours.querySelector('[data-testid="own-implied"]')).toBeNull()
    expect(bye.ours.getAttribute('title')).toBe('Bye week.')
    cleanup()
    expect(cellFor({ value: null, reason: 'no-line', base: 14.2, baseKind: 'ros', status: null, vegas: null }).ours.getAttribute('title'))
      .toBe('No Vegas line for this game in the schedule file — no number.')
    cleanup()
    expect(cellFor({ value: null, reason: 'no-base', base: null, baseKind: null, status: null, vegas: null }).ours.getAttribute('title'))
      .toBe('No season projection for this player — no number.')
  })

  it('a QB starter with a share reads "Starting QB this week" in the title', () => {
    const { ours } = cellFor({ value: 14.3 * 1.0416667, reason: null, base: 14.3, baseKind: 'ros', share: 0.34, qbRole: 'starter', status: null, vegas })
    expect(ours.getAttribute('title')).toMatch(/^Starting QB this week: rest-of-season starter rate 14\.3 PPG \(the season projection assumes he starts 34% of remaining games\) × 1\.04 = 14\.9\./)
    expect(ours.getAttribute('title')).toContain('over 3 earlier 2026 games with a line (24.0)')
  })

  it("'qb-backup' and 'qb-no-role' render — with the implied sub-line and their titles", () => {
    const b = cellFor({ value: null, reason: 'qb-backup', base: 4, baseKind: 'season', share: null, qbRole: 'backup', status: null, vegas })
    expect(b.ours.textContent).toBe('—imp 26.0 · +2.0')
    expect(b.ours.getAttribute('title')).toBe('Not his team\u2019s starting QB this week (Sleeper depth chart and injury list) \u2014 no number.')
    cleanup()
    const n = cellFor({ value: null, reason: 'qb-no-role', base: 4, baseKind: 'season', share: null, qbRole: 'unknown', status: null, vegas })
    expect(n.ours.textContent).toBe('—imp 26.0 · +2.0')
    expect(n.ours.getAttribute('title')).toBe('No Sleeper depth chart for his team\u2019s QBs \u2014 can\u2019t tell who starts, no number.')
  })

  it('the BACKUP chip yields to a QB starter role', () => {
    const r = row({ player_id: 'o1', depth: { position: 'QB', order: 2 }, backup: true })
    const chip = (own) => {
      const { container } = render(<LineupTable starters={[r]} bench={[]} ownByPlayer={own} />)
      const el = container.querySelector('[data-testid="backup-flag"]')
      cleanup()
      return el
    }
    expect(chip({ o1: { qbRole: 'starter', reason: null, value: 14.9, base: 14.3, baseKind: 'ros', share: 0.34, status: null, vegas } })).toBeNull()
    expect(chip({ o1: { qbRole: 'backup', reason: 'qb-backup' } })).not.toBeNull()
    expect(chip({})).not.toBeNull()
  })

  it('no own entry renders — and no title', () => {
    const { ours } = cellFor(undefined)
    expect(ours.textContent).toBe('—')
    expect(ours.hasAttribute('title')).toBe(false)
  })
})

describe('LineupTable — rank line and BACKUP chip', () => {
  const lineOf = (container) => container.querySelector('[title^="Rank by total points"]')

  it('all three segments', () => {
    const r = row({ position: 'WR', ranks: { lastPos: 14, thisPos: 8, thisOverall: 31 } })
    const { container } = render(<LineupTable starters={[r]} bench={[]} lastSeason={2025} thisSeason={2026} />)
    expect(lineOf(container).textContent).toBe('2025 WR14 · 2026 WR8 · #31 overall')
  })

  it('omits a missing segment; ranks null renders the bare position', () => {
    const only = row({ position: 'WR', ranks: { lastPos: 14, thisPos: null, thisOverall: null } })
    const a = render(<LineupTable starters={[only]} bench={[]} lastSeason={2025} thisSeason={2026} />)
    expect(lineOf(a.container).textContent).toBe('2025 WR14')
    a.unmount()
    const none = row({ position: 'WR', ranks: null })
    const b = render(<LineupTable starters={[none]} bench={[]} lastSeason={2025} thisSeason={2026} />)
    expect(lineOf(b.container).textContent).toBe('WR')
  })

  it('the raw depth entry never appears in text; backup:true renders a chip whose title keeps it', () => {
    const r = row({ position: 'WR', depth: { position: 'LWR', order: 2 }, backup: true })
    const { container } = render(<LineupTable starters={[r]} bench={[]} />)
    expect([...container.querySelectorAll('*')].some(el => el.textContent.includes('LWR2'))).toBe(false)
    const chip = container.querySelector('[data-testid="backup-flag"]')
    expect(chip).not.toBeNull()
    expect(chip.getAttribute('title')).toBe('Depth chart: LWR2')
  })

  it('backup:false renders no chip', () => {
    const r = row({ depth: { position: 'WR', order: 1 }, backup: false })
    const { container } = render(<LineupTable starters={[r]} bench={[]} />)
    expect(container.querySelector('[data-testid="backup-flag"]')).toBeNull()
  })
})

describe('LineupTable — headshots and team logos (sleeper-images.md)', () => {
  const rowEl = (container, name) => [...container.querySelectorAll('tbody tr')].find(tr => tr.textContent.includes(name))

  it('a numeric-id row holds a headshot, the team logo in the player cell and the opponent logo in the VS cell', () => {
    const { container } = render(<LineupTable starters={[row({ player_id: '4046', name: 'Photo Player', team: 'KC', opponent: 'DEN' })]} bench={[]} />)
    const tr = rowEl(container, 'Photo Player')
    expect(tr.querySelector('[data-testid="headshot"]').getAttribute('src')).toMatch(/\/4046\.jpg$/)
    const tds = tr.querySelectorAll('td')
    expect(tds[1].querySelector('[data-testid="team-logo"]').getAttribute('src')).toMatch(/\/kc\.png$/)
    expect(tds[2].querySelector('[data-testid="team-logo"]').getAttribute('src')).toMatch(/\/den\.png$/)
    expect(tds[2].textContent).toBe('DEN')
  })

  it('a non-numeric id shows the placeholder instead of a headshot', () => {
    const { container } = render(<LineupTable starters={[row({ player_id: 'p1', name: 'No Photo' })]} bench={[]} />)
    const tr = rowEl(container, 'No Photo')
    expect(tr.querySelector('[data-testid="headshot"]')).toBeNull()
    expect(tr.querySelector('[data-testid="headshot-fallback"]')).not.toBeNull()
  })

  it('an empty slot holds neither a headshot nor a placeholder', () => {
    const { container } = render(<LineupTable starters={[emptyRow('RB')]} bench={[]} />)
    expect(container.querySelector('[data-testid="headshot"]')).toBeNull()
    expect(container.querySelector('[data-testid="headshot-fallback"]')).toBeNull()
    expect(container.querySelector('[data-testid="team-logo"]')).toBeNull()
  })

  it('Rams: Sleeper-domain LAR renders lar.png everywhere and never the legacy la.png', () => {
    const { container } = render(<LineupTable starters={[row({ player_id: '4046', name: 'Rams Player', team: 'LAR', opponent: 'LAR', opponentEra: 'LA' })]} bench={[]} />)
    const logos = [...rowEl(container, 'Rams Player').querySelectorAll('[data-testid="team-logo"]')]
    expect(logos).toHaveLength(2)
    for (const l of logos) {
      expect(l.getAttribute('src')).toMatch(/\/lar\.png$/)
      expect(l.getAttribute('src')).not.toMatch(/\/la\.png$/)
    }
  })
})

describe('LineupTable — column views and status beside the name', () => {
  const hidden = el => el.className.split(/\s+/).includes('hidden')
  const r1 = () => row({ usage: FULL_USAGE, counts: FULL_COUNTS })

  it('defaults to Scoring (LAST 3, OURS shown; ALLOWS and usage hidden); PROJ is never hidden', () => {
    const { container } = render(<LineupTable starters={[r1()]} bench={[]} />)
    const tds = container.querySelectorAll('tbody tr')[0].querySelectorAll('td')
    expect(hidden(tds[11])).toBe(false) // LAST 3
    expect(hidden(tds[12])).toBe(false) // OURS
    expect(hidden(tds[4])).toBe(true)   // ALLOWS
    expect(hidden(tds[5])).toBe(true)   // RUSH
    for (const i of [0, 1, 2, 3]) expect(hidden(tds[i])).toBe(false)
  })

  it('Usage shows the six usage cells and hides scoring; header cells follow', () => {
    const { container, getByRole } = render(<LineupTable starters={[r1()]} bench={[]} />)
    const usage = [...getByRole('group', { name: 'Lineup columns' }).querySelectorAll('button')].find(b => b.textContent === 'Usage')
    fireEvent.click(usage)
    expect(usage.getAttribute('aria-pressed')).toBe('true')
    const tds = container.querySelectorAll('tbody tr')[0].querySelectorAll('td')
    for (const i of [5, 6, 7, 8, 9, 10]) expect(hidden(tds[i])).toBe(false)
    expect(hidden(tds[11])).toBe(true)
    expect(hidden(tds[12])).toBe(true)
    const ths = container.querySelectorAll('thead th')
    expect(hidden(ths[5])).toBe(false)
    expect(hidden(ths[12])).toBe(true)
  })

  it('a player Sleeper lists out carries the status chip beside his name; others carry none', () => {
    const { getAllByTestId, queryAllByTestId, rerender } = render(
      <LineupTable starters={[row({ player_id: 'o1', name: 'Hurt Guy', injuryStatus: 'IR' })]} bench={[]} />
    )
    expect(getAllByTestId('status-flag').map(el => el.textContent)).toEqual(['IR'])
    expect(getAllByTestId('status-flag')[0].closest('td').textContent).toContain('Hurt Guy')
    rerender(<LineupTable starters={[row({ player_id: 'o1', name: 'Hurt Guy' })]} bench={[]} />)
    expect(queryAllByTestId('status-flag').length).toBe(0)
  })

  it('T13 Q and D render for every designation; the old OURS gate is gone', () => {
    const own = {}
    expect(Object.values(own).some(o => o.reason === 'out')).toBe(false)
    const starters = [
      row({ player_id: 'a', name: 'Aa', injuryStatus: 'Questionable' }),
      row({ player_id: 'b', name: 'Bb', injuryStatus: 'Doubtful' }),
      row({ player_id: 'c', name: 'Cc', injuryStatus: 'Out' }),
      row({ player_id: 'd', name: 'Dd', injuryStatus: null }),
    ]
    const { getAllByTestId } = render(<LineupTable starters={starters} bench={[]} ownByPlayer={own} />)
    const chips = getAllByTestId('status-flag')
    expect(chips.map(c => c.textContent)).toEqual(['Q', 'D', 'OUT'])
    expect(chips[0].getAttribute('data-severity')).toBe('caution')
    expect(chips[1].getAttribute('data-severity')).toBe('severe')
  })

  it('T12 a flag cites both PROJ numbers and OURS', () => {
    const starter = row({ slot: 'FLEX', player_id: 's', name: 'Sam Starter', position: 'WR', points: 8.7 })
    const flag = {
      slotIndex: 0, slot: 'FLEX', kind: 'higher', cause: null, status: null, starterProj: 8.7, starterOurs: 7.8,
      bench: { id: 'b', name: 'Chase White', proj: 9.8, ours: 9.6 }, ours: 'agree', via: null,
    }
    const { getByTestId, queryByText } = render(<LineupTable starters={[starter]} bench={[]} startSit={{ flags: [flag] }} />)
    expect(queryByText('Chase White')).toBeNull() // not a row in the fixture
    expect(starter.points).toBe(8.7)
    const el = getByTestId('startsit-flag')
    expect(el.id).toBe('startsit-flag-0')
    for (const t of ['9.8', '8.7', 'Chase White', 'OURS 9.6 vs 7.8', 'PROJ and OURS agree']) expect(el.textContent).toContain(t)
  })

  it('T12b a swap flag shows both moves with their numbers', () => {
    const starter = row({ slot: 'WR', player_id: 'w', name: 'Wes Low', position: 'WR', points: 4.0 })
    const flag = {
      slotIndex: 0, slot: 'WR', kind: 'higher', cause: null, status: null, starterProj: 4.0, starterOurs: null,
      bench: { id: 'r', name: 'Ron Bench', proj: 8.0, ours: null }, ours: null,
      via: { moveId: 'm', moveName: 'Max High', moveProj: 12.0, fromSlot: 'FLEX', fromSlotIndex: 1, toSlot: 'WR' },
    }
    const { getByTestId } = render(<LineupTable starters={[starter]} bench={[]} startSit={{ flags: [flag] }} />)
    expect([starter.name]).not.toContain('Max High') // neither moving starter nor bench player is a fixture row
    expect([starter.name]).not.toContain('Ron Bench')
    const t = getByTestId('startsit-flag').textContent
    for (const x of ['two moves', 'Max High 12.0 FLX → WR', 'Ron Bench 8.0 bench → FLX', '8.0 > 4.0']) expect(t).toContain(x)
  })

  it('T12c unavailable flags lead with their cause (bye, status, no-proj swap)', () => {
    const starters = [
      row({ slot: 'WR', player_id: 'a', name: 'Aa' }),
      row({ slot: 'WR', player_id: 'b', name: 'Bb' }),
      row({ slot: 'WR', player_id: 'c', name: 'Cc' }),
    ]
    const mkFlag = (slotIndex, over) => ({
      slotIndex, slot: 'WR', kind: 'unavailable', cause: 'bye', status: null, starterProj: null, starterOurs: null,
      bench: { id: 'b' + slotIndex, name: 'Bench' + slotIndex, proj: 7.5, ours: null }, ours: null, via: null, ...over,
    })
    const flags = [
      mkFlag(0, { cause: 'bye' }),
      mkFlag(1, { cause: 'status', status: 'Doubtful' }),
      mkFlag(2, {
        cause: 'no-proj',
        via: { moveId: 'm', moveName: 'Max High', moveProj: 12.0, fromSlot: 'FLEX', fromSlotIndex: 3, toSlot: 'WR' },
      }),
    ]
    const { getAllByTestId } = render(<LineupTable starters={starters} bench={[]} startSit={{ flags }} />)
    const els = getAllByTestId('startsit-flag')
    const byId = i => els.find(e => e.id === `startsit-flag-${i}`).textContent
    expect(byId(0).startsWith('BYE \u00b7 ')).toBe(true)
    expect(byId(0)).toContain('Bench0 7.5 PROJ on bench')
    expect(byId(1).startsWith('Doubtful \u00b7 ')).toBe(true)
    expect(byId(1)).toContain('Bench1 7.5 PROJ on bench')
    const t2 = byId(2)
    expect(t2.startsWith('No PROJ \u00b7 two moves: ')).toBe(true)
    for (const x of ['Max High 12.0', 'Bench2 7.5']) expect(t2).toContain(x)
  })

  it('T14 legendLead renders inside the legend', () => {
    const { getByTestId } = render(<LineupTable starters={[]} bench={[]} legendLead={<div data-testid="lead">x</div>} />)
    expect(getByTestId('lineup-legend')).toContainElement(getByTestId('lead'))
  })
})
