/**
 * src/__tests__/seasonTotalsEntityFilter.test.js
 *
 * Real-data contract test for the share-denominator fix (TEAM_<abbr>
 * whole-team aggregate pseudo-row exclusion).
 *
 * Fixture: src/__fixtures__/season-totals-2025-ind.json — a verbatim extract
 * (all `team === 'IND'` entries) of the data repo's served
 * nfl/season-totals/2025.json at data HEAD 52eea562. 93 entries: numeric
 * player ids, one `TEAM_IND` whole-team aggregate row, one `IND` DEF row, and
 * 20 entries with gamesPlayed < 1 (exercises the gp gate). Do not hand-edit.
 *
 * Trips if: the entity filter regresses (denominators double back to ~884),
 * the served entity shape drifts on regeneration (TEAM_IND presence/values),
 * or DEF rows grow offensive stat keys.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
import {
  computeHistoricalTeamTotals, computeHistoricalShares, isTeamAggregateId,
} from '../utils/teamContext.js'
import { computeTeamRzShareFactor } from '../utils/teamRzShare.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FIXTURE_PATH = join(__dirname, '../__fixtures__/season-totals-2025-ind.json')
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'))

describe('season-totals entity filter (real-data contract)', () => {
  it('served-shape assumption pins', () => {
    const teamKeys = Object.keys(fixture).filter(isTeamAggregateId)
    expect(teamKeys).toEqual(['TEAM_IND'])
    expect(fixture.TEAM_IND.team).toBe('IND')
    expect(fixture.TEAM_IND.gamesPlayed).toBe(17)
    expect(fixture.TEAM_IND.stats.rush_att).toBe(442)

    expect(fixture.IND).toBeDefined()
    expect(fixture.IND.gamesPlayed).toBe(17)
    for (const key of ['rush_att', 'rec', 'rec_tgt', 'rush_rz_att', 'rec_rz_tgt']) {
      expect(fixture.IND.stats[key] ?? null).toBeNull()
    }

    expect(fixture['6813']).toBeDefined()
    expect(fixture['6813'].team).toBe('IND')
    expect(fixture['6813'].stats.rush_att).toBe(323)
    expect(fixture['6813'].stats.rush_rz_att).toBe(70)
  })

  it('denominator pin — the doubling regression trip', () => {
    const totals = computeHistoricalTeamTotals({ 2025: fixture }, {})
    expect(totals[2025].IND).toEqual({ rushAtt: 442, rec: 351, recTgt: 514, rushRz: 101, recRz: 69 })
  })

  it('share pin', () => {
    const totals = computeHistoricalTeamTotals({ 2025: fixture }, {})
    const shares = computeHistoricalShares({ 2025: fixture }, { '6813': { position: 'RB', team: 'IND' } }, totals)
    expect(shares).toEqual({ '6813': [{ season: 2025, share: 0.731, gamesPlayed: 17 }] })
  })

  it('Step-5h value pin', () => {
    const totals = computeHistoricalTeamTotals({ 2025: fixture }, {})
    const playersMap = { '6813': { position: 'RB', team: 'IND' } }
    const result = computeTeamRzShareFactor(
      'RB', fixture['6813'].stats, 2025, 'IND',
      totals, { 2025: fixture }, playersMap,
    )
    expect(result.teamRzShare).toBe(0.693)
    expect(result.teamRzShareCategory).toBe('rush')
  })
})
