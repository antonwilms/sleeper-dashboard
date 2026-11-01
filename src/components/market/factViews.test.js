import { describe, it, expect } from 'vitest'
import {
  FACT_VIEW_COLUMNS, FACT_VIEWS, FACT_DEFAULT_SORT, factDefaultSort, advancedCaption, factColumns, factSortableKeys, factCellValue, factCellRank,
  prevWindowFor, rankOptionsFor, snapCoverageIncomplete,
} from './factViews'
import { METRIC_BY_ID } from '../../utils/marketMetrics'

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'ALL']

describe('descriptors', () => {
  it('every column is a valid metric column or value column, with unique ids', () => {
    for (const view of FACT_VIEWS) {
      for (const pos of POSITIONS) {
        const cols = FACT_VIEW_COLUMNS[view][pos]
        expect(cols, `${view}/${pos}`).toBeTruthy()
        expect(new Set(cols.map(c => c.id)).size).toBe(cols.length)
        for (const c of cols) {
          expect(['asc', 'desc']).toContain(c.defaultSortDir)
          if (c.metricId) expect(METRIC_BY_ID[c.metricId]).toBeTruthy()
          else {
            expect(typeof c.value).toBe('function')
            expect(typeof c.format).toBe('function')
          }
        }
      }
    }
  })
  it('every metric column under a single-position pill ranks that position, in both stats modes', () => {
    for (const view of FACT_VIEWS) {
      for (const pos of ['QB', 'RB', 'WR', 'TE']) {
        for (const statsMode of ['totals', 'perGame']) {
          for (const c of factColumns(view, pos, { statsMode }).filter(x => x.metric)) {
            expect(c.metric.positions, `${view}/${pos}/${statsMode}/${c.id}`).toContain(pos)
          }
        }
      }
    }
  })
  it('KTC and Dynasty are muted and appear on overview only', () => {
    for (const view of FACT_VIEWS) {
      for (const pos of POSITIONS) {
        const ids = factColumns(view, pos).filter(c => c.muted).map(c => c.id)
        expect(ids).toEqual(view === 'overview' ? ['ktcValue', 'dynastyScore'] : [])
      }
    }
  })
  it('unknown view resolves to no columns', () => {
    expect(factColumns('bogus', 'ALL')).toEqual([])
  })
})

describe('factColumns', () => {
  it('stats per-game keeps ids and swaps in the twin metrics', () => {
    const tot = factColumns('stats', 'WR', { statsMode: 'totals' })
    const per = factColumns('stats', 'WR', { statsMode: 'perGame' })
    expect(per.map(c => c.id)).toEqual(tot.map(c => c.id))
    const rec = per.find(c => c.id === 'recYd')
    expect(rec.metric.id).toBe('recYdPerG')
    expect(rec.label).toBe('Rec Yd/G')
    expect(tot.find(c => c.id === 'recYd').metric.id).toBe('recYd')
  })
  it('the stats-mode toggle does not touch overview or usage', () => {
    for (const view of ['overview', 'usage']) {
      expect(factColumns(view, 'WR', { statsMode: 'perGame' }).map(c => c.metric?.id))
        .toEqual(factColumns(view, 'WR', { statsMode: 'totals' }).map(c => c.metric?.id))
    }
  })
  it('Prev rk is hidden for last3 and career only', () => {
    for (const pos of POSITIONS) {
      for (const k of ['last3', 'career']) {
        expect(factColumns('overview', pos, { windowKind: k }).map(c => c.id)).not.toContain('prevFpPerGRank')
      }
      for (const k of ['live', 'season']) {
        expect(factColumns('overview', pos, { windowKind: k }).map(c => c.id)).toContain('prevFpPerGRank')
      }
    }
  })
  it('factSortableKeys includes full_name and the column ids', () => {
    const keys = factSortableKeys('usage', 'WR')
    expect(keys.has('full_name')).toBe(true)
    expect(keys.has('oppPerG')).toBe(true)
    expect(keys.has('fp')).toBe(false)
  })
})

