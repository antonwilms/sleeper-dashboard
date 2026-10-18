// V3 — KTC / NFL-draft / college joins for the top KTC players. Runs the app's matchers on their full
// inputs, then diagnoses only the outcomes for the top-N rows.
import { matchKTCToSleeper } from '../../../src/utils/ktcMatch.js'
import { matchCollegeToSleeper, normalizeName as collegeNormalizeName, normalizeCollege } from '../../../src/utils/collegeMatch.js'
import { matchNflDraftToSleeper } from '../../../src/utils/nflDraftMatch.js'

const SKILL = new Set(['QB', 'RB', 'WR', 'TE'])
// Plan alias map is { LVR, JAC }; KTC also spells KCC/SFO/NEP/NOS/TBB/GBP (verified in the 2026-10 snapshot),
// so those are aliased too — otherwise ~85 top rows flag as ktc-team-disagree on spelling alone.
const TEAM_ALIAS = { LVR: 'LV', JAC: 'JAX', KCC: 'KC', SFO: 'SF', NEP: 'NE', NOS: 'NO', TBB: 'TB', GBP: 'GB' }
export const DRAFT_FLOOR = 2017

// Verbatim copy of src/utils/ktcMatch.js normalizeName (ktcMatch.js:47; private there, so not importable).
export function ktcNormalizeName(name) {
  return name
    .toLowerCase()
    .replace(/['']/g, '')                        // apostrophes: D'Andre → dandre
    .replace(/[^a-z0-9 ]/g, ' ')                 // remaining punctuation → space
    .replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g, '')  // name suffixes
    .replace(/\s+/g, ' ')
    .trim()
}

// Local copy of nflDraftMatch.js positionsCompatible (private there; lines 39–69).
const RB_ALIASES = new Set(['HB', 'FB'])
const NON_SKILL = new Set(['OT', 'OG', 'OL', 'C', 'IOL', 'DE', 'DT', 'DL', 'EDGE', 'NT', 'LB', 'ILB', 'OLB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB', 'K', 'P', 'LS'])
export function positionsCompatible(pickPos, candPos) {
  const n = !pickPos ? '' : (RB_ALIASES.has(pickPos.trim().toUpperCase()) ? 'RB' : pickPos.trim().toUpperCase())
  if (!n) return true
  if (NON_SKILL.has(n)) return false
  if (!SKILL.has(n)) return true
  return n === candPos
}

const sleeperTeam = t => (t == null || t === 'FA' ? 'FA' : t)
const ktcTeam = t => { const u = (t ?? 'FA').toUpperCase(); return TEAM_ALIAS[u] ?? u }

// Top-N KTC skill rows by value desc → [{ rank, name, team, position, value }].
export function topKtcRows(ktcRows, n = 400) {
  return ktcRows
    .filter(r => SKILL.has(r.position) && r.value != null)
    .sort((a, b) => b.value - a.value)
    .slice(0, n)
    .map((r, i) => ({ rank: i + 1, name: r.name, team: r.team, position: r.position, value: r.value }))
}

// Replicates the matcher's lookup per row so the winning path can be reported. Returns
// { sid, path: 'name|pos'|'name|team'|null, nCandidates, posIds, teamIds }.
export function buildKtcResolver(playersMap) {
  const byNamePos = new Map(), byNameTeam = new Map()
  for (const [id, p] of Object.entries(playersMap)) {
    if (!p.full_name || !SKILL.has(p.position)) continue
    const norm = ktcNormalizeName(p.full_name)
    const pk = `${norm}|${p.position}`
    if (!byNamePos.has(pk)) byNamePos.set(pk, [])
    byNamePos.get(pk).push(id)
    if (p.team) {
      const tk = `${norm}|${p.team.toUpperCase()}`
      if (!byNameTeam.has(tk)) byNameTeam.set(tk, [])
      byNameTeam.get(tk).push(id)
    }
  }
  return function resolve(row) {
    const norm = ktcNormalizeName(row.name ?? '')
    const posIds = row.position ? byNamePos.get(`${norm}|${row.position}`) : null
    if (posIds?.length) return { sid: posIds[0], path: 'name|pos', nCandidates: posIds.length, ids: posIds }
    const teamIds = row.team ? byNameTeam.get(`${norm}|${row.team.toUpperCase()}`) : null
    if (teamIds?.length) return { sid: teamIds[0], path: 'name|team', nCandidates: teamIds.length, ids: teamIds }
    return { sid: null, path: null, nCandidates: 0, ids: [] }
  }
}

