import { computeTeamTotals } from '../api/cfbd'
import { skillPositions, surnameAgrees, nameVariants, espnToSleeper } from './playerIdCrosswalk'

// ---------------------------------------------------------------------------
// Name / college normalization
// ---------------------------------------------------------------------------

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

// NOTE: ktcMatch.js also carries its own normalizeName; they differ in suffix/punctuation
// handling and are NOT interchangeable — do not unify without match-rate regression tests.
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

const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])

// Exact-then-word-overlap team agreement (the resolveCandidate rule), on normalized college names.
function teamsAgree(a, b) {
  if (!a || !b) return false
  if (a === b) return true
  const bWords = b.split(' ')
  return a.split(' ').some(w => w.length > 3 && bWords.includes(w))
}

/**
 * Matches CFBD college player entries to Sleeper player_ids.
 *
 * Id path (CR-31, when `playerIds` is given): a CFBD athlete id is the ESPN id the crosswalk carries,
 * so `espnToSleeper` maps it to a Sleeper id — accepted only when the CFBD name and one of the
 * Sleeper / crosswalk names share a surname (the crosswalk has wrong rows).
 *
 * Name path (fallback, and the only path with `playerIds` null):
 *   1. Name lookup from Sleeper playersMap — primary position QB/RB/WR/TE only (a `fantasy_positions`
 *      fullback would otherwise collect wrong seasons by name). Keys: the name's given-name/initials
 *      variants plus the crosswalk `name` / cfbref name when they share a surname with `full_name`.
 *   2. A name candidate is dropped when an id row already covers that year for it (any category), or
 *      when its crosswalk draft year puts the season outside the six years before the draft.
 *   3. Several candidates → college (exact then word-overlap).
 *   4. Same-year collision guard: a sid that name-matched rows of several CFBD ids from different
 *      teams in one year keeps only the id whose team agrees with its known colleges.
 *
 * Pass 1 is receiving-driven; Pass 2 is passing-driven and QB-only. Each season entry carries
 * `matchedBy: 'id' | 'name'` ('id' if any merged row came by id).
 *
 * @param {Object} rawCollegeData - { receiving: { [year]: pivoted }, rushing: { [year]: pivoted }, passing: { [year]: pivoted } }
 * @param {Object} playersMap     - Sleeper playerMap { [player_id]: SleeperPlayer }
 * @param {Object|null} playerIds - buildPlayerIdIndex() output, or null
 * @returns {{ [player_id]: Array<{year, team, receiving, rushing, passing, teamRecTotals, teamRushTotals, teamPassTotals, matchedBy}> }}
 *          Sorted oldest → newest per player.
 */
