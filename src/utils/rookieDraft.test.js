import { describe, it, expect } from 'vitest'
import { isRookieDraft, selectRookieDraft, rosterSlotCount } from './rookieDraft'

// Both fixtures are the real shapes returned by the live Sleeper API for league
// 1312015497465716736 (Dynasty 040) and its 2025 predecessor — see rookieDraft.js's header.
// Note `player_type: 0` on BOTH: the explicit rookies-only flag is unset in this league, which
// is exactly why it cannot be the only test.

const STARTUP_2025 = {
  draft_id: '1253804639732649984',
  type: 'snake',
  season: '2025',
  status: 'complete',
  settings: {
    rounds: 32, teams: 12, player_type: 0,
    slots_qb: 1, slots_rb: 2, slots_wr: 3, slots_te: 1,
    slots_flex: 2, slots_super_flex: 1, slots_bn: 18,
  },
}

const ROOKIE_2026 = {
  draft_id: '1312015497469919232',
  type: 'linear',
  season: '2026',
  status: 'complete',
  settings: {
    rounds: 5, teams: 12, player_type: 0,
    slots_qb: 1, slots_rb: 2, slots_wr: 3, slots_te: 1,
    slots_flex: 2, slots_super_flex: 1, slots_bn: 18,
  },
}

const LEAGUE_2025_STARTUP = { season: '2025', previous_league_id: null, roster_positions: new Array(28).fill('X') }
const LEAGUE_2026_CONT = { season: '2026', previous_league_id: '1253804638616956928', roster_positions: new Array(28).fill('X') }

describe('rookieDraft', () => {
  describe('the bug this replaces', () => {
    it('neither real draft has type "rookie" — the old filter matched nothing', () => {
      expect(STARTUP_2025.type).toBe('snake')
      expect(ROOKIE_2026.type).toBe('linear')
      const oldFilter = [STARTUP_2025, ROOKIE_2026].filter(d => d.type === 'rookie')
      expect(oldFilter).toEqual([])
    })

    it('the replacement finds the 2026 rookie draft the old filter missed', () => {
      expect(selectRookieDraft([STARTUP_2025, ROOKIE_2026], LEAGUE_2026_CONT)).toBe(ROOKIE_2026)
    })
  })

  describe('isRookieDraft', () => {
    it('the 2026 short draft in a continuation league is a rookie draft', () => {
      expect(isRookieDraft(ROOKIE_2026, LEAGUE_2026_CONT)).toBe(true)
    })

    it('a roster-filling startup is not, even in a continuation league', () => {
      // rounds 32 >= 28 roster slots — it fills a roster, so it is a startup.
      expect(isRookieDraft(STARTUP_2025, LEAGUE_2026_CONT)).toBe(false)
    })

    it('a first-season league has no rookie draft — previous_league_id is null', () => {
      expect(isRookieDraft(STARTUP_2025, LEAGUE_2025_STARTUP)).toBe(false)
      // even a short draft: with no prior season there are no rookie picks to inherit
      expect(isRookieDraft(ROOKIE_2026, LEAGUE_2025_STARTUP)).toBe(false)
    })

    it('a redraft/keeper league year 2+ is not a rookie draft — this is what the rounds guard protects', () => {
      const redraft = { ...ROOKIE_2026, settings: { ...ROOKIE_2026.settings, rounds: 28 } }
      expect(isRookieDraft(redraft, LEAGUE_2026_CONT)).toBe(false)
    })

    it('honours an explicit player_type over the inference, in both directions', () => {
      const explicitRookie = { ...STARTUP_2025, settings: { ...STARTUP_2025.settings, player_type: 1 } }
      expect(isRookieDraft(explicitRookie, LEAGUE_2025_STARTUP)).toBe(true)

      const explicitVets = { ...ROOKIE_2026, settings: { ...ROOKIE_2026.settings, player_type: 2 } }
      expect(isRookieDraft(explicitVets, LEAGUE_2026_CONT)).toBe(false)
    })

    it('is null-safe', () => {
      expect(isRookieDraft(null, LEAGUE_2026_CONT)).toBe(false)
      expect(isRookieDraft(ROOKIE_2026, null)).toBe(false)
      expect(isRookieDraft({}, LEAGUE_2026_CONT)).toBe(false)
      expect(isRookieDraft({ settings: { rounds: 5 } }, { previous_league_id: 'x' })).toBe(false)
    })
  })

  describe('rosterSlotCount', () => {
    it('prefers the league roster_positions length', () => {
      expect(rosterSlotCount(ROOKIE_2026, LEAGUE_2026_CONT)).toBe(28)
    })

    it('falls back to summing the draft slots_* settings', () => {
      expect(rosterSlotCount(ROOKIE_2026, {})).toBe(28)
    })

    it('returns null when neither source is present', () => {
      expect(rosterSlotCount({ settings: { rounds: 5 } }, {})).toBe(null)
    })
  })

  describe('selectRookieDraft', () => {
    it('returns the most recent rookie draft by season, comparing seasons numerically', () => {
      const rookie2027 = { ...ROOKIE_2026, draft_id: 'later', season: '2027' }
      // string sort would put '2027' and '2026' in the same order here, so also check a
      // boundary where lexical and numeric ordering disagree
      const rookie999 = { ...ROOKIE_2026, draft_id: 'old', season: '999' }
      expect(selectRookieDraft([ROOKIE_2026, rookie2027, rookie999], LEAGUE_2026_CONT)).toBe(rookie2027)
    })

    it('returns null when no draft qualifies, and is null-safe on input', () => {
      expect(selectRookieDraft([STARTUP_2025], LEAGUE_2025_STARTUP)).toBe(null)
      expect(selectRookieDraft([], LEAGUE_2026_CONT)).toBe(null)
      expect(selectRookieDraft(null, LEAGUE_2026_CONT)).toBe(null)
      expect(selectRookieDraft(undefined, undefined)).toBe(null)
    })
  })
})
