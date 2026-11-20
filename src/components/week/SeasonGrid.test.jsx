// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, cleanup } from '@testing-library/react'
import { SeasonGrid } from './SeasonGrid'
import { buildRegWeekIndex } from '../../utils/weeklySchedule'
import { buildSeasonGrid, buildGridGroups } from '../../utils/weeklySeasonGrid'
import { scaleCss, relativeLuminance } from '../../utils/percentileColour'

expect.extend(jestDomMatchers)
afterEach(cleanup)

function game(week, homeTeam, awayTeam) {
  return { week, gameType: 'REG', homeTeam, awayTeam, homeScore: null, awayScore: null }
}

function starterRow(id, name, team = 'KC', position = 'WR') {
  return { slot: 'QB', player_id: id, name, team, position, opponent: null, opponentEra: null, bye: false, allows: null, allowsRank: null, weight: null, usage: null, points: null }
}

function reservePlayer(id, name, team = 'KC') {
  return { id, full_name: name, position: 'RB', team, age: null }
}

// W2b-3 — SeasonGrid renders the hook's grid prop; build it here the way the hook does.
function renderSeasonGrid({
  starters = [], bench = [], reserve = [], weeklyMaps = [], failedWeeks = [],
  scheduleIndex = null, projections = {}, scoringSettings = {}, currentWeek = 0, percentileBasis = null,
}) {
  const grid = buildSeasonGrid({
    groups: buildGridGroups({ starters, bench, reserve }),
    weeklyMaps, failedWeeks, scheduleIndex, projections, scoringSettings, currentWeek,
  })
  return render(<SeasonGrid grid={grid} percentileBasis={percentileBasis} />)
}

