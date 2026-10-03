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
    // Last <td> of each data row is the PROJ cell — target it directly so the ALLOWS column's own
    // unconditional `—` (allows: null on both fixture rows) can't make this pass spuriously.
    const dataRows = [...container.querySelectorAll('tbody tr')].filter(tr => tr.textContent.includes('Unprojected') || tr.textContent.includes('Real Zero'))
    const projCellFor = name => dataRows.find(tr => tr.textContent.includes(name)).querySelector('td:last-child').textContent
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
    expect(queryByText('— · 30%')).toBeInTheDocument() // the RUSH main value itself renders fine
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
  return container.querySelectorAll('thead tr:nth-child(2) th').length
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
    // cells: slot, player, VS, ALLOWS, RUSH, TARGET, TOUCH, RZ RUSH, RZ TGT, SNAP, LAST 3, OURS, PROJ
    expect(tds(0)[4].textContent).toBe('22 · 37%')
    expect(tds(0)[7].textContent).toBe('4 · 50%')
    expect(tds(1)[4].textContent).toBe('—')
    expect(tds(1)[7].textContent).toBe('—')
    expect(tds(2)[7].textContent).toBe('0 · —')
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
    return { tds, ours: tds[11], proj: tds[12] }
  }

  it('a valued row renders the number, `imp 26.0 · +2.0` and the full tooltip; PROJ stays the last cell', () => {
    const { ours, proj, tds } = cellFor({ value: 14.791666, reason: null, base: 14.2, baseKind: 'ros', status: null, vegas })
    expect(ours.textContent).toBe('14.8imp 26.0 · +2.0')
    expect(ours.querySelector('[data-testid="own-implied"]').textContent).toBe('imp 26.0 · +2.0')
    expect(ours.getAttribute('title')).toMatch(/^Rest-of-season projection 14\.2 PPG × 1\.04 = 14\.8\./)
    expect(ours.getAttribute('title')).toContain('over 3 earlier 2026 games with a line (24.0)')
    expect(proj).toBe(tds[tds.length - 1])
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
