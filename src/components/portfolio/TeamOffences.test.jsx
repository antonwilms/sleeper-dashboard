// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { TeamOffences } from './TeamOffences'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const baseRow = (over = {}) => ({
  team: 'DET', name: 'Detroit Lions', hasStarter: true,
  players: [
    { playerId: 'p1', name: 'Sam LaPorta', position: 'TE', starter: true },
    { playerId: 'p2', name: 'Jahmyr Gibbs', position: 'RB', starter: false },
  ],
  pointsPerGame: 28.3, ptsRank: 5,
  pointsAllowedPerGame: 24.3, marginPerGame: 4,
  epaPerPlay: 0.123, epaRank: 5,
  proe: 0.028, proeRank: 5,
  playsPerGame: 63.4, rzTripsPerGame: 3.76,
  defEpaPerPlay: -0.05, defRank: 20,
  qb: { name: 'Jared Goff', epaPerAtt: 0.184, rank: 6 },
  sos: [{ position: 'TE', rank: 12 }],
  script: { margin: 'even', tempo: 'pass-heavy', label: 'even · pass-heavy' },
  ...over,
})

const nullRow = () => ({
  team: 'CHI', name: 'Chicago Bears', hasStarter: true, players: [],
  pointsPerGame: null, ptsRank: null, pointsAllowedPerGame: null, marginPerGame: null,
  epaPerPlay: null, epaRank: null, proe: null, proeRank: null, playsPerGame: null,
  rzTripsPerGame: null, defEpaPerPlay: null, defRank: null, qb: null, sos: [], script: null,
})

const renderRows = (rows, props = {}) =>
  render(<TeamOffences rows={rows} dataSeason={2025} sosSeason={2026} rankedTeamCount={32} {...props} />)

const cell = (team, id) => screen.getByTestId(`offence-${team}`).querySelector(`[data-testid="${id}"]`)

describe('TeamOffences — content', () => {
  it('renders team, name, chips (last names, starter vs bench styling) and every numeric cell', () => {
    renderRows([baseRow()])
    const tr = screen.getByTestId('offence-DET')
    expect(tr.textContent).toContain('DET')
    expect(tr.textContent).toContain('Detroit Lions')
    const starter = screen.getByText('LaPorta')
    const bench = screen.getByText('Gibbs')
    expect(starter.className).toContain('text-dp-up-text')
    expect(starter.className).toContain('bg-dp-up-bg')
    expect(bench.className).toContain('text-dp-text-5')
    expect(bench.className).not.toContain('bg-dp-up-bg')
    expect(cell('DET', 'offence-pts').textContent).toBe('28.3')
    expect(cell('DET', 'offence-allowed').textContent).toBe('24.3')
    expect(cell('DET', 'offence-margin').textContent).toBe('+4.0')
    expect(cell('DET', 'offence-epa').textContent).toBe('+0.123')
    expect(cell('DET', 'offence-proe').textContent).toBe('+2.8%')
    expect(cell('DET', 'offence-plays').textContent).toBe('63.4')
    expect(cell('DET', 'offence-rz').textContent).toBe('3.76')
    expect(cell('DET', 'offence-def').textContent).toBe('−0.050')
    expect(cell('DET', 'offence-qb').textContent).toContain('Jared Goff')
    expect(cell('DET', 'offence-qb').textContent).toContain('+0.184')
    expect(cell('DET', 'offence-sos').textContent).toContain('TE')
    expect(cell('DET', 'offence-sos').textContent).toContain('12th')
    expect(tr.getAttribute('title')).toBe('even · pass-heavy')
  })

  it('header meta reports the ranked-team count actually passed, not a literal 32', () => {
    renderRows([baseRow()], { rankedTeamCount: 30 })
    expect(screen.getByTestId('team-offences').textContent).toContain('teamContext · 30 TEAMS')
  })

  it('a row with every metric null renders — in each cell and does not throw', () => {
    renderRows([nullRow()])
    for (const id of ['offence-pts', 'offence-allowed', 'offence-margin', 'offence-epa', 'offence-proe',
      'offence-plays', 'offence-rz', 'offence-def', 'offence-qb', 'offence-sos']) {
      expect(cell('CHI', id).textContent).toBe('—')
    }
  })

  it('a passer with a name but no EPA (under the attempt floor) renders the name with —', () => {
    renderRows([baseRow({ qb: { name: 'Backup Guy', epaPerAtt: null, rank: null } })])
    expect(cell('DET', 'offence-qb').textContent).toContain('Backup Guy')
    expect(cell('DET', 'offence-qb').textContent).toContain('—')
  })
})

