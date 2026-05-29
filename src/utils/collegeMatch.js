import { pivotStatRows, computeTeamTotals } from '../api/cfbd'

// ---------------------------------------------------------------------------
// Name / college normalization
// ---------------------------------------------------------------------------

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

export function normalizeName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/['.]/g, '')           // remove apostrophes & periods
    .replace(/[^a-z0-9\s]/g, ' ')  // replace remaining punctuation with spaces
    .split(/\s+/)
    .filter(w => w && !SUFFIXES.has(w))
    .join(' ')
    .trim()
}

const COLLEGE_ALIASES = {
  'lsu':                   'louisiana state',
  'ole miss':              'mississippi',
  'usc':                   'southern california',
  'ucf':                   'central florida',
  'smu':                   'southern methodist',
  'tcu':                   'texas christian',
  'vt':                    'virginia tech',
  'uva':                   'virginia',
  'unc':                   'north carolina',
  'ncsu':                  'nc state',
  'north carolina state':  'nc state',
  'pitt':                  'pittsburgh',
  'ole miss':              'mississippi',
  'fiu':                   'florida international',
  'fau':                   'florida atlantic',
  'umass':                 'massachusetts',
  'miami fl':              'miami',
  'miami oh':              'miami ohio',
  'byu':                   'brigham young',
  'unlv':                  'nevada las vegas',
  'utsa':                  'texas san antonio',
  'utep':                  'texas el paso',
  'uab':                   'alabama birmingham',
  'wku':                   'western kentucky',
  'niu':                   'northern illinois',
  'wmu':                   'western michigan',
  'emu':                   'eastern michigan',
  'cmu':                   'central michigan',
}

export function normalizeCollege(name) {
  if (!name) return ''
  let n = name
    .toLowerCase()
    .replace(/['.]/g, '')
    .replace(/\buniversity\b/g, '')
    .replace(/\bcollege\b/g, '')
    .replace(/\bthe\b/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Apply aliases (check both before and after normalization)
  if (COLLEGE_ALIASES[n]) n = COLLEGE_ALIASES[n]

  return n
}

// ---------------------------------------------------------------------------
// Main matching function
// ---------------------------------------------------------------------------

/**
 * Matches CFBD college player entries to Sleeper player_ids.
 *
 * Strategy:
 *   1. Build a name-keyed lookup from Sleeper playersMap (QB/RB/WR/TE only).
 *      Key = normalizeName(full_name), value = array of candidates
 *      (multiple players can share the same normalized name).
 *   2. For each year in rawCollegeData.receiving:
 *      a. Pivot receiving rows and rushing rows into player objects.
 *      b. Compute team totals for both.
 *      c. For each CFBD player: match by normalized name first.
 *         If multiple candidates, use college (from CFBD "team" field in
 *         rawCollegeData context — note: for college stats "team" is the
 *         college team name) vs Sleeper "college" field to disambiguate.
 *   3. Accumulate per player_id: one entry per year they appear.
 *
 * @param {Object} rawCollegeData - { receiving: { [year]: rows[] }, rushing: { [year]: rows[] }, passing: { [year]: rows[] } }
 * @param {Object} playersMap     - Sleeper playerMap { [player_id]: SleeperPlayer }
 * @returns {{ [player_id]: Array<{year, team, receiving, rushing, passing, teamRecTotals, teamRushTotals, teamPassTotals}> }}
 *          Sorted oldest → newest per player.
 */
export function matchCollegeToSleeper(rawCollegeData, playersMap) {
  if (!rawCollegeData || !playersMap) return {}

  // ── 1. Build Sleeper name lookup ─────────────────────────────────────────
  const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])
  // nameMap: normalizedName → [{ player_id, college, position }]
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
    })
  }

  // ── 2. Iterate years ──────────────────────────────────────────────────────
  const result = {}  // { [player_id]: [...season entries] }

  const years = Object.keys(rawCollegeData.receiving).map(Number).sort()

  for (const year of years) {
    const recRows  = rawCollegeData.receiving[year]      ?? []
    const rushRows = rawCollegeData.rushing[year]        ?? []
    const passRows = rawCollegeData.passing?.[year]      ?? []

    const pivotedRec  = pivotStatRows(recRows)
    const pivotedRush = pivotStatRows(rushRows)
    const pivotedPass = pivotStatRows(passRows)

    const teamRecTotals  = computeTeamTotals(pivotedRec)
    const teamRushTotals = computeTeamTotals(pivotedRush)
    const teamPassTotals = computeTeamTotals(pivotedPass)

    // Shared disambiguation helper
    function resolveCandidate(cfbdPlayer) {
      const nameKey    = normalizeName(cfbdPlayer.player)
      const candidates = nameMap[nameKey]
      if (!candidates || candidates.length === 0) return null
      if (candidates.length === 1) return candidates[0]
      const cfbdCollege = normalizeCollege(cfbdPlayer.team ?? '')
      const exact = candidates.find(c => c.college && c.college === cfbdCollege)
      if (exact) return exact
      return candidates.find(c => {
        if (!c.college) return false
        const cWords = c.college.split(' ')
        const fWords = cfbdCollege.split(' ')
        return cWords.some(w => w.length > 3 && fWords.includes(w))
      }) ?? null
    }

    // In-year accumulator — receiving / passing / rushing merge into one season entry per player
    const yearEntries = {}

    function upsert(playerId, fields) {
      if (!yearEntries[playerId]) {
        yearEntries[playerId] = {
          year,
          team:           fields.team,
          receiving:      null,
          rushing:        null,
          passing:        null,
          teamRecTotals:  teamRecTotals[fields.team]  ?? { YDS: 0, TD: 0 },
          teamRushTotals: teamRushTotals[fields.team] ?? { YDS: 0, TD: 0 },
          teamPassTotals: teamPassTotals[fields.team] ?? { YDS: 0, TD: 0 },
        }
      }
      Object.assign(yearEntries[playerId], fields.payload)
    }

    // Pass 1 — receiving-driven (skill players; existing logic)
    for (const [cfbdId, recPlayer] of Object.entries(pivotedRec)) {
      const matched = resolveCandidate(recPlayer)
      if (!matched) continue
      const rushPlayer = pivotedRush[cfbdId] ?? null
      upsert(matched.player_id, {
        team:    recPlayer.team,
        payload: { receiving: recPlayer, rushing: rushPlayer },
      })
    }

    // Pass 2 — passing-driven (QBs only; skip rows already matched via Pass 1)
    for (const [, passPlayer] of Object.entries(pivotedPass)) {
      const matched = resolveCandidate(passPlayer)
      if (!matched) continue
      if (matched.position !== 'QB') continue
      upsert(matched.player_id, {
        team:    passPlayer.team,
        payload: { passing: passPlayer },
      })
    }

    // Flush year accumulator into result
    for (const [pid, entry] of Object.entries(yearEntries)) {
      if (!result[pid]) result[pid] = []
      result[pid].push(entry)
    }
  }

  // Ensure entries are sorted oldest → newest per player
  for (const pid of Object.keys(result)) {
    result[pid].sort((a, b) => a.year - b.year)
  }

  console.log('[collegeMatch] matched player count:', Object.keys(result).length)

  const qbCount = Object.values(result).filter(seasons =>
    seasons.some(s => s.passing != null)
  ).length
  console.log('[collegeMatch] QBs with passing data:', qbCount)

  const sample = Object.entries(result).find(([, seasons]) => seasons.length >= 2)
  if (sample) {
    console.log('[collegeMatch] sample player_id:', sample[0], '— seasons:', sample[1].map(s => s.year))
  }

  return result
}