function sameLastTokenHint(playersMap, name) {
  const tok = ktcNormalizeName(name).split(' ').pop()
  if (!tok) return []
  const out = []
  for (const [id, p] of Object.entries(playersMap)) {
    if (!p.full_name || !SKILL.has(p.position)) continue
    if (ktcNormalizeName(p.full_name).split(' ').pop() === tok) out.push({ sid: id, name: p.full_name, position: p.position, team: p.team ?? null })
    if (out.length >= 5) break
  }
  return out
}

export function diagnoseKtc(top, ktcRowsAll, playersMap, ktcMap) {
  const resolve = buildKtcResolver(playersMap)
  const flagged = []
  const targets = new Map()   // sid → rows resolving there (all rows)
  for (const r of ktcRowsAll) {
    if (!r.name || r.value == null || (r.position && !SKILL.has(r.position))) continue
    const res = resolve(r)
    if (res.sid) { if (!targets.has(res.sid)) targets.set(res.sid, []); targets.get(res.sid).push(r) }
  }
  const resolved = new Map()
  for (const r of top) {
    const res = resolve(r)
    resolved.set(r.rank, res.sid)
    const reasons = []
    const evidence = {}
    if (!res.sid) {
      reasons.push('ktc-unmatched')
      evidence.hint = sameLastTokenHint(playersMap, r.name)
    } else {
      if (res.nCandidates > 1) { reasons.push('ktc-ambiguous-first-taken'); evidence.candidates = res.ids }
      const p = playersMap[res.sid]
      if (res.path === 'name|team') {
        reasons.push('ktc-team-fallback')
        evidence.positions = { ktc: r.position, sleeper: p.position }
      }
      if (ktcTeam(r.team) !== sleeperTeam(p.team)) {
        reasons.push('ktc-team-disagree')
        evidence.teams = { ktc: r.team, sleeper: p.team ?? null }
      }
      const dup = targets.get(res.sid) ?? []
      if (dup.length > 1) { reasons.push('ktc-duplicate-target'); evidence.duplicates = dup.map(d => ({ name: d.name, team: d.team, value: d.value })) }
      if (ktcMap && !ktcMap.has(res.sid)) evidence.replicaDisagreesWithMatcher = true
    }
    if (reasons.length) flagged.push({ ...r, sid: res.sid, reasons, evidence })
  }
  return { flagged, resolved }
}

