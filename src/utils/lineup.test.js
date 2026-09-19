import { describe, it, expect } from 'vitest'
import {
  startingSlots, buildBestLineup, buildLeagueLineups, buildPositionLadders, buildWeakestSlots,
  buildSlotMedians, startingBar,
} from './lineup.js'

const LEAGUE = ['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'SUPER_FLEX', ...Array(18).fill('BN')]

const p = (id, position, points, full_name = id) => ({ id, position, points, full_name })
const getPts = players => player => {
  const found = players.find(pl => pl.id === player.player_id)
  return found ? found.points : undefined
}
// buildBestLineup's `players` param takes { player_id, position, full_name }
const toPlayers = players => players.map(pl => ({ player_id: pl.id, position: pl.position, full_name: pl.full_name }))

describe('startingSlots', () => {
  it('1. removes BN/TAXI/IR, keeps order; LEAGUE -> 10 entries; null -> []', () => {
    expect(startingSlots(LEAGUE)).toEqual(['QB', 'RB', 'RB', 'WR', 'WR', 'WR', 'TE', 'FLEX', 'FLEX', 'SUPER_FLEX'])
    expect(startingSlots(LEAGUE).length).toBe(10)
    expect(startingSlots(['QB', 'TAXI', 'RB', 'IR', 'WR', 'BN'])).toEqual(['QB', 'RB', 'WR'])
    expect(startingSlots(null)).toEqual([])
  })
})

describe('buildBestLineup', () => {
  it('2. SUPER_FLEX takes a QB when that maximises', () => {
    const players = [p('qb1', 'QB', 25), p('qb2', 'QB', 22), p('rb1', 'RB', 15), p('rb2', 'RB', 10)]
    const result = buildBestLineup(toPlayers(players), ['QB', 'RB', 'SUPER_FLEX'], getPts(players))
    const sf = result.slots.find(s => s.slot === 'SUPER_FLEX')
    expect(sf.player_id).toBe('qb2')
    expect(sf.points).toBe(22)
    expect(result.total).toBe(62)
    expect(result.byPosition.QB).toBe(47)
  })

  it('3. SUPER_FLEX takes a non-QB when that maximises', () => {
    const players = [p('qb1', 'QB', 25), p('qb2', 'QB', 8), p('rb1', 'RB', 15), p('rb2', 'RB', 12)]
    const result = buildBestLineup(toPlayers(players), ['QB', 'RB', 'SUPER_FLEX'], getPts(players))
    const sf = result.slots.find(s => s.slot === 'SUPER_FLEX')
    expect(sf.player_id).toBe('rb2')
    expect(sf.points).toBe(12)
    expect(result.total).toBe(52)
    expect(result.byPosition.RB).toBe(27)
  })

  it('4. FLEX excludes QB', () => {
    const players = [p('qb1', 'QB', 40), p('rb1', 'RB', 10), p('wr1', 'WR', 3)]
    const result = buildBestLineup(toPlayers(players), ['RB', 'FLEX'], getPts(players))
    const flex = result.slots.find(s => s.slot === 'FLEX')
    expect(flex.player_id).toBe('wr1')
    expect(result.slots.some(s => s.player_id === 'qb1')).toBe(false)
  })

  it('5. Greedy failure, FLEX-before-dedicated', () => {
    const players = [p('rb1', 'RB', 20), p('rb2', 'RB', 3), p('wr1', 'WR', 5)]
    const result = buildBestLineup(toPlayers(players), ['FLEX', 'RB'], getPts(players))
    const flex = result.slots.find(s => s.slot === 'FLEX')
    const rb = result.slots.find(s => s.slot === 'RB')
    expect(flex.player_id).toBe('wr1')
    expect(rb.player_id).toBe('rb1')
    expect(result.total).toBe(25)
  })

  it('6. Greedy failure, SUPER_FLEX-before-QB', () => {
    const players = [p('qb1', 'QB', 25), p('wr1', 'WR', 20), p('wr2', 'WR', 18)]
    const result = buildBestLineup(toPlayers(players), ['SUPER_FLEX', 'QB', 'WR'], getPts(players))
    const qb = result.slots.find(s => s.slot === 'QB')
    const sf = result.slots.find(s => s.slot === 'SUPER_FLEX')
    const wr = result.slots.find(s => s.slot === 'WR')
    expect(qb.player_id).toBe('qb1')
    expect(sf.player_id).toBe('wr2')
    expect(wr.player_id).toBe('wr1')
    expect(result.total).toBe(63)
  })

  it('7. null never displaces a scoring player', () => {
    const playersA = [p('rb1', 'RB', 15), p('rb2', 'RB', null), p('wr1', 'WR', 2)]
    const resultA = buildBestLineup(toPlayers(playersA), ['RB', 'FLEX'], getPts(playersA))
    expect(resultA.slots.find(s => s.slot === 'FLEX').player_id).toBe('wr1')

    const playersB = [p('rb1', 'RB', 15), p('rb2', 'RB', null), p('wr1', 'WR', 0)]
    const resultB = buildBestLineup(toPlayers(playersB), ['RB', 'FLEX'], getPts(playersB))
    const flexB = resultB.slots.find(s => s.slot === 'FLEX')
    expect(flexB.player_id).toBe('wr1')
    expect(flexB.points).toBe(0)
  })

  it('8. null fills only when nothing scores, and is never 0', () => {
    const players = [p('rb1', 'RB', 15), p('rb2', 'RB', null)]
    const result = buildBestLineup(toPlayers(players), ['RB', 'FLEX'], getPts(players))
    const flex = result.slots.find(s => s.slot === 'FLEX')
    expect(flex.player_id).toBe('rb2')
    expect(flex.points).toBeNull()
    expect(result.byPosition.RB).toBe(15)
    expect(result.unscored.RB).toBe(1)
    expect(result.total).toBe(15)
    expect(result.byPosition.TE).toBeNull()
  })

  it('9. byPosition attributes by player position', () => {
    const players = [p('rb1', 'RB', 20), p('rb2', 'RB', 15), p('rb3', 'RB', 10)]
    const result = buildBestLineup(toPlayers(players), LEAGUE, getPts(players))
    expect(result.byPosition.RB).toBe(45)
    expect(Object.keys(result.byPosition)).toEqual(['QB', 'RB', 'WR', 'TE'])
    const flexSlot = result.slots.find(s => s.slot === 'FLEX' && s.player_id === 'rb3')
    expect(flexSlot).toBeTruthy()
    expect(flexSlot.position).toBe('RB')
  })

  it('10. Short roster', () => {
    const players = [p('qb1', 'QB', 20), p('rb1', 'RB', 10)]
    const result = buildBestLineup(toPlayers(players), LEAGUE, getPts(players))
    expect(result.slots.length).toBe(10)
    expect(result.slots[0]).toMatchObject({ slot: 'QB', player_id: 'qb1' })
    expect(result.slots[1]).toMatchObject({ slot: 'RB', player_id: 'rb1' })
    for (const slot of result.slots.slice(2)) {
      expect(slot.player_id).toBeNull()
      expect(slot.points).toBeNull()
    }
    expect(result.total).toBe(30)
  })

  it('11. Unknown slot types', () => {
    const players = [p('qb1', 'QB', 20)]
    const result = buildBestLineup(toPlayers(players), ['QB', 'K', 'DEF'], getPts(players))
    expect(result.slots).toEqual([
      { slot: 'QB', player_id: 'qb1', name: 'qb1', position: 'QB', points: 20 },
      { slot: 'K', player_id: null, name: null, position: null, points: null },
      { slot: 'DEF', player_id: null, name: null, position: null, points: null },
    ])
  })

  it('12. Non-skill and non-finite inputs', () => {
    const players = [{ player_id: 'x1', position: '?', full_name: 'X' }, { player_id: 'rb1', position: 'RB', full_name: 'RB1' }]
    const result = buildBestLineup(players, ['RB'], () => undefined)
    expect(result.slots.some(s => s.player_id === 'x1')).toBe(false)
    expect(result.slots[0].player_id).toBe('rb1')
    expect(result.slots[0].points).toBeNull()

    const resultNaN = buildBestLineup([{ player_id: 'rb2', position: 'RB', full_name: 'RB2' }], ['RB'], () => NaN)
    expect(resultNaN.slots[0].points).toBeNull()
  })

  it('13. Canonical placement', () => {
    const players = [p('rb1', 'RB', 5), p('rb2', 'RB', 9), p('rb3', 'RB', 7)]
    const result = buildBestLineup(toPlayers(players), ['RB', 'RB', 'FLEX'], getPts(players))
    expect(result.slots.map(s => s.points)).toEqual([9, 7, 5])
  })

  it('F1-1. pooled FLEX excess is re-sorted across positions', () => {
    const players = [
      p('rb1', 'RB', 20), p('rb2', 'RB', 8), p('rb3', 'RB', 3),
      p('wr1', 'WR', 15), p('wr2', 'WR', 12), p('wr3', 'WR', 6),
    ]
    const result = buildBestLineup(toPlayers(players), ['RB', 'WR', 'FLEX', 'FLEX', 'SUPER_FLEX'], getPts(players))
    // An un-sorted RB-then-WR concatenation would place rb2 (8) in the first FLEX, ahead of wr2
    // (12); the 3-RB/2-WR alternative scores 58 vs this (correct) 61.
    expect(result.slots.map(s => s.player_id)).toEqual(['rb1', 'wr1', 'wr2', 'rb2', 'wr3'])
    expect(result.slots.map(s => s.points)).toEqual([20, 15, 12, 8, 6])
    expect(result.total).toBe(61)
    expect(result.byPosition.RB).toBe(28)
    expect(result.byPosition.WR).toBe(33)
  })

  it('F1-5. empty/null inputs, duplicate ids, id tie-break', () => {
    expect(buildBestLineup([], null, () => 1)).toEqual({
      slots: [],
      byPosition: { QB: null, RB: null, WR: null, TE: null },
      unscored: { QB: 0, RB: 0, WR: 0, TE: 0 },
      total: null,
    })

    const nullPlayersResult = buildBestLineup(null, ['RB'], () => 1)
    expect(nullPlayersResult.slots).toEqual([{ slot: 'RB', player_id: null, name: null, position: null, points: null }])
    expect(nullPlayersResult.total).toBeNull()

    // Duplicate id, first kept: the RB entry was kept; the WR duplicate was dropped.
    const dupResult = buildBestLineup(
      [{ player_id: 'd1', position: 'RB', full_name: 'D' }, { player_id: 'd1', position: 'WR', full_name: 'D' }],
      ['WR'],
      () => 10,
    )
    expect(dupResult.slots[0].player_id).toBeNull()

    // Tie-break by id ascending.
    const tieResult = buildBestLineup(
      [{ player_id: 'b', position: 'RB', full_name: 'B' }, { player_id: 'a', position: 'RB', full_name: 'A' }],
      ['RB'],
      () => 10,
    )
    expect(tieResult.slots[0].player_id).toBe('a')
  })
})

describe('buildLeagueLineups', () => {
  it('14. Reads careerStats[season] and not another season', () => {
    const rosterTeams = [{ rosterId: 1, teamName: 'A', starters: [{ id: 'p1', position: 'RB', full_name: 'P1' }], bench: [], reserve: [] }]
    const careerStats = {
      2024: { p1: { fantasyPoints: 999, gamesPlayed: 6 } },
      2025: { p1: { fantasyPoints: 100, gamesPlayed: 6 } },
    }
    const result = buildLeagueLineups({ rosterTeams, careerStats, seasonProjections: {}, rosterPositions: ['RB'], season: 2025 })
    expect(result[0].last.slots[0].points).toBeCloseTo(16.666666, 5)
  })

  it('15. gamesPlayed:0 and missing players -> null', () => {
    const rosterTeams = [{
      rosterId: 1, teamName: 'A',
      starters: [{ id: 'p1', position: 'RB', full_name: 'P1' }, { id: 'p2', position: 'RB', full_name: 'P2' }],
      bench: [], reserve: [],
    }]
    const careerStats = { 2025: { p1: { fantasyPoints: 50, gamesPlayed: 0 } } }
    const result = buildLeagueLineups({ rosterTeams, careerStats, seasonProjections: {}, rosterPositions: ['RB', 'RB'], season: 2025 })
    expect(result[0].last.slots.every(s => s.points === null)).toBe(true)
    expect(result[0].proj.slots.every(s => s.points === null)).toBe(true)
  })

  it('16. Pool includes reserve (IR)', () => {
    const rosterTeams = [{
      rosterId: 1, teamName: 'A',
      starters: [{ id: 'p1', position: 'RB', full_name: 'P1' }],
      bench: [],
      reserve: [{ id: 'p2', position: 'RB', full_name: 'P2' }],
    }]
    const careerStats = { 2025: { p1: { fantasyPoints: 60, gamesPlayed: 6 }, p2: { fantasyPoints: 120, gamesPlayed: 6 } } }
    const result = buildLeagueLineups({ rosterTeams, careerStats, seasonProjections: {}, rosterPositions: ['RB'], season: 2025 })
    expect(result[0].last.slots[0].player_id).toBe('p2')
  })

  it('17. Returns {rosterId, teamName, last, proj} per team in order; [] -> []', () => {
    const rosterTeams = [
      { rosterId: 2, teamName: 'B', starters: [], bench: [], reserve: [] },
      { rosterId: 1, teamName: 'A', starters: [], bench: [], reserve: [] },
    ]
    const result = buildLeagueLineups({ rosterTeams, careerStats: {}, seasonProjections: {}, rosterPositions: ['RB'], season: 2025 })
    expect(result.map(r => r.rosterId)).toEqual([2, 1])
    for (const r of result) expect(Object.keys(r).sort()).toEqual(['last', 'proj', 'rosterId', 'teamName'])
    expect(buildLeagueLineups({ rosterTeams: [], careerStats: {}, seasonProjections: {}, rosterPositions: ['RB'], season: 2025 })).toEqual([])
  })

  it('F1-6a. rosterTeams null -> []', () => {
    expect(buildLeagueLineups({ rosterTeams: null, careerStats: {}, seasonProjections: {}, rosterPositions: ['RB'], season: 2025 })).toEqual([])
  })
})

describe('buildPositionLadders', () => {
  // 12-team fixture built via buildLeagueLineups over ['QB','RB','FLEX'] (D9).
  const lastQB = { 1: 40, 2: 38, 3: 36, 4: 34, 5: 32, 6: 14, 7: 30, 8: 28, 9: 26, 10: 24, 11: 22, 12: 20 }
  const projQB = { 1: 35, 2: 33, 3: 31, 4: 29, 5: 27, 6: 32, 7: 25, 8: 23, 9: 21, 10: 19, 11: 17, 12: 15 }
  const lastRB = { 1: 30, 2: 25, 3: 25, 4: 20, 5: 18, 6: 16, 7: 14, 8: 12, 9: 10, 10: 8 } // 11, 12 have no RB
  const projRB = { 1: 28, 2: 27, 3: 26, 4: 24, 5: 22, 6: 12, 7: 20, 8: 18, 9: 16, 10: 14 }

  const rosterTeams = []
  const careerStats = { 2025: {} }
  const seasonProjections = {}
  for (let i = 1; i <= 12; i++) {
    const starters = [{ id: `qb${i}`, position: 'QB', full_name: `QB${i}` }]
    careerStats[2025][`qb${i}`] = { fantasyPoints: lastQB[i], gamesPlayed: 1 }
    seasonProjections[`qb${i}`] = { projectedPPG: projQB[i] }
    if (lastRB[i] !== undefined) {
      starters.push({ id: `rb${i}`, position: 'RB', full_name: `RB${i}` })
      careerStats[2025][`rb${i}`] = { fantasyPoints: lastRB[i], gamesPlayed: 1 }
      seasonProjections[`rb${i}`] = { projectedPPG: projRB[i] }
    }
    rosterTeams.push({ rosterId: i, teamName: `Team${i}`, starters, bench: [], reserve: [] })
  }
  const leagueLineups = buildLeagueLineups({ rosterTeams, careerStats, seasonProjections, rosterPositions: ['QB', 'RB', 'FLEX'], season: 2025 })

  const rbLadderFor = rosterId => buildPositionLadders(leagueLineups, rosterId).find(l => l.pos === 'RB')
  const qbLadderFor = rosterId => buildPositionLadders(leagueLineups, rosterId).find(l => l.pos === 'QB')

  it('18. lastRank/projRank match hand-written competition ranks, including the tie', () => {
    const expectedLastRank = { 1: 1, 2: 2, 3: 2, 4: 4, 10: 10, 11: null, 12: null }
    for (const [rosterId, rank] of Object.entries(expectedLastRank)) {
      expect(rbLadderFor(Number(rosterId)).lastRank).toBe(rank)
    }
  })

  it('19. lastMedian equals the hand-computed mean of the middle two finite values; null teams sit last', () => {
    const rb = rbLadderFor(6)
    expect(rb.lastMedian).toBe(17)
    expect(rb.lastAll[10]).toMatchObject({ rosterId: 11, value: null })
    expect(rb.lastAll[11]).toMatchObject({ rosterId: 12, value: null })
  })

  it('20. move is projRank - lastRank, signed', () => {
    const rb = rbLadderFor(6)
    expect(rb.lastRank).toBe(6)
    expect(rb.projRank).toBe(10)
    expect(rb.move).toBe(4) // worsened

    const qb = qbLadderFor(6)
    expect(qb.lastRank).toBe(12)
    expect(qb.projRank).toBe(3)
    expect(qb.move).toBe(-9) // improved
  })

  it('21. slotsLabel for LEAGUE equals the five literal strings', () => {
    const soloTeam = [{ rosterId: 1, teamName: 'Solo', starters: [], bench: [], reserve: [] }]
    const solo = buildLeagueLineups({ rosterTeams: soloTeam, careerStats: {}, seasonProjections: {}, rosterPositions: LEAGUE, season: 2025 })
    const ladders = buildPositionLadders(solo, 1)
    expect(ladders.map(l => l.slotsLabel)).toEqual([
      '1 slot + 1 superflex',
      '2 slots + 2 flex + 1 superflex',
      '3 slots + 2 flex + 1 superflex',
      '1 slot + 2 flex + 1 superflex',
      '10 slots',
    ])
  })

  it('22. myRosterId not found -> *Mine, *Rank, move null; medians still computed', () => {
    const rb = rbLadderFor(999)
    expect(rb.lastMine).toBeNull()
    expect(rb.lastRank).toBeNull()
    expect(rb.projMine).toBeNull()
    expect(rb.projRank).toBeNull()
    expect(rb.move).toBeNull()
    expect(rb.lastMedian).toBe(17)
  })

  it('F1-3. projRank and projMedian match hand-computed values', () => {
    // sorted projRB is 28(t1), 27, 26, 24, 22(t5), 20(t7), 18, 16, 14(t10), 12(t6); teams 11/12
    // have no RB.
    const expectedProjRank = { 1: 1, 5: 5, 7: 6, 10: 9, 6: 10, 11: null }
    for (const [rosterId, rank] of Object.entries(expectedProjRank)) {
      expect(rbLadderFor(Number(rosterId)).projRank).toBe(rank)
    }

    expect(rbLadderFor(6).projMedian).toBe(21) // mean of 22 and 20

    expect(rbLadderFor(6).projAll[10]).toMatchObject({ rosterId: 11, value: null })
    expect(rbLadderFor(6).projAll[11]).toMatchObject({ rosterId: 12, value: null })
  })

  it('F1-4a. both ranks null -> move null', () => {
    const rb = rbLadderFor(11)
    expect(rb.lastMine).toBeNull()
    expect(rb.lastRank).toBeNull()
    expect(rb.projMine).toBeNull()
    expect(rb.projRank).toBeNull()
    expect(rb.move).toBeNull()
  })

  it('F1-4b. one rank null -> move null', () => {
    const rosterTeams = [
      { rosterId: 1, teamName: 'Team1', starters: [{ id: 'a1', position: 'RB', full_name: 'A1' }], bench: [], reserve: [] },
      { rosterId: 2, teamName: 'Team2', starters: [{ id: 'a2', position: 'RB', full_name: 'A2' }], bench: [], reserve: [] },
    ]
    const careerStats = { 2025: { a2: { fantasyPoints: 5, gamesPlayed: 1 } } } // a1 absent
    const seasonProjections = { a1: { projectedPPG: 10 }, a2: { projectedPPG: 8 } }
    const lineups = buildLeagueLineups({ rosterTeams, careerStats, seasonProjections, rosterPositions: ['RB'], season: 2025 })
    const rb = buildPositionLadders(lineups, 1).find(l => l.pos === 'RB')
    expect(rb.lastMine).toBeNull()
    expect(rb.lastRank).toBeNull()
    expect(rb.projMine).toBe(10)
    expect(rb.projRank).toBe(1)
    expect(rb.move).toBeNull()
  })
})

describe('buildWeakestSlots', () => {
  // Hand-built: rosterPositions ['QB','RB','WR','TE'], me = rosterId 1.
  const leagueLineups = [
    { rosterId: 1, teamName: 'Me', proj: { slots: [
      { slot: 'QB', player_id: 'myqb', name: 'MyQB', position: 'QB', points: 25 },
      { slot: 'RB', player_id: 'myrb', name: 'MyRB', position: 'RB', points: 10 },
      { slot: 'WR', player_id: 'mywr', name: 'MyWR', position: 'WR', points: null },
      { slot: 'TE', player_id: 'myte', name: 'MyTE', position: 'TE', points: 5 },
    ] } },
    { rosterId: 2, teamName: 'T2', proj: { slots: [
      { slot: 'QB', player_id: 'q2', name: 'Q2', position: 'QB', points: 20 },
      { slot: 'RB', player_id: 'r2', name: 'R2', position: 'RB', points: 15 },
      { slot: 'WR', player_id: 'w2', name: 'W2', position: 'WR', points: 12 },
      { slot: 'TE', player_id: 't2', name: 'T2p', position: 'TE', points: 9 },
    ] } },
    { rosterId: 3, teamName: 'T3', proj: { slots: [
      { slot: 'QB', player_id: 'q3', name: 'Q3', position: 'QB', points: 18 },
      { slot: 'RB', player_id: 'r3', name: 'R3', position: 'RB', points: 20 },
      { slot: 'WR', player_id: 'w3', name: 'W3', position: 'WR', points: 8 },
      { slot: 'TE', player_id: 't3', name: 'T3p', position: 'TE', points: 11 },
    ] } },
    { rosterId: 4, teamName: 'T4', proj: { slots: [
      { slot: 'QB', player_id: 'q4', name: 'Q4', position: 'QB', points: 22 },
      { slot: 'RB', player_id: 'r4', name: 'R4', position: 'RB', points: null },
      { slot: 'WR', player_id: 'w4', name: 'W4', position: 'WR', points: 14 },
      { slot: 'TE', player_id: 't4', name: 'T4p', position: 'TE', points: 7 },
    ] } },
  ]

  // QB: median(other)=20, loss=20-25=-5 (excluded). RB: median(other finite [15,20])=17.5, loss=7.5.
  // WR: mine null (excluded, test 25). TE: median(other)=9, loss=9-5=4.
  it('23. Returns only slots with loss > 0, sorted by loss descending', () => {
    const result = buildWeakestSlots(leagueLineups, 1)
    expect(result.map(r => r.slot)).toEqual(['RB', 'TE'])
    expect(result[0].loss).toBeCloseTo(7.5, 5)
    expect(result[1].loss).toBeCloseTo(4, 5)
  })

  it('24. The median excludes my own team', () => {
    const result = buildWeakestSlots(leagueLineups, 1)
    const rb = result.find(r => r.slot === 'RB')
    // other-teams median of [15, 20] = 17.5, NOT the all-teams median of [10, 15, 20] = 15
    expect(rb.median).toBeCloseTo(17.5, 5)
  })

  it('25. A slot where my proj points are null is absent from the result', () => {
    const result = buildWeakestSlots(leagueLineups, 1)
    expect(result.some(r => r.slot === 'WR')).toBe(false)
  })

  it('F1-2. sorts by loss descending when that differs from slot order', () => {
    // Own fixture: rosterPositions ['QB','RB','WR','TE'], me = rosterId 1.
    const ownLineups = [
      { rosterId: 1, teamName: 'Me', proj: { slots: [
        { slot: 'QB', player_id: 'myqb', name: 'MyQB', position: 'QB', points: 10 },
        { slot: 'RB', player_id: 'myrb', name: 'MyRB', position: 'RB', points: 18 },
        { slot: 'WR', player_id: 'mywr', name: 'MyWR', position: 'WR', points: 5 },
        { slot: 'TE', player_id: 'myte', name: 'MyTE', position: 'TE', points: 6 },
      ] } },
      { rosterId: 2, teamName: 'T2', proj: { slots: [
        { slot: 'QB', player_id: 'q2', name: 'Q2', position: 'QB', points: 12 },
        { slot: 'RB', player_id: 'r2', name: 'R2', position: 'RB', points: 15 },
        { slot: 'WR', player_id: 'w2', name: 'W2', position: 'WR', points: 14 },
        { slot: 'TE', player_id: 't2', name: 'T2p', position: 'TE', points: 8 },
      ] } },
      { rosterId: 3, teamName: 'T3', proj: { slots: [
        { slot: 'QB', player_id: 'q3', name: 'Q3', position: 'QB', points: 12 },
        { slot: 'RB', player_id: 'r3', name: 'R3', position: 'RB', points: 16 },
        { slot: 'WR', player_id: 'w3', name: 'W3', position: 'WR', points: 14 },
        { slot: 'TE', player_id: 't3', name: 'T3p', position: 'TE', points: 8 },
      ] } },
    ]
    // Hand-computed per slot (other-teams-only median vs my value):
    // QB: median(12,12)=12, loss=12-10=2 (kept). RB: median(15,16)=15.5, loss=15.5-18=-2.5 (dropped).
    // WR: median(14,14)=14, loss=14-5=9 (kept). TE: median(8,8)=8, loss=8-6=2 (kept).
    const result = buildWeakestSlots(ownLineups, 1)
    // The QB/TE tie (both loss 2) falls back to slotIndex order. Because results are pushed in
    // slot order and Array.prototype.sort is stable, the tie-break cannot be isolated from the
    // input order — that is expected, not a gap to chase.
    expect(result.map(r => r.slotIndex)).toEqual([2, 0, 3])
    expect(result.map(r => r.loss)).toEqual([9, 2, 2])
  })

  it('F1-6b. myRosterId not found or null input -> []', () => {
    expect(buildWeakestSlots(leagueLineups, 999)).toEqual([])
    expect(buildWeakestSlots(null, 1)).toEqual([])
  })
})

describe('buildSlotMedians / startingBar', () => {
  // Fixture A — slots QB, RB, FLEX, SUPER_FLEX. proj values from the task table; last values use
  // distinct QB points (1, 2, 3) so the 'last'-side test is not just re-reading proj.
  const slot = (s, points) => ({ slot: s, player_id: `${s}-p`, name: `${s}-p`, position: s, points })
  const A = [
    {
      rosterId: 1, teamName: 'Me',
      proj: { slots: [slot('QB', 20), slot('RB', 15), slot('FLEX', 10), slot('SUPER_FLEX', 18)] },
      last: { slots: [slot('QB', 1), slot('RB', 15), slot('FLEX', 10), slot('SUPER_FLEX', 18)] },
    },
    {
      rosterId: 2, teamName: 'T2',
      proj: { slots: [slot('QB', 24), slot('RB', 12), slot('FLEX', null), slot('SUPER_FLEX', 14)] },
      last: { slots: [slot('QB', 2), slot('RB', 12), slot('FLEX', null), slot('SUPER_FLEX', 14)] },
    },
    {
      rosterId: 3, teamName: 'T3',
      proj: { slots: [slot('QB', 22), slot('RB', 9), slot('FLEX', 8), slot('SUPER_FLEX', 16)] },
      last: { slots: [slot('QB', 3), slot('RB', 9), slot('FLEX', 8), slot('SUPER_FLEX', 16)] },
    },
  ]

  it('1. buildSlotMedians(A, "proj") — per-slot median across all teams, mine included', () => {
    const m = buildSlotMedians(A, 'proj')
    expect(m.map(x => x.median)).toEqual([22, 12, 9, 16])
    expect(m[2]).toEqual({ slot: 'FLEX', slotIndex: 2, median: 9 })
  })

  it('2. buildSlotMedians(A, "last") reads last.slots', () => {
    const m = buildSlotMedians(A, 'last')
    expect(m[0].median).toBe(2)
  })

  it('3. startingBar — lowest eligible median, TE with no TE slot, K -> null', () => {
    const m = buildSlotMedians(A, 'proj')
    expect(startingBar(m, 'QB')).toEqual({ slot: 'SUPER_FLEX', slotIndex: 3, median: 16 })
    const rbBar = startingBar(m, 'RB')
    expect(rbBar.slotIndex).toBe(2)
    expect(rbBar.median).toBe(9)
    const teBar = startingBar(m, 'TE')
    expect(teBar.slotIndex).toBe(2)
    expect(startingBar(m, 'K')).toBeNull()
  })

  it('4. tie -> lower slotIndex', () => {
    const B = [{
      rosterId: 1, teamName: 'Me',
      proj: { slots: [slot('RB', 10), slot('FLEX', 10)] },
      last: { slots: [slot('RB', 10), slot('FLEX', 10)] },
    }]
    const m = buildSlotMedians(B, 'proj')
    expect(startingBar(m, 'RB').slotIndex).toBe(0)
  })

  it('5. null medians excluded', () => {
    const C = [{
      rosterId: 1, teamName: 'Me',
      proj: { slots: [slot('TE', null), slot('FLEX', 7)] },
      last: { slots: [slot('TE', null), slot('FLEX', 7)] },
    }]
    const mC = buildSlotMedians(C, 'proj')
    expect(startingBar(mC, 'TE').slotIndex).toBe(1)

    const D = [{
      rosterId: 1, teamName: 'Me',
      proj: { slots: [slot('TE', null)] },
      last: { slots: [slot('TE', null)] },
    }]
    const mD = buildSlotMedians(D, 'proj')
    expect(startingBar(mD, 'TE')).toBeNull()
  })

  it('6. empty/null leagueLineups -> []', () => {
    expect(buildSlotMedians([], 'proj')).toEqual([])
    expect(buildSlotMedians(null, 'proj')).toEqual([])
  })
})
