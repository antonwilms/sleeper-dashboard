import { describe, it, expect } from 'vitest'
import {
  buildPlayerIdIndex, PLAYER_ID_INDEX_VERSION, skillPositions, surnameAgrees, nameVariants, espnToSleeper,
} from './playerIdCrosswalk'

describe('buildPlayerIdIndex', () => {
  const raw = {
    schemaVersion: 2, generatedAt: '2026-10-21T18:07:53.362Z',
    ids: { g1: { sleeperId: '1', name: "D.J. Moore", position: 'WR' } },
    bySleeper: {
      1: { gsisId: 'g1', cfbrefId: 'dj-moore-1', espnId: '3116406', draftYear: 2018, draftOvr: 24, draftRound: 1, draftPick: 24, undrafted: false, college: 'Maryland' },
      2: { gsisId: null, cfbrefId: null, espnId: null, draftYear: null, draftOvr: null, undrafted: null, college: null },
      '': { gsisId: 'g1' },
    },
  }
  it('takes name from ids[gsisId] (KTC spelling), turns the cfbref slug into a name, keeps nulls, versions the index', () => {
    const idx = buildPlayerIdIndex(raw)
    expect(idx.version).toBe(PLAYER_ID_INDEX_VERSION)
    expect(idx.generatedAt).toBe('2026-10-21T18:07:53.362Z')
    expect(idx.bySleeper[1]).toEqual({ name: 'D.J. Moore', cfbrefName: 'dj moore', espnId: '3116406', draftYear: 2018, draftOvr: 24, undrafted: false, college: 'Maryland' })
    expect(idx.bySleeper[2]).toEqual({ name: null, cfbrefName: null, espnId: null, draftYear: null, draftOvr: null, undrafted: null, college: null })
  })
  it('skips rows whose sleeper id is empty and tolerates a missing payload', () => {
    expect(Object.keys(buildPlayerIdIndex(raw).bySleeper)).toEqual(['1', '2'])
    expect(buildPlayerIdIndex(null).bySleeper).toEqual({})
  })
})

describe('skillPositions', () => {
  it('Travis Hunter shape: position DB + fantasy_positions [DB, WR] → [WR]; primary first, deduped', () => {
    expect(skillPositions({ position: 'DB', fantasy_positions: ['DB', 'WR'] })).toEqual(['WR'])
    expect(skillPositions({ position: 'RB', fantasy_positions: ['RB', 'WR'] })).toEqual(['RB', 'WR'])
    expect(skillPositions({ position: 'OL' })).toEqual([])
  })
})

describe('surnameAgrees', () => {
  it('Lambert ~ Lambert-Smith agrees (either direction)', () => {
    expect(surnameAgrees('Keandre Lambert', 'KeAndre Lambert-Smith')).toBe(true)
    expect(surnameAgrees('KeAndre Lambert-Smith', 'Keandre Lambert')).toBe(true)
  })
  it('Hartman vs Gouraige (a wrong crosswalk row) does not agree', () => {
    expect(surnameAgrees('Sam Hartman', 'Richard Gouraige')).toBe(false)
  })
  it('a single-token name never agrees', () => {
    expect(surnameAgrees('Cher', 'Cher Smith')).toBe(false)
  })
})

describe('nameVariants', () => {
  it("joins leading initials: 'd j moore' → includes 'dj moore'", () => {
    expect(nameVariants('d j moore')).toContain('dj moore')
  })
  it("swaps the given name across an alias group: 'matt hibner' → includes 'matthew hibner'; and back", () => {
    expect(nameVariants('matt hibner')).toContain('matthew hibner')
    expect(nameVariants('matthew hibner')).toContain('matt hibner')
    expect(nameVariants('kenny gainwell')).toContain('kenneth gainwell')
  })
  it('always includes the input and leaves a single token alone', () => {
    expect(nameVariants('josh allen')[0]).toBe('josh allen')
    expect(nameVariants('cher')).toEqual(['cher'])
  })
})

describe('espnToSleeper', () => {
  const index = { bySleeper: { 1: { espnId: 'e1' }, 2: { espnId: 'e2' }, 3: { espnId: 'e2' }, 4: { espnId: 'e4' }, 5: { espnId: null }, 6: { espnId: 'e6' } } }
  const playersMap = {
    1: { position: 'WR' }, 2: { position: 'RB' }, 3: { position: 'RB' }, 4: { position: 'OL' }, 5: { position: 'QB' },
  }
  it('maps espn id → sid, drops an espn id held by two skill sids, non-skill sids, null ids and sids missing from playersMap', () => {
    const m = espnToSleeper(index, playersMap)
    expect([...m.entries()]).toEqual([['e1', '1']])
  })
})