// Draft + college checks for the resolved top-N rows. crosswalk = { bySleeper, ids }.
// NB: nflverse draft_picks `pick` is the OVERALL pick; the crosswalk `draftPick` is in-round, so the
// comparison uses crosswalk `draftOvr`.
export function diagnoseDraft(top, resolved, playersMap, picksByYear, drafts, crosswalk) {
  const nameMap = {}
  for (const [pid, p] of Object.entries(playersMap)) {
    if (!SKILL.has(p.position)) continue
    const key = collegeNormalizeName(p.full_name)
    if (!key) continue
    ;(nameMap[key] ??= []).push({ player_id: pid, college: normalizeCollege(p.college ?? ''), position: p.position })
  }
  const flagged = []
  const info = { outOfWindow: [], noCrosswalk: [] }
  for (const r of top) {
    const sid = resolved.get(r.rank)
    if (!sid) continue
    const cw = crosswalk.bySleeper?.[sid]
    const d = drafts[sid]
    if (!cw) { info.noCrosswalk.push({ ...r, sid }); if (!d) continue }
    const reasons = []
    const evidence = {}
    if (cw && cw.draftYear != null && cw.draftYear < DRAFT_FLOOR) {
      info.outOfWindow.push({ ...r, sid, draftYear: cw.draftYear })
      reasons.push('draft-out-of-window')
      if (d) { reasons.push('draft-spurious'); evidence.matched = d }
    } else if (cw) {
      if (cw.undrafted === false && cw.draftYear != null && !d) {
        reasons.push('draft-missing')
        evidence.subReason = missingSubReason(sid, cw, playersMap, picksByYear, nameMap, crosswalk)
        evidence.crosswalk = { draftYear: cw.draftYear, draftRound: cw.draftRound, draftPick: cw.draftPick }
      } else if (d && cw.undrafted === true) {
        reasons.push('draft-spurious'); evidence.matched = d; evidence.crosswalk = { undrafted: true }
      } else if (d && (d.year !== cw.draftYear || d.round !== cw.draftRound || (cw.draftOvr != null && d.pick !== cw.draftOvr))) {
        reasons.push('draft-disagree')
        evidence.matched = { year: d.year, round: d.round, overallPick: d.pick }
        evidence.crosswalk = { draftYear: cw.draftYear, draftRound: cw.draftRound, draftOvr: cw.draftOvr }
      }
    }
    if (reasons.length) flagged.push({ ...r, sid, reasons, evidence })
  }
  return { flagged, info }
}

// Why did the matcher produce no entry for a player the crosswalk says was drafted?
export function missingSubReason(sid, cw, playersMap, picksByYear, nameMap, crosswalk) {
  const sleeperName = collegeNormalizeName(playersMap[sid]?.full_name)
  const gsis = crosswalk?.ids?.[cw.gsisId]?.name
  const cwName = gsis ? collegeNormalizeName(gsis) : null
  const picks = picksByYear[cw.draftYear] ?? []
  const pick = picks.find(p => collegeNormalizeName(p.fullName) === sleeperName)
    ?? (cwName ? picks.find(p => collegeNormalizeName(p.fullName) === cwName) : null)
    ?? picks.find(p => p.pick === cw.draftOvr)
  if (!pick) return 'name-not-found'
  const cands = nameMap[collegeNormalizeName(pick.fullName)]
  if (!cands || !cands.some(c => c.player_id === sid)) return 'name-not-found'
  const compat = cands.filter(c => positionsCompatible(pick.position, c.position))
  if (!compat.some(c => c.player_id === sid)) return 'position-incompatible'
  if (compat.length > 1) return 'ambiguous-name'
  return 'unknown'
}

const sig = (s, n = 3) => (s ?? '').split(' ').filter(w => w.length > n)
function collegeAgrees(team, ...sources) {
  const t = normalizeCollege(team)
  return sources.some(src => {
    const c = normalizeCollege(src ?? '')
    if (!c) return false
    return c === t || sig(c).some(w => sig(t).includes(w))
  })
}

