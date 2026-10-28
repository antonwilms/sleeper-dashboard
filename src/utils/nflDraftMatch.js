/**
 * src/utils/nflDraftMatch.js
 *
 * Matches nflverse draft picks to Sleeper player IDs. Pass A joins on the nflverse player-id
 * crosswalk (CR-31) when it is loaded; Pass B is the name + college matcher over the picks Pass A did
 * not claim. Reuses normalizeName / normalizeCollege from collegeMatch.js.
 *
 * Pass A (id, `playerIds` given): for each crosswalk row of a skill-position Sleeper player with
 *   `undrafted === false`, take `picksByYear[draftYear]`'s pick whose overall `pick === draftOvr`
 *   (`draftOvr` is the overall pick; the in-round `draftPick` is never joined on). Accepted when the
 *   pick's name equals the Sleeper or crosswalk name, or its college agrees. No position check, so
 *   TE↔RB hybrids and a Sleeper `DB` two-way player (Travis Hunter) match. An accepted pick is claimed.
 *
 * Pass B (name) strategy (mirrors collegeMatch.js resolveCandidate):
 *   1. Build a name lookup from Sleeper playersMap (QB/RB/WR/TE only).
 *   2. For each draft pick iterate ascending by year (so later years overwrite):
 *      a. Normalize pick name → look up candidates.
 *      b. Single candidate: apply position cross-check, then match.
 *      c. Multiple candidates: disambiguate by college (exact then word-overlap).
 *         Still ambiguous → skip (log once).
 *   3. Position cross-check: tolerate HB→RB, FB→RB, blank position. Hard-skip
 *      non-skill positions (OT, DL, etc.) to defend against nflverse labelling
 *      quirks where a lineman's name collides with a skill player.
 *
 * UDFA handling (D1): UDFAs are absent from the nflverse draft CSV.
 *   Both verified UDFAs and name-match misses produce no entry in the result
 *   object → nflDraftMatchSource 'unmatched', multiplier 1.0.
 *   Calibration arc slice 1 (seasonProjection.js resolveDraftCapitalStatus)
 *   infers 'undrafted' from an unmatched result plus an entry year inside the
 *   loaded draft-year set, rather than from a verified-UDFA list. A hybrid whose pick
 *   IS present in picksByYear but is hard-skipped by Pass B's positionsCompatible (Robbie
 *   Ouzts: nflverse TE, Sleeper RB) is matched by Pass A through the crosswalk; with no
 *   crosswalk row (or `playerIds` null) Pass B still skips it, as written above.
 *
 * Pass B discards a match when the sid already has a Pass A entry, or when its crosswalk row says
 * `undrafted === true` or a different `draftYear` than the pick's (another person of the same name).
 */

import { normalizeName, normalizeCollege } from './collegeMatch'
import { skillPositions } from './playerIdCrosswalk'

const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])

// nflverse position labels that should map to Sleeper 'RB'
const RB_ALIASES = new Set(['HB', 'FB'])

// Non-skill positions that should never match a skill-position Sleeper player
// (nflverse occasionally labels linemen / DBs with skill-position-style names)
const NON_SKILL_PICK_POSITIONS = new Set([
  'OT', 'OG', 'OL', 'C', 'IOL',
  'DE', 'DT', 'DL', 'EDGE', 'NT',
  'LB', 'ILB', 'OLB', 'MLB',
  'CB', 'S', 'FS', 'SS', 'DB',
  'K', 'P', 'LS',
])

/**
 * Normalise nflverse position to one of QB/RB/WR/TE or the original string.
 * Returns the original string (upper-cased) if no mapping applies.
 */
function normalizePickPosition(rawPos) {
  if (!rawPos) return ''
  const p = rawPos.trim().toUpperCase()
  if (RB_ALIASES.has(p)) return 'RB'
  return p
}

/**
 * Returns true when pick.position and candidate.position are compatible.
 * Blank pick position is tolerated (returns true).
 * Non-skill pick positions always return false.
 */
export function positionsCompatible(pickPos, candidatePos) {
  const norm = normalizePickPosition(pickPos)
  if (!norm) return true                         // blank → tolerate
  if (NON_SKILL_PICK_POSITIONS.has(norm)) return false
  if (!SKILL.has(norm)) return true              // unknown skill label → tolerate
  return norm === candidatePos
}

/**
 * Resolves a list of same-name candidates against a draft pick's college.
 * Mirrors collegeMatch.js resolveCandidate logic.
 *
 * @param {Array<{player_id, college, position}>} candidates
 * @param {string} pickCollege  normalised college from the draft pick
 * @returns { player_id, college, position } | null
 */
function resolveByCollege(candidates, pickCollege) {
  if (candidates.length === 1) return candidates[0]
  // Exact college match
  const exact = candidates.find(c => c.college && c.college === pickCollege)
  if (exact) return exact
  // Word-overlap match (significant words only)
  const fWords = pickCollege.split(' ')
  return candidates.find(c => {
    if (!c.college) return false
    const cWords = c.college.split(' ')
    return cWords.some(w => w.length > 3 && fWords.includes(w))
  }) ?? null
}

// College agreement by the same exact-then-word-overlap rule as resolveByCollege.
function collegesAgree(a, b) {
  const x = normalizeCollege(a ?? '')
  const y = normalizeCollege(b ?? '')
  if (!x || !y) return false
  if (x === y) return true
  const yWords = y.split(' ')
  return x.split(' ').some(w => w.length > 3 && yWords.includes(w))
}

