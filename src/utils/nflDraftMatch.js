/**
 * src/utils/nflDraftMatch.js
 *
 * Matches nflverse draft picks to Sleeper player IDs via name + college.
 * Reuses normalizeName / normalizeCollege from collegeMatch.js.
 *
 * Strategy (mirrors collegeMatch.js resolveCandidate):
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
 *   Distinguishing them requires a verified-UDFA list; deferred to D1.5.
 */

import { normalizeName, normalizeCollege } from './collegeMatch'

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
function positionsCompatible(pickPos, candidatePos) {
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

/**
 * @param {{ [year: number]: DraftPick[] }} draftPicksByYear
 * @param {{ [player_id: string]: SleeperPlayer }} playersMap
 * @returns {{ [player_id: string]: NflDraftMatch }}
 *
 * NflDraftMatch = { year, round, pick, team, college, position, ageAtDraft }
 *
 * Only the most-recent matching draft entry per player_id is kept (ascending
 * year iteration → later year overwrites, enforcing the recency rule).
 */
export function matchNflDraftToSleeper(draftPicksByYear, playersMap) {
  if (!draftPicksByYear || !playersMap) return {}

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

  const result = {}
  const skipped = new Set()   // player_ids logged once for ambiguity

  // ── 2. Iterate years ascending (recency rule: later year overwrites) ─────
  const years = Object.keys(draftPicksByYear).map(Number).sort((a, b) => a - b)

  for (const year of years) {
    const picks = draftPicksByYear[year] ?? []

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

      // Match found — overwrite (recency rule: later year wins)
      result[matched.player_id] = {
        year,
        round:       pick.round,
        pick:        pick.pick,
        team:        pick.team,
        college:     pick.college,
        position:    pick.position,
        ageAtDraft:  pick.age ?? null,
      }
    }
  }

  return result
}