describe('factCellValue / factCellRank', () => {
  const qbWs = { pid: 'q', position: 'QB', gp: 10, gs: 9, fp: 1, fpPerG: 0.1, totals: { pass_yd: 3000 }, rates: {}, usage: {}, basisGp: {} }
  const wrWs = { ...qbWs, pid: 'w', position: 'WR' }
  const passYd = factColumns('stats', 'ALL').find(c => c.id === 'passYd')
  const gCol = factColumns('overview', 'ALL').find(c => c.id === 'gp')
  const ktc = factColumns('overview', 'ALL').find(c => c.id === 'ktcValue')

  it('a metric the position does not rank is null', () => {
    expect(factCellValue(passYd, {}, wrWs)).toBeNull()
    expect(factCellValue(passYd, {}, qbWs)).toBe(3000)
  })
  it('without window stats metric and G columns are null, KTC still reads the row', () => {
    expect(factCellValue(passYd, {}, null)).toBeNull()
    expect(factCellValue(gCol, {}, null)).toBeNull()
    expect(factCellValue(ktc, { ktcValue: 4321 }, null)).toBe(4321)
  })
  it('rank is null when the value is null even if ranks has an entry', () => {
    const ranks = { w: { passYd: { rank: 1, of: 3 } }, q: { passYd: { rank: 1, of: 3 } } }
    expect(factCellRank(passYd, wrWs, ranks)).toBeNull()
    expect(factCellRank(passYd, qbWs, ranks)).toEqual({ rank: 1, of: 3 })
    expect(factCellRank(gCol, qbWs, ranks)).toBeNull()
  })
})

describe('window helpers', () => {
  const windows = [
    { id: 'live', kind: 'live', seasons: [2025] },
    { id: '2024', kind: 'season', seasons: [2024] },
    { id: '2023', kind: 'season', seasons: [2023] },
    { id: 'last3', kind: 'last3', seasons: [2023, 2024, 2025] },
    { id: 'career', kind: 'career', seasons: [2023, 2024] },
  ]
  it('prevWindowFor', () => {
    expect(prevWindowFor(windows[0], windows).id).toBe('2024')
    expect(prevWindowFor(windows[1], windows).id).toBe('2023')
    expect(prevWindowFor(windows[2], windows)).toBeNull()
    expect(prevWindowFor(windows[3], windows)).toBeNull()
    expect(prevWindowFor(windows[4], windows)).toBeNull()
    expect(prevWindowFor(null, windows)).toBeNull()
  })
  it('rankOptionsFor', () => {
    expect(rankOptionsFor(windows[4])).toEqual({ minGames: 32 })
    expect(rankOptionsFor(windows[1])).toBeUndefined()
    expect(rankOptionsFor(null)).toBeUndefined()
  })
  it('snapCoverageIncomplete', () => {
    const mk = (snapSeasons, seasons) => ({ usage: { snapSeasons }, seasons })
    expect(snapCoverageIncomplete(new Map([['a', mk(1, [2019, 2020])]]))).toBe(true)
    expect(snapCoverageIncomplete(new Map([['a', mk(2, [2019, 2020])], ['b', mk(1, [2020])]]))).toBe(false)
    expect(snapCoverageIncomplete(null)).toBe(false)
  })
})

describe('Efficiency fact view', () => {
  it('every metric column of the ALL pill is registered for all four positions', () => {
    for (const c of FACT_VIEW_COLUMNS.efficiency.ALL.filter(x => x.metricId)) {
      expect(METRIC_BY_ID[c.metricId].positions.slice().sort(), c.id).toEqual(['QB', 'RB', 'TE', 'WR'])
    }
  })
  it("each pill's default sort names a column that pill has; other views' defaults are unchanged", () => {
    for (const pos of POSITIONS) {
      expect(factSortableKeys('efficiency', pos).has(factDefaultSort('efficiency', pos).column), pos).toBe(true)
    }
    expect(factDefaultSort('overview', 'QB')).toBe(FACT_DEFAULT_SORT.overview)
    expect(factDefaultSort('usage', 'WR')).toBe(FACT_DEFAULT_SORT.usage)
  })
  const S = 2025
  const cov = (gamelogs, racr, racrLiveAvailable = false) => ({ gamelogs, racr, racrLiveAvailable })
  it.each([
    ['WR', cov('covered', 'covered'), S, ' · EPA/tgt, RACR: this window'],
    ['WR', cov('outside', 'outside', true), S, ' · EPA/tgt: 2025 season only · RACR: 2025 season and live window only'],
    ['WR', cov('outside', 'covered', true), S, ' · RACR: this window · EPA/tgt: 2025 season only'],
    ['WR', cov('outside', 'outside', false), S, ' · EPA/tgt: 2025 season only · RACR: 2025 season only'],
    ['QB', cov('unloaded', 'outside'), S, ' · EPA/att, CPOE, Rush EPA: not loaded'],
    ['RB', cov('covered', 'covered'), S, ' · Rush EPA/att: this window'],
    ['ALL', cov('covered', 'covered'), S, ''],
    ['WR', cov('outside', 'outside'), null, ' · EPA/tgt: not available · RACR: not available'],
  ])('advancedCaption(%s, %j, %s)', (pos, coverage, dataSeason, expected) => {
    expect(advancedCaption(pos, coverage, dataSeason)).toBe(expected)
  })
  it('advancedCaption is empty without coverage', () => {
    expect(advancedCaption('WR', null, S)).toBe('')
  })
})
