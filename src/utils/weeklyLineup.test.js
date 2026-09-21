import { describe, it, expect } from 'vitest'
import { buildWeeklyLineup } from './weeklyLineup'
import { startingSlots } from './lineup'
import { PRIOR_WEIGHT_GAMES, FPA_PRIOR_DROP_GAMES } from './opponentStrength'

const ROSTER_POSITIONS = ['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'BN', 'BN']
const SCORING = { pass_yd: 0.04, rush_yd: 0.1, rec: 0.5, rec_yd: 0.1 }

function projRow(opponent, stats) {
  return { stats, opponent, team: null }
}

describe('buildWeeklyLineup — the id -> player_id remap (trap #1)', () => {
  it('a roster passed in the rosterTeams `id` shape fills all 7 startable slots, not one', () => {
    // Enriched roster shape: App.jsx:813's enrichPlayer keys players on `id`, not `player_id`.
    const myPlayers = [
      { id: 'qb1', position: 'QB', full_name: 'QB One' },
      { id: 'rb1', position: 'RB', full_name: 'RB One' },
      { id: 'rb2', position: 'RB', full_name: 'RB Two' },
      { id: 'wr1', position: 'WR', full_name: 'WR One' },
      { id: 'wr2', position: 'WR', full_name: 'WR Two' },
      { id: 'te1', position: 'TE', full_name: 'TE One' },
      { id: 'rb3', position: 'RB', full_name: 'RB Three' },
    ]
    const projections = Object.fromEntries(
      myPlayers.map((p, i) => [p.id, projRow('DEN', { rush_yd: 10 * (i + 1), rec_yd: 5, rec: 1 })])
    )

    const { slots } = buildWeeklyLineup({
      myPlayers,
      rosterPositions: ROSTER_POSITIONS,
      projections,
      scoringSettings: SCORING,
      usageByPlayer: {},
      formByPlayer: {},
      fpaTable: {},
      fpaRanks: {},
    })

    const filled = slots.filter(s => s.player_id !== null)
    expect(slots).toHaveLength(startingSlots(ROSTER_POSITIONS).length)
    // 7 players, 7 startable slots (QB/RB/RB/WR/WR/TE/FLEX) — assert the filled count exactly. An
    // unmapped shape collapses every entry to a single `undefined` player_id, which this assertion
    // catches and `toBeGreaterThan(1)` did not (empty slots are still slots, so length alone is
    // insensitive too — see the `toHaveLength` assertion above).
    expect(filled.length).toBe(7)
    expect(new Set(filled.map(s => s.player_id)).size).toBe(filled.length) // no duplicate ids
  })
})

describe('buildWeeklyLineup — the missing-projection-row null trap (trap #2)', () => {
  it('a player with no projections row scores null, not 0, and is started only when no projected player is eligible', () => {
    // ids are deliberately in this alphabetical order: 'qb-no-proj' < 'qb-zero-proj'. The pool's
    // tie-break sorts equal points by ascending player_id, so if the missing-row branch ever
    // returned a finite 0 instead of null, 'qb-no-proj' would win the tie against a genuine 0.0
    // projection and this assertion would catch it — a projection of 0.1 would not, since 0.1 beats
    // 0 regardless of which branch produced the 0.
    const myPlayers = [
      { id: 'qb-no-proj', position: 'QB', full_name: 'No Projection' },
      { id: 'qb-zero-proj', position: 'QB', full_name: 'Has Projection At Zero' },
    ]
    // qb-zero-proj has a real row that scores exactly 0.0 (empty stats); qb-no-proj has no row at all.
    const projections = { 'qb-zero-proj': projRow('DEN', {}) }

    const rosterPositions = ['QB', 'BN']
    const { slots } = buildWeeklyLineup({
      myPlayers,
      rosterPositions,
      projections,
      scoringSettings: SCORING,
      usageByPlayer: {},
      formByPlayer: {},
      fpaTable: {},
      fpaRanks: {},
    })

    const qbSlot = slots.find(s => s.slot === 'QB')
    // The projected player, scoring exactly 0.0, still beats the unprojected player's null — this
    // is the ordering the missing-row branch exists to protect, and it discriminates: under the bug
    // (missing row scored as 0 instead of null) this would tie at 0 and the id tie-break would pick
    // 'qb-no-proj' instead.
    expect(qbSlot.player_id).toBe('qb-zero-proj')
    expect(qbSlot.points).toBe(0)

    // Directly assert the ordering-under-the-bug case: calculateFantasyPoints({}, scoring) === 0,
    // which is finite and would sort ABOVE a genuine null if the missing-row branch didn't return
    // null explicitly. Verify by giving qb-zero-proj no projection either and confirming a
    // still-empty BN pool doesn't crash and doesn't fabricate a 0.
    const { slots: bothMissing } = buildWeeklyLineup({
      myPlayers,
      rosterPositions,
      projections: {},
      scoringSettings: SCORING,
      usageByPlayer: {},
      formByPlayer: {},
      fpaTable: {},
      fpaRanks: {},
    })
    const qbSlot2 = bothMissing.find(s => s.slot === 'QB')
    expect(qbSlot2.points).toBeNull()
  })
})

describe('buildWeeklyLineup — opponent / bye', () => {
  const myPlayers = [{ id: 'qb1', position: 'QB', full_name: 'QB One' }]
  const rosterPositions = ['QB']

  it('a bye opponent (no row in projections) renders as a bye, not `—`', () => {
    const { slots } = buildWeeklyLineup({
      myPlayers,
      rosterPositions,
      projections: {},
      scoringSettings: SCORING,
      usageByPlayer: {},
      formByPlayer: {},
      fpaTable: {},
      fpaRanks: {},
    })
    const slot = slots[0]
    expect(slot.bye).toBe(true)
    expect(slot.opponent).toBeNull()
  })

  it('an LAR opponent resolves against the era-accurate fpaTable via normalizeTeamForSchedule', () => {
    const fpaTable = { LA: { qb: 18.5, weights: { qb: FPA_PRIOR_DROP_GAMES } } }
    const fpaRanks = { LA: { qb: 12 } }
    const { slots } = buildWeeklyLineup({
      myPlayers,
      rosterPositions,
      projections: { qb1: projRow('LAR', { pass_yd: 250 }) }, // Sleeper domain
      scoringSettings: SCORING,
      usageByPlayer: {},
      formByPlayer: {},
      fpaTable,
      fpaRanks,
    })
    const slot = slots[0]
    expect(slot.opponent).toBe('LAR')
    expect(slot.allows).toBe(18.5) // real value, not `—`/null — proves the CR-16 hop ran
    expect(slot.allowsRank).toBe(12)
  })

  it('weight clamps to 1 once gCur >= FPA_PRIOR_DROP_GAMES', () => {
    const fpaTable = { DEN: { qb: 15, weights: { qb: FPA_PRIOR_DROP_GAMES } } }
    const { slots } = buildWeeklyLineup({
      myPlayers,
      rosterPositions,
      projections: { qb1: projRow('DEN', { pass_yd: 200 }) },
      scoringSettings: SCORING,
      usageByPlayer: {},
      formByPlayer: {},
      fpaTable,
      fpaRanks: {},
    })
    expect(slots[0].weight).toBe(1)
  })

  it('weight is the games-played blend below the drop threshold', () => {
    const fpaTable = { DEN: { qb: 15, weights: { qb: 1 } } }
    const { slots } = buildWeeklyLineup({
      myPlayers,
      rosterPositions,
      projections: { qb1: projRow('DEN', { pass_yd: 200 }) },
      scoringSettings: SCORING,
      usageByPlayer: {},
      formByPlayer: {},
      fpaTable,
      fpaRanks: {},
    })
    expect(slots[0].weight).toBeCloseTo(1 / (1 + PRIOR_WEIGHT_GAMES))
  })
})

describe('buildWeeklyLineup — form with fewer than three played weeks', () => {
  it('one played week yields two leading nulls and no zeros', () => {
    const myPlayers = [{ id: 'qb1', position: 'QB', full_name: 'QB One' }]
    const { slots } = buildWeeklyLineup({
      myPlayers,
      rosterPositions: ['QB'],
      projections: {},
      scoringSettings: SCORING,
      usageByPlayer: {},
      formByPlayer: { qb1: [null, null, 12.4] },
      fpaTable: {},
      fpaRanks: {},
    })
    expect(slots[0].form).toEqual([null, null, 12.4])
  })
})