describe('TeamOffences — rank colouring at the boundaries (rankedTeamCount 32)', () => {
  const ptsClass = rank => {
    renderRows([baseRow({ ptsRank: rank })])
    const cls = cell('DET', 'offence-pts').querySelector('span').className
    cleanup()
    return cls
  }
  it('PTS/G: rank 8 is blue and 9 is not; rank 24 is not amber and 25 is', () => {
    expect(ptsClass(8)).toContain('text-dp-up-text')
    expect(ptsClass(9)).not.toContain('text-dp-up-text')
    expect(ptsClass(24)).not.toContain('text-dp-down-text')
    expect(ptsClass(25)).toContain('text-dp-down-text')
  })

  const sosClass = rank => {
    renderRows([baseRow({ sos: [{ position: 'WR', rank }] })])
    const cls = screen.getByTestId('sos-WR').className
    cleanup()
    return cls
  }
  it('SOS is inverted: rank 8 (hardest) is amber, 9 is not; 24 is not blue, 25 is', () => {
    expect(sosClass(8)).toContain('text-dp-down-text')
    expect(sosClass(9)).not.toContain('text-dp-down-text')
    expect(sosClass(24)).not.toContain('text-dp-up-text')
    expect(sosClass(25)).toContain('text-dp-up-text')
  })

  it('DEF EPA ALL is inverted: rank 25+ (stingiest) is blue, rank 8 is amber', () => {
    const defClass = rank => {
      renderRows([baseRow({ defRank: rank })])
      const cls = cell('DET', 'offence-def').querySelector('span').className
      cleanup()
      return cls
    }
    expect(defClass(25)).toContain('text-dp-up-text')
    expect(defClass(8)).toContain('text-dp-down-text')
  })

  it('rankedTeamCount drives the amber edge: with 16 ranked teams rank 9 is amber and rank 8 is not', () => {
    const at = rank => {
      renderRows([baseRow({ ptsRank: rank })], { rankedTeamCount: 16 })
      const cls = cell('DET', 'offence-pts').querySelector('span').className
      cleanup()
      return cls
    }
    expect(at(9)).toContain('text-dp-down-text')
    expect(at(8)).not.toContain('text-dp-down-text')
  })
})

describe('TeamOffences — MARGIN is deliberately uncoloured', () => {
  for (const m of [10, -10, 0]) {
    it(`margin ${m} carries neither the up nor the down colour class`, () => {
      renderRows([baseRow({ marginPerGame: m })])
      const td = cell('DET', 'offence-margin')
      const value = td.querySelector('span')
      expect(value.className).toContain('text-dp-text')
      expect(`${td.className} ${value.className}`).not.toMatch(/text-dp-up|text-dp-down/)
    })
  }
})

describe('TeamOffences — expander', () => {
  const rows = [baseRow(), baseRow({ team: 'CHI', name: 'Chicago Bears', hasStarter: false })]

  it('collapsed shows only starter teams; clicking show all N → reveals the rest', () => {
    renderRows(rows)
    expect(screen.queryByTestId('offence-CHI')).not.toBeInTheDocument()
    fireEvent.click(screen.getByText('show all 2 →'))
    expect(screen.getByTestId('offence-CHI')).toBeInTheDocument()
    expect(screen.getByText('show fewer ←')).toBeInTheDocument()
  })

  it('with every row hasStarter the button is absent from the DOM', () => {
    renderRows([baseRow(), baseRow({ team: 'CHI', name: 'Chicago Bears' })])
    expect(screen.queryByTestId('offences-toggle')).not.toBeInTheDocument()
  })
})

describe('TeamOffences — PTS/G bar', () => {
  it('is a div (not a span) with a non-zero inline width', () => {
    renderRows([baseRow({ pointsPerGame: 28 })])
    const bar = screen.getByTestId('pts-bar')
    expect(bar.tagName).toBe('DIV')
    expect(bar.style.width).toBe('45px') // round(((28 − 16) / 16) × 60)
  })
})
