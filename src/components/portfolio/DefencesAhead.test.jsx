// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { DefencesAhead } from './DefencesAhead'

expect.extend(jestDomMatchers)
afterEach(cleanup)

// A row as buildDefencesAhead returns it (rows arrive pre-filtered, so there is no empty-slot case here — U5).
function aheadRow(overrides = {}) {
  return {
    slot: 'RB', player_id: 'p1', name: 'Player One', position: 'RB', team: 'KC',
    opponent: 'DEN', opponentEra: 'DEN', bye: false,
    allows: 18.4, allowsRank: 2, weight: 0.6, notBlended: false,
    prior: null, current: null, yardsPrior: null, yardsCurrent: null, recPrior: null, recCurrent: null,
    ahead: [],
    ...overrides,
  }
}
const yards = (pass, rush) => ({ pass, rush })
const TONES = ['text-dp-up-text', 'text-dp-up', 'text-dp-down-text', 'text-dp-down', 'text-dp-text']

describe('DefencesAhead — part (a)', () => {
  it('C1 renders every metric, the label line, the rank text and the k chip', () => {
    const { getByTestId, container } = render(<DefencesAhead rows={[aheadRow({ prior: 15, current: 13, weight: 0.25, allows: 14.5 })]} currentWeek={4} liveSeason={2026} />)
    expect(getByTestId('ahead-prior').textContent).toContain('15.0')
    expect(getByTestId('ahead-current').textContent).toContain('13.0')
    expect(getByTestId('ahead-blended').textContent).toContain('14.5')
    expect(getByTestId('ahead-blended').textContent).toContain('25%')
    expect(getByTestId('ahead-label').textContent).toBe('allowed to all RBs / G')
    expect(getByTestId('ahead-rank').textContent).toBe('2 of 32')
    const header = container.querySelector('.border-b')
    expect(header.textContent).not.toMatch(/\d+%/)
    expect(header.textContent).toContain('k 3')
    expect(header.textContent).toContain('Defences ahead')
    expect(header.textContent).toContain('Week 4 · 2026 · your starting ten')
  })

  it('C1b halves absent -> —; the row still renders', () => {
    const { getByTestId } = render(<DefencesAhead rows={[aheadRow()]} currentWeek={4} liveSeason={2026} />)
    expect(getByTestId('ahead-prior').textContent).toContain('—')
    expect(getByTestId('ahead-current').textContent).toContain('—')
    expect(getByTestId('ahead-row-p1')).toBeInTheDocument()
  })

  it('C2 VS cell: logo + bare code, BYE, —, Rams lar.png; a bye row is — in every number cell', () => {
    const { getByTestId, rerender } = render(<DefencesAhead rows={[aheadRow()]} currentWeek={4} liveSeason={2026} />)
    let vs = getByTestId('ahead-vs')
    expect(vs.querySelector('[data-testid="team-logo"]').getAttribute('src')).toMatch(/\/den\.png$/)
    expect(vs.textContent).toBe('DEN')

    rerender(<DefencesAhead rows={[aheadRow({ opponent: 'LAR', opponentEra: 'LA' })]} currentWeek={4} liveSeason={2026} />)
    const src = getByTestId('ahead-vs').querySelector('[data-testid="team-logo"]').getAttribute('src')
    expect(src).toMatch(/\/lar\.png$/)
    expect(src).not.toMatch(/\/la\.png$/)
    expect(getByTestId('ahead-row-p1').textContent).toContain('LAR')

    rerender(<DefencesAhead rows={[aheadRow({ bye: true, opponent: null, opponentEra: null, allows: null, allowsRank: null, weight: null })]} currentWeek={4} liveSeason={2026} />)
    vs = getByTestId('ahead-vs')
    expect(vs.textContent).toBe('BYE')
    expect(vs.querySelector('[data-testid="team-logo"]')).toBeNull()
    for (const id of ['ahead-pass', 'ahead-rush', 'ahead-record']) expect(getByTestId(id).textContent).toBe('——')

    rerender(<DefencesAhead rows={[aheadRow({ opponent: null, opponentEra: null })]} currentWeek={4} liveSeason={2026} />)
    vs = getByTestId('ahead-vs')
    expect(vs.textContent).toBe('—')
    expect(vs.querySelector('[data-testid="team-logo"]')).toBeNull()
  })

  it('C3 weight 1: prior shown muted and labelled "not blended"', () => {
    const { getByTestId, getByText } = render(<DefencesAhead rows={[aheadRow({ prior: 15, current: 18, weight: 1, notBlended: true })]} currentWeek={12} liveSeason={2026} />)
    expect(getByTestId('ahead-prior').textContent).toContain('15.0')
    expect(getByText('not blended')).toBeInTheDocument()
  })

  it('C4 bands tone BLENDED and RANK only, by exact class token', () => {
    const bands = [[27, 'text-dp-up-text'], [23, 'text-dp-up'], [6, 'text-dp-down-text'], [10, 'text-dp-down'], [15, 'text-dp-text']]
    const rows = bands.map(([rank], i) => aheadRow({ player_id: `r${i}`, allowsRank: rank, prior: 15, current: 13, yardsPrior: yards(200, 100), yardsCurrent: yards(210, 110) }))
    const { getByTestId } = render(<DefencesAhead rows={rows} currentWeek={4} liveSeason={2026} />)
    bands.forEach(([, want], i) => {
      const value = getByTestId(`ahead-row-r${i}`).querySelector('[data-testid="ahead-blended"] span')
      for (const t of TONES) expect(value.classList.contains(t)).toBe(t === want)
    })
    const rank23 = getByTestId('ahead-row-r1').querySelector('[data-testid="ahead-rank"]')
    expect(rank23.classList.contains('text-dp-up')).toBe(true)
    expect(rank23.classList.contains('text-dp-up-text')).toBe(false)
    const toned = el => TONES.slice(0, 4).some(t => el.classList.contains(t))
    for (const id of ['ahead-prior', 'ahead-pass']) {
      const cell = getByTestId('ahead-row-r0').querySelector(`[data-testid="${id}"]`)
      expect([cell, ...cell.querySelectorAll('*')].some(toned)).toBe(false)
    }
  })

  it('C5 pass / rush: current on top, prior below with its season, whole yards', () => {
    const { getByTestId } = render(<DefencesAhead rows={[aheadRow({ yardsPrior: yards(196, 106), yardsCurrent: yards(178, 100) })]} currentWeek={4} liveSeason={2026} priorSeason={2025} currentSeason={2026} />)
    const pass = getByTestId('ahead-pass')
    expect(pass.children[0].textContent).toBe('178')
    expect(pass.children[1].textContent).toBe('2025 · 196')
    const rush = getByTestId('ahead-rush')
    expect(rush.children[0].textContent).toBe('100')
    expect(rush.children[1].textContent).toBe('2025 · 106')
  })

  it('C6 record: W-L, W-L-T only on a tie; "thru wk N" only when trailing; "no wk scored", never 0-0', () => {
    const rec = (w, l, t, lastWeek, unscored) => ({ w, l, t, lastWeek, unscored })
    const { getByTestId, rerender } = render(<DefencesAhead rows={[aheadRow({ recCurrent: rec(2, 1, 1, 4, 0), recPrior: rec(6, 11, 0, 18, 0) })]} currentWeek={5} liveSeason={2026} />)
    expect(getByTestId('ahead-record').children[0].textContent).toBe('2-1-1')
    expect(getByTestId('ahead-record').children[1].textContent).toBe('6-11')
    expect(getByTestId('ahead-record').textContent).not.toContain('thru wk')

    rerender(<DefencesAhead rows={[aheadRow({ recCurrent: rec(2, 0, 0, 2, 1) })]} currentWeek={5} liveSeason={2026} />)
    expect(getByTestId('ahead-record').textContent).toContain('2-0 thru wk 2')

    rerender(<DefencesAhead rows={[aheadRow({ recCurrent: rec(0, 0, 0, 0, 2) })]} currentWeek={5} liveSeason={2026} />)
    expect(getByTestId('ahead-record').textContent).toContain('no wk scored')
    expect(getByTestId('ahead-record').textContent).not.toContain('0-0')
  })

  it('C7 season order: header names only the current season, the grey line the prior, a — prior stays —', () => {
    const { getByTestId, container } = render(<DefencesAhead rows={[aheadRow({ yardsPrior: yards(240, 106), yardsCurrent: yards(178, 100) })]} currentWeek={4} liveSeason={2026} priorSeason={2025} currentSeason={2026} />)
    const th = [...container.querySelectorAll('thead th')].find(t => t.textContent.startsWith('PASS YD/G'))
    expect(th.children[1].textContent).toBe('2026')
    expect(th.textContent).not.toContain('2026 · 2025')
    expect(getByTestId('ahead-pass').children[1].textContent).toBe('2025 · 240')
    expect(getByTestId('ahead-record').children[1].textContent).toBe('—')
  })

  it('C8 failed weeks: one footer line per season, singular/plural; none -> no line', () => {
    const { getAllByTestId, queryAllByTestId, rerender } = render(<DefencesAhead rows={[aheadRow()]} currentWeek={4} liveSeason={2026}
      failedWeeks={[{ season: 2025, weeks: [4] }, { season: 2026, weeks: [1, 2] }]} />)
    expect(getAllByTestId('ahead-failed-weeks').map(n => n.textContent)).toEqual([
      'Week 4 of 2025 failed to load from Sleeper and is left out of these figures.',
      'Weeks 1, 2 of 2026 failed to load from Sleeper and are left out of these figures.',
    ])
    rerender(<DefencesAhead rows={[aheadRow()]} currentWeek={4} liveSeason={2026} failedWeeks={[]} />)
    expect(queryAllByTestId('ahead-failed-weeks')).toEqual([])
  })

  it('C8b footer carries the band sentence', () => {
    const { getByTestId } = render(<DefencesAhead rows={[aheadRow()]} currentWeek={4} liveSeason={2026} />)
    expect(getByTestId('defences-ahead').textContent).toMatch(/coloured in the same bands as This week.s ALLOWED \/ G: ranks 23–32 allow the most, ranks 1–10 the fewest\./)
  })
})