describe('SeasonGrid', () => {
  const schedule = buildRegWeekIndex({ games: [game(1, 'KC', 'DEN'), game(2, 'KC', 'DEN')] })

  it('renders three groups, in order, with dividers', () => {
    const starters = [starterRow('p1', 'Starter One')]
    const bench = [{ ...starterRow('p2', 'Bench One'), slot: 'BN' }]
    const reserve = [reservePlayer('p3', 'IR One')]
    const { getByText, container } = renderSeasonGrid({ starters, bench, reserve, weeklyMaps: [], failedWeeks: [], scheduleIndex: schedule, currentWeek: 1 })
    expect(getByText('STARTERS')).toBeInTheDocument()
    expect(getByText('BENCH')).toBeInTheDocument()
    expect(getByText('IR')).toBeInTheDocument()

    const labels = [...container.querySelectorAll('td')].map(td => td.textContent).filter(t => ['STARTERS', 'BENCH', 'IR'].includes(t))
    expect(labels).toEqual(['STARTERS', 'BENCH', 'IR'])
  })

  it('an empty group omits its divider', () => {
    const starters = [starterRow('p1', 'Starter One')]
    const { queryByText } = renderSeasonGrid({ starters, bench: [], reserve: [], weeklyMaps: [], failedWeeks: [], scheduleIndex: schedule, currentWeek: 1 })
    expect(queryByText('BENCH')).toBeNull()
    expect(queryByText('IR')).toBeNull()
  })

  it('unknown renders with no glyph (neither — nor dashed)', () => {
    const starters = [starterRow('p1', 'Starter One', 'KC')]
    const { getByTestId } = renderSeasonGrid({ starters, bench: [], reserve: [], weeklyMaps: [], failedWeeks: [], scheduleIndex: null, currentWeek: 2 })
    const cell = getByTestId('grid-cell-p1-1')
    expect(cell.getAttribute('data-kind')).toBe('unknown')
    expect(cell.textContent.trim()).toBe('')
  })

  const rampValues = [...Array.from({ length: 100 }, (_, i) => i), 200]
  const ready = (basis, extra = {}) => ({ status: 'ready', basis, needsPrior: false, liveSeason: 2026, priorSeason: 2025, ...extra })
  const liveWr = values => ({ WR: { values, n: values.length, season: 2026, source: 'live' } })
  const renderGrid = (weeklyMaps, percentileBasis, { sched = schedule, currentWeek = 3, scoring = { pass_yd: 1 } } = {}) => renderSeasonGrid({
    starters: [starterRow('p1', 'Starter One', 'KC', 'WR')], weeklyMaps, failedWeeks: [],
    scheduleIndex: sched, scoringSettings: scoring, currentWeek, percentileBasis,
  })
  const played = (pass_yd) => ({ stats: { gp: 1, pass_yd }, team: 'KC' })
  const lum = el => {
    const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(el.style.backgroundColor)
    return relativeLuminance({ r: +m[1], g: +m[2], b: +m[3] })
  }

  it('T17 played cell is coloured by its percentile in the basis, not by the grid max, with ink, title and all-live basis line', () => {
    const { getByTestId } = renderGrid(
      [{ week: 1, rows: { p1: played(90) } }, { week: 2, rows: { p1: played(5) } }],
      ready(liveWr(rampValues)),
    )
    const hi = getByTestId('grid-cell-p1-1')
    const lo = getByTestId('grid-cell-p1-2')
    expect(hi.firstElementChild.style.backgroundColor).toBe(scaleCss(90.5 / 101))
    expect(hi.getAttribute('data-pct')).toBe('90')
    expect(lo.getAttribute('data-pct')).toBe('5')
    expect(lum(lo.firstElementChild)).toBeLessThan(lum(hi.firstElementChild))
    expect(hi.firstElementChild.style.color).toBe('rgb(0, 0, 0)')
    expect(lo.firstElementChild.style.color).toBe('rgb(255, 255, 255)')
    expect(hi.firstElementChild.getAttribute('title')).toBe('90.0 pts · 90th pct of WR starters (2026)')
    expect(getByTestId('legend-basis').textContent).toBe('Basis: 2026 league starters')
  })

  it('T18 a 0-point played cell stays filled at the bottom stop, no opacity', () => {
    const { getByTestId } = renderGrid(
      [{ week: 1, rows: { p1: played(0) } }],
      ready(liveWr(Array.from({ length: 100 }, (_, i) => i + 1))),
    )
    const fill = getByTestId('grid-cell-p1-1').firstElementChild
    expect(fill.style.backgroundColor).toBe('rgb(42, 27, 77)')
    expect(fill.style.opacity).toBe('')
  })

  it('T19 dnp = solid red class, no text, labelled', () => {
    const { getByTestId } = renderGrid([], ready(liveWr(rampValues)), { currentWeek: 3 })
    const td = getByTestId('grid-cell-p1-1')
    expect(td.getAttribute('data-kind')).toBe('dnp')
    const fill = td.firstElementChild
    expect(fill.className).toContain('bg-dp-missed')
    expect(td.textContent).toBe('')
    expect(fill.getAttribute('aria-label')).toBe('Did not play')
    expect(fill.getAttribute('title')).toBe('Did not play')
    expect(fill.style.backgroundColor).toBe('')
  })

  it('T20 bye = hatch, not a scale fill', () => {
    const byeSched = buildRegWeekIndex({ games: [game(1, 'MIA', 'NYJ'), game(2, 'KC', 'DEN')] }) // week 1 exists, KC absent
    const { getByTestId } = renderGrid([], ready(liveWr(rampValues)), { sched: byeSched, currentWeek: 3 })
    const td = getByTestId('grid-cell-p1-1')
    expect(td.getAttribute('data-kind')).toBe('bye')
    const fill = td.firstElementChild
    expect(fill.className).toContain('bg-dp-bye-hatch')
    expect(td.textContent).toBe('')
    expect(fill.getAttribute('aria-label')).toBe('Bye')
    expect(fill.style.backgroundColor).toBe('')
  })

  it('T21 ready but no basis -> neutral chip, title says no basis', () => {
    const { getByTestId } = renderGrid([{ week: 1, rows: { p1: played(20) } }], ready({ WR: null }, { needsPrior: true }))
    const fill = getByTestId('grid-cell-p1-1').firstElementChild
    expect(fill.className).toContain('bg-dp-chip')
    expect(fill.style.backgroundColor).toBe('')
    expect(fill.getAttribute('title')).toContain('no WR basis yet')
  })

  it('T22 season total cell rounds points and counts played games; no played week -> —', () => {
    const { getByTestId } = renderSeasonGrid({
      starters: [starterRow('p1', 'One', 'KC', 'WR'), starterRow('p2', 'Two', 'KC', 'WR')],
      weeklyMaps: [
        { week: 1, rows: { p1: { stats: { gp: 1, pass_yd: 260 }, team: 'KC' } } },
        { week: 2, rows: { p1: { stats: { gp: 1, pass_yd: 505 }, team: 'KC' } } },
      ],
      failedWeeks: [], scheduleIndex: schedule, scoringSettings: { pass_yd: 0.04 }, currentWeek: 3, percentileBasis: ready(liveWr(rampValues)),
    })
    expect(getByTestId('grid-total-p1').textContent).toBe('31 · 2')
    expect(getByTestId('grid-total-p2').textContent).toBe('—')
  })

  it('T23 legend prints the 20/40/60/80 cut-offs per position and names each basis season', () => {
    const { getByTestId } = renderGrid([], ready({
      QB: { values: Array.from({ length: 11 }, (_, i) => i + 1), n: 11, season: 2026, source: 'live' },
      RB: null, WR: null,
      TE: { values: Array.from({ length: 11 }, (_, i) => i + 1), n: 11, season: 2025, source: 'prior' },
    }, { needsPrior: true }))
    expect(getByTestId('legend-cutoffs-QB').textContent).toBe('QB: 3 / 5 / 7 / 9 pts')
    expect(getByTestId('legend-cutoffs-TE').textContent.endsWith('· 2025')).toBe(true)
    expect(getByTestId('legend-cutoffs-RB').textContent).toBe('RB: no basis yet')
    expect(getByTestId('legend-basis').textContent).toBe('Basis: 2026 league starters; TE use 2025 until 60 starter-weeks')
  })

  it('T23b legend basis variants: all-prior and all-null', () => {
    const vals = Array.from({ length: 11 }, (_, i) => i + 1)
    const prior = () => ({ values: vals, n: 11, season: 2025, source: 'prior' })
    const a = renderGrid([], ready({ QB: prior(), RB: prior(), WR: prior(), TE: prior() }, { needsPrior: true }))
    expect(a.getByTestId('legend-basis').textContent).toBe('Basis: 2025 league starters (2026 has fewer than 60 starter-weeks per position)')
    cleanup()
    const b = renderGrid([], ready({ QB: null, RB: null, WR: null, TE: null }, { needsPrior: true }))
    expect(b.getByTestId('legend-basis').textContent).toBe('No league-starter basis yet')
  })

  it('T23c pending basis renders as loading, not as "no basis"', () => {
    const { getByTestId, queryByTestId } = renderGrid([{ week: 1, rows: { p1: played(20) } }], { status: 'pending', basis: {}, needsPrior: false })
    expect(getByTestId('legend-basis').textContent).toBe('Loading the league-starter basis…')
    expect(queryByTestId('legend-cutoffs-QB')).toBeNull()
    const fill = getByTestId('grid-cell-p1-1').firstElementChild
    expect(fill.className).toContain('bg-dp-chip')
    expect(fill.getAttribute('title')).not.toMatch(/no .* basis/)
  })
})
