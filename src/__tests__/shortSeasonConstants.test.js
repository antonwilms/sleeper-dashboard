// short-season-wiring §3.1 — SHORT_SEASON_K is pinned by byte copy from the data repo's L6c constants file
// (CR-27 pattern); this test re-derives it from the fixture so a hand edit of either side reds.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { SHORT_SEASON_K, SHORT_SEASON_SOURCE } from '../utils/shortSeasonConstants'

const FIXTURE_PATH = new URL('../__fixtures__/games-short-constants-2026-10-10.json', import.meta.url)
// sha1 of backtests/2026-10-10-games-short-constants.json at data 4fa76897d39b36c5fda685de128725d6fc10797a
const FIXTURE_SHA1 = '822812da33b5515d326fc670ff1cdd451b75a0b5'

describe('short-season constants pin', () => {
  const bytes = readFileSync(FIXTURE_PATH)
  const fixture = JSON.parse(bytes.toString('utf8'))
  const sof0 = fixture.candidates.SOf0

  it('the fixture is the byte copy of the data file at 4fa7689 (sha1)', () => {
    expect(createHash('sha1').update(bytes).digest('hex')).toBe(FIXTURE_SHA1)
  })

  it('SHORT_SEASON_SOURCE.commit is a 40-hex SHA and names SOf0', () => {
    expect(SHORT_SEASON_SOURCE.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(SHORT_SEASON_SOURCE.candidate).toBe('SOf0')
  })

  it('SOf0 was fitted on non-qualifying rows with floor 0', () => {
    expect(sof0.fitRows).toBe('non-qual')
    expect(sof0.floor).toBe(0)
  })

  it('every state × position equals cells[pos|s][pos|state] ?? cells.pos[pos]', () => {
    for (const state of ['short', 'none']) {
      for (const pos of ['QB', 'RB', 'WR', 'TE']) {
        const derived = sof0.k['pos|s'][`${pos}|${state}`] ?? sof0.k.pos[pos]
        expect(SHORT_SEASON_K[state][pos], `${state} ${pos}`).toBe(derived)
      }
    }
  })
})