describe('DefencesAhead — part (b)', () => {
  const cells = [
    { week: 5, status: 'game', opponent: 'GB', opponentEra: 'GB', allows: 21, allowsRank: 30 },
    { week: 6, status: 'bye', opponent: null, opponentEra: null, allows: null, allowsRank: null },
    { week: 7, status: 'unknown', opponent: null, opponentEra: null, allows: null, allowsRank: null },
  ]

  it('C9 schedule table: ascending headers, game / BYE / — cells, banded numbers; empty states keep part (a)', () => {
    const { getByTestId, queryByTestId, container, rerender } = render(<DefencesAhead rows={[aheadRow({ ahead: cells })]} weeks={[5, 6, 7]} currentWeek={4} liveSeason={2026} scheduleLoaded />)
    const heads = [...getByTestId('ahead-schedule').querySelectorAll('[data-testid^="ahead-wk-head-"]')].map(t => t.textContent)
    expect(heads).toEqual(['WK 5', 'WK 6', 'WK 7'])
    expect(getByTestId('defences-ahead').textContent).toContain('Rest of season · WK 5–7')
    const wk5 = getByTestId('ahead-sched-p1').querySelector('[data-testid="ahead-wk-5"]')
    expect(wk5.textContent).toBe('GB21.0')
    expect(wk5.querySelector('.text-dp-up-text')).not.toBeNull()
    expect(getByTestId('ahead-sched-p1').querySelector('[data-testid="ahead-wk-6"]').textContent).toBe('BYE')
    expect(getByTestId('ahead-sched-p1').querySelector('[data-testid="ahead-wk-7"]').textContent).toBe('—')

    rerender(<DefencesAhead rows={[aheadRow()]} weeks={[]} currentWeek={4} liveSeason={2026} scheduleLoaded={false} />)
    expect(queryByTestId('ahead-schedule')).toBeNull()
    expect(container.textContent).toContain('No 2026 schedule is loaded, so the weeks ahead are not shown.')
    expect(getByTestId('ahead-row-p1')).toBeInTheDocument()

    rerender(<DefencesAhead rows={[aheadRow()]} weeks={[]} currentWeek={18} liveSeason={2026} scheduleLoaded />)
    expect(queryByTestId('ahead-schedule')).toBeNull()
    expect(container.textContent).toContain('No regular-season weeks remain.')
  })

  it('C10 no percentile palette or inline colour anywhere in the card', () => {
    const { getByTestId } = render(<DefencesAhead rows={[aheadRow({ prior: 15, current: 13, ahead: cells })]} weeks={[5, 6, 7]} currentWeek={4} liveSeason={2026} scheduleLoaded />)
    const all = [getByTestId('defences-ahead'), ...getByTestId('defences-ahead').querySelectorAll('*')]
    for (const el of all) {
      expect(String(el.getAttribute('class') ?? '')).not.toMatch(/dp-scale-/)
      expect(el.style.color).toBe('')
      expect(el.style.background).toBe('')
      expect(el.style.backgroundColor).toBe('')
    }
  })
})
