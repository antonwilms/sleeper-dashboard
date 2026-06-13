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
// Matching strategy (in order):
//   1. normalizedName + position  → high confidence (preferred)
//   2. normalizedName + team      → high confidence fallback when position absent
//   3. No match                   → skip entirely
//
// Only high-confidence matches are kept — a wrong value is worse than no value.

const SKILL_POSITIONS = new Set(['QB', 'RB', 'WR', 'TE'])

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
 * Matches KTC player entries to Sleeper player IDs.
 *
 * @param {Array}  ktcPlayers  Raw array from getKTCValues()
 * @param {Object} playersMap  Sleeper player map { [player_id]: player }
 * @returns {Map<string, { value: number, confidence: 'high' }>}
 */
export function matchKTCToSleeper(ktcPlayers, playersMap) {
  if (!ktcPlayers?.length || !playersMap) return new Map()

  // ── Build Sleeper lookup tables ──────────────────────────────────────────

  // normName|POSITION → [sleeperId, ...]
  const byNamePos = new Map()
  // normName|TEAM → [sleeperId, ...]  (team = NFL abbreviation, uppercased)
  const byNameTeam = new Map()

  for (const [id, player] of Object.entries(playersMap)) {
    if (!player.full_name || !SKILL_POSITIONS.has(player.position)) continue

    const norm = normalizeName(player.full_name)

    const posKey = `${norm}|${player.position}`
    if (!byNamePos.has(posKey)) byNamePos.set(posKey, [])
    byNamePos.get(posKey).push(id)

    if (player.team) {
      const teamKey = `${norm}|${player.team.toUpperCase()}`
      if (!byNameTeam.has(teamKey)) byNameTeam.set(teamKey, [])
      byNameTeam.get(teamKey).push(id)
    }
  }

  // ── Match KTC entries ─────────────────────────────────────────────────────

  const result = new Map()
  let matchedByPos = 0, matchedByTeam = 0, skipped = 0

  for (const raw of ktcPlayers) {
    const { name, position, team, value } = normalizeEntry(raw)
    if (!name || value == null) continue

    // Skip non-skill positions (K, DEF, draft picks, etc.)
    if (position && !SKILL_POSITIONS.has(position)) continue

    const norm = normalizeName(name)

    // Strategy 1: name + position
    if (position) {
      const ids = byNamePos.get(`${norm}|${position}`)
      if (ids?.length) {
        result.set(ids[0], { value, confidence: 'high' })
        matchedByPos++
        continue
      }
    }

    // Strategy 2: name + team (fallback when position absent or unmatched)
    if (team) {
      const ids = byNameTeam.get(`${norm}|${team.toUpperCase()}`)
      if (ids?.length) {
        result.set(ids[0], { value, confidence: 'high' })
        matchedByTeam++
        continue
      }
    }

    skipped++
  }

  const total = matchedByPos + matchedByTeam + skipped
  console.log(
    `[ktc] Matched ${matchedByPos + matchedByTeam} / ${total} entries` +
    ` (${matchedByPos} by name+pos, ${matchedByTeam} by name+team, ${skipped} unmatched)` +
    ` — match rate ${total > 0 ? Math.round((matchedByPos + matchedByTeam) / total * 100) : 0}%`
  )

  return result
}
