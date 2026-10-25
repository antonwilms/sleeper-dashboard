// ---------------------------------------------------------------------------
// KTC ↔ Sleeper player-ID matching
// ---------------------------------------------------------------------------
// KTC has shipped player data in two formats across code versions:
//
//   v1 (JSON extraction):  { playerName, value, positionID: 0|1|2|3, team }
//   v2 (DOM extraction):   { name, value, position: "QB"|"RB"|..., team }
//
// normalizeEntry() maps both to a canonical shape so the matcher works
// regardless of which format is currently in the IndexedDB cache.
//
// Matching strategy (resolveKtcRows):
//   1. exact name + KTC position (a Sleeper player is indexed under every skill position it has, so
//      `fantasy_positions` counts) → one id wins; several → the one on the KTC row's team; else
//      `ambiguous` (no value — a wrong value is worse than none)
//   2. no exact name → given-name / initials variants + position, and the Sleeper team must equal the
//      KTC team (`alias-team`)
//   3. No match                   → skip entirely
// With the nflverse player-id crosswalk (CR-31) a Sleeper player is also indexed under the crosswalk's
// `name`, which is KTC's own spelling (guarded by surnameAgrees — the crosswalk has wrong rows).
//
// Only high-confidence matches are kept — a wrong value is worse than no value.

import { skillPositions, surnameAgrees, nameVariants } from './playerIdCrosswalk'

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

// KTC spells some franchises differently from Sleeper.
export const KTC_TEAM_ALIAS = { LVR: 'LV', JAC: 'JAX', KCC: 'KC', SFO: 'SF', NEP: 'NE', NOS: 'NO', TBB: 'TB', GBP: 'GB' }
const ktcTeam = t => { const u = (t ?? 'FA').toUpperCase(); return KTC_TEAM_ALIAS[u] ?? u }
const sleeperTeam = p => (p?.team ?? 'FA').toUpperCase()

// v1 format: numeric positionID → position string
const KTC_POSITION_ID = { 0: 'QB', 1: 'RB', 2: 'WR', 3: 'TE' }

// Normalise a KTC entry to { name, position, team, value } regardless of version.
function normalizeEntry(raw) {
  // Name: v2 uses `name`, v1 uses `playerName`
  const name = raw.name ?? raw.playerName ?? null

  // Position: v2 is a string, v1 is a numeric positionID
  let position = null
  if (typeof raw.position === 'string') {
    const p = raw.position.toUpperCase()
    if (SKILL_POSITIONS.has(p)) position = p
  }
  if (!position && raw.positionID != null) {
    position = KTC_POSITION_ID[raw.positionID] ?? null
  }

  return { name, position, team: raw.team ?? null, value: raw.value ?? null }
}

// NOTE: collegeMatch.js also carries its own normalizeName; they differ in suffix/punctuation
// handling and are NOT interchangeable — do not unify without match-rate regression tests.
// Normalize a player name for string comparison:
//   lowercase · remove apostrophes · other punctuation → space
//   strip name suffixes (Jr, Sr, II, III, IV, V) · collapse whitespace
function normalizeName(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')                        // apostrophes: D'Andre → dandre
    .replace(/[^a-z0-9 ]/g, ' ')                 // remaining punctuation → space
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')  // name suffixes
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Resolves every eligible KTC row to a Sleeper id and reports how.
 *
 * @param {Array}  ktcPlayers  Raw array from getKTCValues()
 * @param {Object} playersMap  Sleeper player map { [player_id]: player }
 * @param {Object|null} playerIds  buildPlayerIdIndex() output, or null (name-only joins)
 * @returns {Array<{ row, sid, path, candidates }>}  one per row with a name and value;
 *   path ∈ 'exact' | 'exact-team' | 'alias-team' | 'ambiguous' | 'unmatched'
 */
export function resolveKtcRows(ktcPlayers, playersMap, playerIds = null) {
  if (!ktcPlayers?.length || !playersMap) return []

  // name|POS → Set(sid); alias: variant|POS → Set(sid)
  const exact = new Map()
  const alias = new Map()
  const add = (m, k, sid) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(sid) }

  for (const [sid, player] of Object.entries(playersMap)) {
    if (!player.full_name) continue
    const poss = skillPositions(player)
    if (poss.length === 0) continue
    const names = new Set([normalizeName(player.full_name)])
    const idxName = playerIds?.bySleeper?.[sid]?.name
    if (idxName && surnameAgrees(idxName, player.full_name)) names.add(normalizeName(idxName))
    for (const n of names) {
      for (const pos of poss) {
        add(exact, `${n}|${pos}`, sid)
        for (const v of nameVariants(n)) add(alias, `${v}|${pos}`, sid)
      }
    }
  }

  const out = []
  for (const raw of ktcPlayers) {
    const { name, position, team, value } = normalizeEntry(raw)
    if (!name || value == null) continue
    if (position && !SKILL_POSITIONS.has(position)) continue

    const row = raw
    if (!position) { out.push({ row, sid: null, path: 'unmatched', candidates: [] }); continue }
    const norm = normalizeName(name)
    const kt = ktcTeam(team)

    const E = [...(exact.get(`${norm}|${position}`) ?? [])]
    if (E.length === 1) { out.push({ row, sid: E[0], path: 'exact', candidates: E }); continue }
    if (E.length > 1) {
      const onTeam = E.filter(sid => sleeperTeam(playersMap[sid]) === kt)
      out.push(onTeam.length === 1
        ? { row, sid: onTeam[0], path: 'exact-team', candidates: E }
        : { row, sid: null, path: 'ambiguous', candidates: E })
      continue
    }

    const A = new Set()
    for (const v of nameVariants(norm)) for (const sid of alias.get(`${v}|${position}`) ?? []) A.add(sid)
    const onTeam = [...A].filter(sid => sleeperTeam(playersMap[sid]) === kt)
    out.push(onTeam.length === 1
      ? { row, sid: onTeam[0], path: 'alias-team', candidates: [...A] }
      : { row, sid: null, path: 'unmatched', candidates: [...A] })
  }
  return out
}

/**
 * Matches KTC player entries to Sleeper player IDs.
 *
 * @param {Array}  ktcPlayers  Raw array from getKTCValues()
 * @param {Object} playersMap  Sleeper player map { [player_id]: player }
 * @param {Object|null} playerIds  buildPlayerIdIndex() output, or null
 * @returns {Map<string, { value: number, confidence: 'high' }>}
 */
export function matchKTCToSleeper(ktcPlayers, playersMap, playerIds = null) {
  if (!ktcPlayers?.length || !playersMap) return new Map()

  const result = new Map()
  const counts = { exact: 0, 'exact-team': 0, 'alias-team': 0, ambiguous: 0, unmatched: 0 }
  for (const r of resolveKtcRows(ktcPlayers, playersMap, playerIds)) {
    counts[r.path]++
    if (r.sid) result.set(r.sid, { value: normalizeEntry(r.row).value, confidence: 'high' })
  }

  const matched = counts.exact + counts['exact-team'] + counts['alias-team']
  const total = matched + counts.ambiguous + counts.unmatched
  console.log(
    `[ktc] Matched ${matched} / ${total} entries` +
    ` (${counts.exact} by name+pos, ${counts['exact-team']} by name+pos+team, ${counts['alias-team']} by name-variant+team,` +
    ` ${counts.ambiguous} ambiguous, ${counts.unmatched} unmatched)` +
    ` — match rate ${total > 0 ? Math.round(matched / total * 100) : 0}%`
  )

  return result
}