// rawCollege = { receiving: {year: players}, rushing: {...}, passing: {...} } (pivoted players maps).
export function diagnoseCollege(top, resolved, playersMap, collegeMatches, rawCollege, crosswalk, currentYear) {
  const flagged = []
  const rushingOnlyRbs = []
  for (const r of top) {
    const sid = resolved.get(r.rank)
    if (!sid) continue
    const p = playersMap[sid]
    const cw = crosswalk.bySleeper?.[sid]
    const seasons = collegeMatches[sid] ?? []
    const reasons = [], evidence = {}
    const draftYear = cw?.draftYear ?? (p?.years_exp != null ? currentYear - p.years_exp : null)
    const impliesCollege = draftYear != null && draftYear - 1 >= 2017 && draftYear - 1 <= 2025
    const norm = collegeNormalizeName(p?.full_name)
    if (seasons.length === 0) {
      if (impliesCollege) {
        reasons.push('college-none')
        const found = {}
        for (const cat of ['receiving', 'rushing', 'passing']) {
          const yrs = Object.entries(rawCollege[cat] ?? {}).filter(([, m]) => Object.values(m).some(x => collegeNormalizeName(x.player) === norm)).map(([y]) => Number(y))
          if (yrs.length) found[cat] = yrs
        }
        evidence.cfbdNameFound = found
        // rushing-only: name in a rushing file with no same-name receiving row that year
        for (const [yr, rush] of Object.entries(rawCollege.rushing ?? {})) {
          const hasRush = Object.values(rush).some(x => collegeNormalizeName(x.player) === norm)
          const hasRec = Object.values(rawCollege.receiving?.[yr] ?? {}).some(x => collegeNormalizeName(x.player) === norm)
          if (hasRush && !hasRec) {
            reasons.push('college-rushing-only'); evidence.rushingYear = Number(yr)
            if (p?.position === 'RB') rushingOnlyRbs.push({ ...r, sid })
            break
          }
        }
      }
    } else {
      if (!seasons.some(s => collegeAgrees(s.team, cw?.college, p?.college)) && (cw?.college || p?.college)) {
        reasons.push('college-disagree')
        evidence.matchedTeams = seasons.map(s => ({ year: s.year, team: s.team }))
        evidence.sources = { crosswalk: cw?.college ?? null, sleeper: p?.college ?? null }
      }
      if (draftYear != null && seasons.some(s => s.year >= draftYear)) {
        reasons.push('college-after-draft'); evidence.seasons = seasons.map(s => s.year); evidence.draftYear = draftYear
      }
      for (const s of seasons) {
        const ids = new Set()
        for (const cat of ['receiving', 'rushing', 'passing']) {
          for (const [id, x] of Object.entries(rawCollege[cat]?.[s.year] ?? {})) {
            if (collegeNormalizeName(x.player) === norm) ids.add(x.playerId ?? id)
          }
        }
        if (ids.size > 1) { reasons.push('college-name-collision'); evidence.collisionYear = s.year; evidence.cfbdIds = [...ids]; break }
      }
    }
    if (reasons.length) flagged.push({ ...r, sid, reasons, evidence })
  }
  return { flagged, rushingOnlyRbs }
}

// Run all three matchers on their full inputs, then diagnose the top rows.
export function runV3({ ktcRowsAll, playersMap, picksByYear, rawCollege, crosswalk, currentYear, topN = 400 }) {
  const quiet = (fn) => { const l = console.log, w = console.warn; console.log = () => {}; console.warn = () => {}; try { return fn() } finally { console.log = l; console.warn = w } }
  const ktcMap = quiet(() => matchKTCToSleeper(ktcRowsAll, playersMap))
  const windowed = Object.fromEntries(Object.entries(picksByYear).filter(([y]) => Number(y) >= DRAFT_FLOOR && Number(y) <= currentYear))
  const drafts = quiet(() => matchNflDraftToSleeper(windowed, playersMap))
  const collegeMatches = quiet(() => matchCollegeToSleeper(rawCollege, playersMap))
  const top = topKtcRows(ktcRowsAll, topN)
  const ktc = diagnoseKtc(top, ktcRowsAll, playersMap, ktcMap)
  const draft = diagnoseDraft(top, ktc.resolved, playersMap, picksByYear, drafts, crosswalk)
  const college = diagnoseCollege(top, ktc.resolved, playersMap, collegeMatches, rawCollege, crosswalk, currentYear)
  const counts = {}
  for (const grp of [ktc.flagged, draft.flagged, college.flagged]) {
    for (const f of grp) for (const c of f.reasons) counts[c] = (counts[c] ?? 0) + 1
  }
  return { top, ktc: ktc.flagged, draft: draft.flagged, draftInfo: draft.info, college: college.flagged, rushingOnlyRbs: college.rushingOnlyRbs, counts,
    sizes: { ktcRows: ktcRowsAll.length, ktcMatched: ktcMap.size, drafts: Object.keys(drafts).length, collegePlayers: Object.keys(collegeMatches).length } }
}
