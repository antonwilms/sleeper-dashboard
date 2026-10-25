/**
 * src/utils/playerIdCrosswalk.js
 *
 * Pure helpers over the nflverse player-id crosswalk (`nflverse/playerids.json`, CR-31): the index
 * the KTC / draft / college matchers join on, plus the name-variant and surname-sanity helpers they
 * share. No imports from src/api/. The crosswalk is a *key*, never an authority — it carries wrong
 * rows (a Sleeper OL holding a QB's ids), so every id-derived join passes `surnameAgrees` and a
 * skill-position filter.
 */

import { normalizeName } from './collegeMatch'

export const PLAYER_ID_INDEX_VERSION = 1

const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])

/**
 * raw = parsed nflverse/playerids.json (schemaVersion 2). Returns a plain, IndexedDB-cacheable object:
 * { version, generatedAt, bySleeper: { [sid]: { name, cfbrefName, espnId, draftYear, draftOvr, undrafted, college } } }
 * `name` is DynastyProcess's spelling (= KTC's), from `raw.ids[gsisId].name`.
 */
export function buildPlayerIdIndex(raw) {
  const bySleeper = {}
  for (const [sid, b] of Object.entries(raw?.bySleeper ?? {})) {
    if (!sid) continue
    const cfbref = b.cfbrefId ? String(b.cfbrefId).replace(/-\d+$/, '').replace(/-/g, ' ') : null
    bySleeper[sid] = {
      name:       (b.gsisId ? raw.ids?.[b.gsisId]?.name : null) ?? null,
      cfbrefName: cfbref || null,
      espnId:     b.espnId ?? null,
      draftYear:  b.draftYear ?? null,
      draftOvr:   b.draftOvr ?? null,
      undrafted:  b.undrafted ?? null,
      college:    b.college ?? null,
    }
  }
  return { version: PLAYER_ID_INDEX_VERSION, generatedAt: raw?.generatedAt ?? null, bySleeper }
}

/** Skill positions from [position, ...fantasy_positions] ∩ {QB,RB,WR,TE}, primary first, deduped. */
export function skillPositions(player) {
  const out = []
  for (const x of [player?.position, ...(player?.fantasy_positions ?? [])]) {
    if (SKILL.has(x) && !out.includes(x)) out.push(x)
  }
  return out
}

/**
 * True iff both names have ≥ 2 tokens and the last token of either is a non-first token of the other
 * ("KeAndre Lambert-Smith" ~ "Keandre Lambert"; "Sam Hartman" !~ "Richard Gouraige").
 */
export function surnameAgrees(a, b) {
  const ta = normalizeName(a ?? '').split(' ').filter(Boolean)
  const tb = normalizeName(b ?? '').split(' ').filter(Boolean)
  if (ta.length < 2 || tb.length < 2) return false
  return tb.slice(1).includes(ta[ta.length - 1]) || ta.slice(1).includes(tb[tb.length - 1])
}

// Given-name equivalences — name-fallback paths only, never the id paths.
export const GIVEN_NAME_ALIASES = [
  ['matt', 'matthew'], ['ken', 'kenny', 'kenneth'], ['josh', 'joshua'], ['cam', 'cameron'],
  ['mike', 'michael'], ['chris', 'christopher'], ['pat', 'patrick'], ['nate', 'nathan'],
  ['zach', 'zachary'], ['will', 'william'], ['tony', 'anthony'], ['dan', 'daniel'],
  ['jon', 'jonathan'], ['nick', 'nicholas'], ['rob', 'robert'], ['tom', 'thomas'],
]
const ALIAS_GROUP = new Map()
for (const g of GIVEN_NAME_ALIASES) for (const a of g) ALIAS_GROUP.set(a, g)

/**
 * norm = an already-normalised name. Returns [norm, the form with leading single-letter initials joined
 * ('d j moore' → 'dj moore'), and each of those with its first token swapped for every alias-group member].
 */
export function nameVariants(norm) {
  if (!norm || norm.split(' ').length < 2) return [norm]
  const out = new Set([norm])
  out.add(norm.replace(/^((?:[a-z] )+)/, m => m.replace(/ /g, '') + ' '))
  for (const base of [...out]) {
    const toks = base.split(' ')
    const group = ALIAS_GROUP.get(toks[0])
    if (!group) continue
    for (const a of group) out.add([a, ...toks.slice(1)].join(' '))
  }
  return [...out]
}

/**
 * Map<espnId, sid> over index rows whose sid is in playersMap with a skill position. An espnId held by
 * two such sids is dropped (neither gets the id join).
 */
export function espnToSleeper(index, playersMap) {
  const map = new Map()
  const dup = new Set()
  for (const [sid, row] of Object.entries(index?.bySleeper ?? {})) {
    if (!row.espnId || !playersMap?.[sid] || skillPositions(playersMap[sid]).length === 0) continue
    if (map.has(row.espnId)) dup.add(row.espnId)
    else map.set(row.espnId, sid)
  }
  for (const id of dup) map.delete(id)
  return map
}
