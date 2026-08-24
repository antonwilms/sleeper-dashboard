import { describe, it, expect } from 'vitest'
import { deriveFirstLiveSeason, deriveLiveSeasons, reconstructPickOwnership } from './tradedPicks'
import { parseKtcPickRows } from './ktcPicks'

// ---------------------------------------------------------------------------
// deriveFirstLiveSeason
// ---------------------------------------------------------------------------
describe('deriveFirstLiveSeason', () => {
  const league = { season: '2026' }

  it('a complete current-season draft yields season+1 as first-live', () => {
    const drafts = [{ season: '2026', status: 'complete', type: 'linear' }]
    expect(deriveFirstLiveSeason(drafts, league)).toBe(2027)
  })

  it('an incomplete current-season draft yields the current season', () => {
    const drafts = [{ season: '2026', status: 'drafting', type: 'linear' }]
    expect(deriveFirstLiveSeason(drafts, league)).toBe(2026)
  })

  it('no draft at all for the current season yields the current season (safest default)', () => {
    expect(deriveFirstLiveSeason([{ season: '2025', status: 'complete' }], league)).toBe(2026)
    expect(deriveFirstLiveSeason([], league)).toBe(2026)
  })

  it('never matches by `type` — a "rookie"-typed draft for a DIFFERENT season is not the current one', () => {
    // Sleeper drafts never actually carry type:'rookie' (it's the FORMAT: snake/linear/auction),
    // but even if one did, it must not be picked by type — only by season.
    const drafts = [{ season: '2025', status: 'complete', type: 'rookie' }]
    expect(deriveFirstLiveSeason(drafts, league)).toBe(2026) // no 2026 draft found -> current season
  })

  it('is null-safe', () => {
    expect(deriveFirstLiveSeason(null, league)).toBe(2026)
    expect(deriveFirstLiveSeason(undefined, { season: 'not-a-number' })).toBeNull()
    expect(deriveFirstLiveSeason([], null)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// deriveLiveSeasons
// ---------------------------------------------------------------------------
describe('deriveLiveSeasons — the double-count guard', () => {
  // Real shape: KTC prices 2026/2027/2028 (a season already drafted, "2026", is still priced).
  const ktcRows = [
    { name: '2026 Mid 1st', value: 1 }, { name: '2027 Mid 1st', value: 1 }, { name: '2028 Mid 1st', value: 1 },
  ]
  const ktcPickTable = parseKtcPickRows(ktcRows)

  it('excludes a dead season (2026, already drafted) once first-live is 2027', () => {
    expect(deriveLiveSeasons(2027, ktcPickTable)).toEqual([2027, 2028])
  })

  it('a 2026 traded_picks row would be excluded downstream — this is the double-count guard, asserted directly', () => {
    const live = deriveLiveSeasons(2027, ktcPickTable)
    expect(live).not.toContain(2026)
  })

  it('includes 2026 when its draft has not happened yet (first-live still 2026)', () => {
    expect(deriveLiveSeasons(2026, ktcPickTable)).toEqual([2026, 2027, 2028])
  })

  it('never hard-codes 2027 — a different KTC price set changes the result', () => {
    const narrowTable = parseKtcPickRows([{ name: '2027 Mid 1st', value: 1 }])
    expect(deriveLiveSeasons(2027, narrowTable)).toEqual([2027])
  })

  it('null firstLiveSeason returns empty, not a throw', () => {
    expect(deriveLiveSeasons(null, ktcPickTable)).toEqual([])
  })

  it('null ktcPickTable returns empty, not a throw', () => {
    expect(deriveLiveSeasons(2027, null)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// reconstructPickOwnership
// ---------------------------------------------------------------------------
describe('reconstructPickOwnership', () => {
  const rosterTeams = [{ rosterId: 1 }, { rosterId: 2 }, { rosterId: 3 }]

  it('an untraded pick belongs to its original roster', () => {
    const picks = reconstructPickOwnership({
      rosterTeams, tradedPicks: [], liveSeasons: [2027], draftRounds: 2,
    })
    expect(picks).toHaveLength(6) // 1 season x 2 rounds x 3 rosters
    for (const p of picks) expect(p.ownerRosterId).toBe(p.originalRosterId)
  })

  it('a traded pick belongs to owner_id, not roster_id', () => {
    const tradedPicks = [{ season: '2027', round: 1, roster_id: 2, owner_id: 3, previous_owner_id: 2 }]
    const picks = reconstructPickOwnership({ rosterTeams, tradedPicks, liveSeasons: [2027], draftRounds: 1 })
    const p = picks.find(p => p.originalRosterId === 2)
    expect(p.ownerRosterId).toBe(3)
  })

  it('roster_id/owner_id are read as roster_ids, not user ids — a fixture where the two id spaces disagree', () => {
    // If owner_id were (wrongly) treated as a user id and compared against a roster_id space,
    // this trade would never match anything. It must match roster_id 2's pick to roster_id 5.
    const tradedPicks = [{ season: '2027', round: 3, roster_id: 2, owner_id: 5, previous_owner_id: 2 }]
    const wideRosterTeams = [{ rosterId: 2 }, { rosterId: 5 }]
    const picks = reconstructPickOwnership({ rosterTeams: wideRosterTeams, tradedPicks, liveSeasons: [2027], draftRounds: 3 })
    const moved = picks.find(p => p.originalRosterId === 2 && p.round === 3)
    expect(moved.ownerRosterId).toBe(5)
  })

  it('ground truth (§3): roster 2 ends up with 9 picks after the real trade pattern', () => {
    // 2027 1st traded away from roster 2 to roster 11; everything else stays put.
    const gtRosterTeams = Array.from({ length: 12 }, (_, i) => ({ rosterId: i + 1 }))
    const tradedPicks = [{ season: '2027', round: 1, roster_id: 2, owner_id: 11, previous_owner_id: 2 }]
    const picks = reconstructPickOwnership({
      rosterTeams: gtRosterTeams, tradedPicks, liveSeasons: [2027, 2028], draftRounds: 5,
    })
    const owned = picks.filter(p => p.ownerRosterId === 2)
    expect(owned).toHaveLength(9) // 2028 all 5 rounds + 2027 rounds 2-5
    expect(owned.some(p => p.season === 2027 && p.round === 1)).toBe(false)
  })

  it('enumerates rounds to draftRounds (5), not a hard-coded 4', () => {
    const picks = reconstructPickOwnership({
      rosterTeams: [{ rosterId: 1 }], tradedPicks: [], liveSeasons: [2027], draftRounds: 5,
    })
    expect(picks.map(p => p.round).sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('falls back to 4 rounds when draftRounds is absent', () => {
    const picks = reconstructPickOwnership({
      rosterTeams: [{ rosterId: 1 }], tradedPicks: null, liveSeasons: [2027], draftRounds: null,
    })
    expect(picks).toHaveLength(4)
  })

  it('is safe with empty/null inputs', () => {
    expect(reconstructPickOwnership({ rosterTeams: [], tradedPicks: null, liveSeasons: [], draftRounds: 4 })).toEqual([])
    expect(reconstructPickOwnership({ rosterTeams: null, tradedPicks: null, liveSeasons: [2027], draftRounds: 4 })).toEqual([])
  })
})
