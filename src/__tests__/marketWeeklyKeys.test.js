import { describe, it, expect } from 'vitest'
import { WEEKLY_KEYS } from '../utils/marketWeekly'
import { MARKET_METRICS } from '../utils/marketMetrics'
import { WINDOW_TOTAL_KEYS } from '../utils/marketWindowStats'

// CR-34's app test. The literal below is a copy of WEEKLY_KEYS (original: src/utils/marketWeekly.js); the data
// repo's mirror test (data-repo-backlog D-90) holds the same list. Change all of them together.
const CONTRACT = [
  'pass_att', 'pass_cmp', 'pass_yd', 'pass_td', 'pass_sack',
  'rush_att', 'rush_yd', 'rush_td', 'rush_btkl', 'rush_fd',
  'rec_tgt', 'rec', 'rec_yd', 'rec_td', 'rec_fd',
]

describe('CR-34 · Market weekly stat keys', () => {
  it('WEEKLY_KEYS equals the contract literal', () => {
    expect([...WEEKLY_KEYS]).toEqual(CONTRACT)
  })
  it('every perGame metric reads only contract keys', () => {
    for (const m of MARKET_METRICS.filter(x => x.kind === 'perGame' && x.week !== 'fp')) {
      for (const k of m.week) expect(WEEKLY_KEYS, `${m.id} ${k}`).toContain(k)
    }
  })
  it('every contract key is a window total key', () => {
    for (const k of WEEKLY_KEYS) expect(WINDOW_TOTAL_KEYS).toContain(k)
  })
})