export function matchCollegeToSleeper(rawCollegeData, playersMap, playerIds = null) {
  if (!rawCollegeData || !playersMap) return {}

  const espn = playerIds ? espnToSleeper(playerIds, playersMap) : new Map()

  // ── 1. Name lookup (fallback universe) ───────────────────────────────────
  // nameMap: normalizedName → [{ player_id, college, colleges, position, draftYear }]
  const nameMap = {}
  for (const [pid, p] of Object.entries(playersMap)) {
    if (!SKILL.has(p.position)) continue
    const full = normalizeName(p.full_name)
    if (!full) continue
    const idx = playerIds?.bySleeper?.[pid] ?? null
    const keys = new Set(nameVariants(full))
    for (const alt of [idx?.name, idx?.cfbrefName]) {
      if (alt && surnameAgrees(alt, p.full_name)) keys.add(normalizeName(alt))
    }
    const cand = {
      player_id: pid,
      college:   normalizeCollege(p.college ?? ''),
      colleges:  [p.college, idx?.college].filter(Boolean),
      position:  p.position,
      draftYear: idx?.draftYear ?? null,
    }
    for (const key of keys) {
      if (!key) continue
      if (!nameMap[key]) nameMap[key] = []
      if (!nameMap[key].some(c => c.player_id === pid)) nameMap[key].push(cand)
    }
  }

  // ── 2. Id resolution ──────────────────────────────────────────────────────
  const idSid = (cfbdId, row) => {
    const sid = espn.get(cfbdId)
    if (!sid) return null
    const idx = playerIds.bySleeper[sid]
    const agrees = [playersMap[sid].full_name, idx?.name, idx?.cfbrefName].some(n => n && surnameAgrees(n, row.player))
    return agrees ? sid : null
  }

  const years = Object.keys(rawCollegeData.receiving).map(Number).sort()
  const CATEGORIES = ['receiving', 'rushing', 'passing']

  // idYears: sid → years in which any category has a row resolving to it by id
  const idYears = new Map()
  if (espn.size) {
    for (const cat of CATEGORIES) {
      for (const year of years) {
        for (const [cfbdId, row] of Object.entries(rawCollegeData[cat]?.[year] ?? {})) {
          const sid = idSid(cfbdId, row)
          if (!sid) continue
          if (!idYears.has(sid)) idYears.set(sid, new Set())
          idYears.get(sid).add(year)
        }
      }
    }
  }

  // ── 3. Iterate years ──────────────────────────────────────────────────────
  const result = {}  // { [player_id]: [...season entries] }

  for (const year of years) {
    // The loader (src/api/cfbd.js's getBulkPlayerStats) already returns pivoted objects
    // (college-pivot.md §2.2) — no pivotStatRows call needed here.
    const pivotedRec  = rawCollegeData.receiving[year]      ?? {}
    const pivotedRush = rawCollegeData.rushing[year]        ?? {}
    const pivotedPass = rawCollegeData.passing?.[year]      ?? {}

    const teamRecTotals  = computeTeamTotals(pivotedRec)
    const teamRushTotals = computeTeamTotals(pivotedRush)
    const teamPassTotals = computeTeamTotals(pivotedPass)

    // → { player_id, position, isQb, via: 'id' | 'name', colleges } | null
    function resolveRow(cfbdId, cfbdPlayer) {
      const sid = idSid(cfbdId, cfbdPlayer)
      if (sid) return { player_id: sid, isQb: skillPositions(playersMap[sid]).includes('QB'), via: 'id', colleges: [] }

      let candidates = nameMap[normalizeName(cfbdPlayer.player)] ?? []
      candidates = candidates.filter(c =>
        !idYears.get(c.player_id)?.has(year)
        && (c.draftYear == null || (year < c.draftYear && year >= c.draftYear - 6)))
      if (candidates.length === 0) return null
      let pick = candidates[0]
      if (candidates.length > 1) {
        const cfbdCollege = normalizeCollege(cfbdPlayer.team ?? '')
        pick = candidates.find(c => c.college && c.college === cfbdCollege)
          ?? candidates.find(c => {
            if (!c.college) return false
            const cWords = c.college.split(' ')
            const fWords = cfbdCollege.split(' ')
            return cWords.some(w => w.length > 3 && fWords.includes(w))
          })
        if (!pick) return null
      }
      return { player_id: pick.player_id, isQb: pick.position === 'QB', via: 'name', colleges: pick.colleges }
    }

    // Resolve every row of the year first (the collision guard needs them all)
    const proposals = []   // { m, cfbdId, row, kind: 'rec' | 'pass' }
    for (const [cfbdId, recPlayer] of Object.entries(pivotedRec)) {
      const m = resolveRow(cfbdId, recPlayer)
      if (m) proposals.push({ m, cfbdId, row: recPlayer, kind: 'rec' })
    }
    for (const [cfbdId, passPlayer] of Object.entries(pivotedPass)) {
      const m = resolveRow(cfbdId, passPlayer)
      if (m && m.isQb) proposals.push({ m, cfbdId, row: passPlayer, kind: 'pass' })
    }

    // Same-year collision guard (name rows only)
    const nameIds = new Map()   // sid → Map(cfbdId → normalized team)
    for (const x of proposals) {
      if (x.m.via !== 'name') continue
      if (!nameIds.has(x.m.player_id)) nameIds.set(x.m.player_id, new Map())
      nameIds.get(x.m.player_id).set(x.cfbdId, normalizeCollege(x.row.team ?? ''))
    }
    const keep = new Map()   // sid → 'ALL' | cfbdId | null
    for (const [sid, ids] of nameIds) {
      if (ids.size === 1 || new Set(ids.values()).size === 1) { keep.set(sid, 'ALL'); continue }
      const colleges = proposals.find(x => x.m.via === 'name' && x.m.player_id === sid).m.colleges.map(c => normalizeCollege(c))
      const agreeing = [...ids].filter(([, team]) => colleges.some(c => teamsAgree(c, team))).map(([id]) => id)
      keep.set(sid, agreeing.length === 1 ? agreeing[0] : null)
    }

    // In-year accumulator — receiving / passing / rushing merge into one season entry per player
    const yearEntries = {}

    function upsert(playerId, fields, via) {
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
          matchedBy:      'name',
        }
      }
      Object.assign(yearEntries[playerId], fields.payload)
      if (via === 'id') yearEntries[playerId].matchedBy = 'id'
    }

    for (const x of proposals) {
      if (x.m.via === 'name') {
        const k = keep.get(x.m.player_id)
        if (k !== 'ALL' && k !== x.cfbdId) continue
      }
      if (x.kind === 'rec') {
        upsert(x.m.player_id, { team: x.row.team, payload: { receiving: x.row, rushing: pivotedRush[x.cfbdId] ?? null } }, x.m.via)
      } else {
        upsert(x.m.player_id, { team: x.row.team, payload: { passing: x.row } }, x.m.via)
      }
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