const entryFor = (pick, year) => ({
  year,
  round:       pick.round,
  pick:        pick.pick,
  team:        pick.team,
  college:     pick.college,
  position:    pick.position,
  ageAtDraft:  pick.age ?? null,
})

/**
 * Pass A — crosswalk id join. Returns { result, claimed } where claimed is a Set of `${year}|${pick}`.
 */
function matchByCrosswalkId(draftPicksByYear, playersMap, playerIds) {
  const result = {}
  const claimed = new Set()
  for (const [sid, row] of Object.entries(playerIds.bySleeper ?? {})) {
    const player = playersMap[sid]
    if (!player || skillPositions(player).length === 0) continue
    if (row.undrafted !== false || row.draftOvr == null || row.draftYear == null) continue
    const picks = draftPicksByYear[row.draftYear]
    if (!picks) continue
    const pick = picks.find(p => p.pick === row.draftOvr)
    if (!pick) continue
    const pickName = normalizeName(pick.fullName)
    const nameOk = pickName === normalizeName(player.full_name)
      || (row.name && pickName === normalizeName(row.name))
    if (!nameOk && !collegesAgree(pick.college, row.college ?? player.college)) continue
    result[sid] = entryFor(pick, Number(row.draftYear))
    claimed.add(`${row.draftYear}|${pick.pick}`)
  }
  return { result, claimed }
}

/**
 * @param {{ [year: number]: DraftPick[] }} draftPicksByYear
 * @param {{ [player_id: string]: SleeperPlayer }} playersMap
 * @param {Object|null} playerIds  buildPlayerIdIndex() output, or null (Pass B only)
 * @returns {{ [player_id: string]: NflDraftMatch }}
 *
 * NflDraftMatch = { year, round, pick, team, college, position, ageAtDraft }
 *
 * Only the most-recent matching draft entry per player_id is kept (ascending
 * year iteration → later year overwrites, enforcing the recency rule).
 */
export function matchNflDraftToSleeper(draftPicksByYear, playersMap, playerIds = null) {
  if (!draftPicksByYear || !playersMap) return {}

  // ── Pass A (id) — claims the picks it accepts; Pass B sees only the rest ──
  const passA = playerIds ? matchByCrosswalkId(draftPicksByYear, playersMap, playerIds) : { result: {}, claimed: new Set() }
  const picksByYear = {}
  for (const [y, picks] of Object.entries(draftPicksByYear)) {
    picksByYear[y] = passA.claimed.size ? (picks ?? []).filter(p => !passA.claimed.has(`${y}|${p.pick}`)) : (picks ?? [])
  }

  // ── 1. Build Sleeper name lookup (skill positions only) ──────────────────
  // nameMap: normalizedName → [{ player_id, college, position, years_exp }]
  const nameMap = {}
  for (const [pid, p] of Object.entries(playersMap)) {
    if (!SKILL.has(p.position)) continue
    const key = normalizeName(p.full_name)
    if (!key) continue
    if (!nameMap[key]) nameMap[key] = []
    nameMap[key].push({
      player_id: pid,
      college:   normalizeCollege(p.college ?? ''),
      position:  p.position,
      years_exp: p.years_exp ?? null,
    })
  }

  const result = { ...passA.result }
  const skipped = new Set()   // player_ids logged once for ambiguity

  // ── 2. Iterate years ascending (recency rule: later year overwrites) ─────
  const years = Object.keys(picksByYear).map(Number).sort((a, b) => a - b)

  for (const year of years) {
    const picks = picksByYear[year] ?? []

    for (const pick of picks) {
      const nameKey = normalizeName(pick.fullName)
      const candidates = nameMap[nameKey]
      if (!candidates || candidates.length === 0) continue  // no Sleeper match → silent

      const pickCollegeKey = normalizeCollege(pick.college ?? '')

      let matched

      if (candidates.length === 1) {
        // Single candidate — only check position
        if (!positionsCompatible(pick.position, candidates[0].position)) {
          if (!skipped.has(candidates[0].player_id)) {
            console.warn(
              `[nflDraftMatch] position mismatch — pick "${pick.fullName}" ${pick.position}`,
              `vs Sleeper ${candidates[0].position} (id ${candidates[0].player_id}); skipping`
            )
            skipped.add(candidates[0].player_id)
          }
          continue
        }
        matched = candidates[0]
      } else {
        // Multiple candidates — filter by position first, then disambiguate by college
        const compatible = candidates.filter(c => positionsCompatible(pick.position, c.position))
        if (compatible.length === 0) continue   // all position-incompatible → skip silently

        if (compatible.length === 1) {
          matched = compatible[0]
        } else {
          matched = resolveByCollege(compatible, pickCollegeKey)
          if (!matched) {
            // Ambiguous even after college disambiguation → skip, log once
            const key = candidates.map(c => c.player_id).sort().join(',')
            if (!skipped.has(key)) {
              console.warn(
                `[nflDraftMatch] ambiguous name "${pick.fullName}" (${candidates.length} candidates);`,
                `college "${pick.college}" didn't resolve — skipping`
              )
              skipped.add(key)
            }
            continue
          }
        }
      }

      // A Pass A entry stands; the crosswalk can also veto a name match for another person
      if (passA.result[matched.player_id]) continue
      const cw = playerIds?.bySleeper?.[matched.player_id]
      // A null crosswalk draftYear does not veto (nothing to contradict) — accepted deviation from §5.2, Fix pass 1 F2.
      if (cw && (cw.undrafted === true || (cw.draftYear != null && cw.draftYear !== year))) continue

      // Match found — overwrite (recency rule: later year wins)
      result[matched.player_id] = entryFor(pick, year)
    }
  }

  return result
}
