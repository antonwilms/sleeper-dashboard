// REFERENCE ONLY - Session 1 prototype (2026-10-25) that produced the task file's numbers. Not app code; never import from src/. Run from sleeper-dashboard/ with node_modules/.bin/vite-node.
// Prototype of the proposed ID-first matchers (spec candidate). Not app code.
const APP = '/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard'
const { normalizeName, normalizeCollege } = await import(APP + '/src/utils/collegeMatch.js')
const { computeTeamTotals } = await import(APP + '/src/api/cfbd.js')
export const SKILL = new Set(['QB','RB','WR','TE'])
export function skillPositions(p) {
  const out = []
  for (const x of [p?.position, ...(p?.fantasy_positions ?? [])]) if (SKILL.has(x) && !out.includes(x)) out.push(x)
  return out
}
// Given-name equivalences — fallback only, never on the ID path.
export const GIVEN_NAME_ALIASES = [['matt','matthew'],['ken','kenny','kenneth'],['josh','joshua'],['cam','cameron'],['mike','michael'],['chris','christopher'],['dj','d j'],['pat','patrick'],['nate','nathan'],['zach','zachary'],['will','william'],['tony','anthony'],['dan','daniel'],['jon','jonathan'],['nick','nicholas'],['rob','robert'],['tom','thomas']]
const ALIAS_OF = new Map(); for (const g of GIVEN_NAME_ALIASES) for (const a of g) ALIAS_OF.set(a, g)
export function nameVariants(norm) {
  const toks = norm.split(' '); if (toks.length < 2) return [norm]
  // also join leading single-letter initials "d j moore" → "dj moore"
  const outs = new Set([norm])
  const joined = norm.replace(/^((?:[a-z] )+)/, m => m.replace(/ /g, '') + ' ')
  outs.add(joined)
  for (const base of [...outs]) {
    const t = base.split(' '); const g = ALIAS_OF.get(t[0]); if (!g) continue
    for (const a of g) outs.add([a, ...t.slice(1)].join(' '))
  }
  return [...outs]
}
const cfbrefName = slug => slug ? slug.replace(/-\d+$/, '').replace(/-/g, ' ') : null
export const lastToken = n => { const t = normalizeName(n ?? '').split(' '); return t[t.length - 1] || null }
export const REJECT = { espn: 0, ktcAlias: 0, list: [] }
// surname agreement: the last token of either name is a non-first token of the other
export function surnameAgrees(a, b) {
  const ta = normalizeName(a ?? '').split(' ').filter(Boolean), tb = normalizeName(b ?? '').split(' ').filter(Boolean)
  if (ta.length < 2 || tb.length < 2) return false
  return tb.slice(1).includes(ta[ta.length - 1]) || ta.slice(1).includes(tb[tb.length - 1])
}
export function buildCrosswalkIndex(cw, pm) {
  const bySid = new Map(), espnToSid = new Map(), espnDup = new Set()
  for (const [sid, b] of Object.entries(cw?.bySleeper ?? {})) {
    if (!pm[sid] || !skillPositions(pm[sid]).length) continue
    const name = b.gsisId ? cw.ids?.[b.gsisId]?.name ?? null : null
    bySid.set(sid, { name, cfbrefName: cfbrefName(b.cfbrefId), espnId: b.espnId, draftYear: b.draftYear, draftRound: b.draftRound, draftOvr: b.draftOvr, undrafted: b.undrafted, college: b.college, team: b.team })
    if (b.espnId) { if (espnToSid.has(b.espnId)) espnDup.add(b.espnId); else espnToSid.set(b.espnId, sid) }
  }
  for (const e of espnDup) espnToSid.delete(e)
  return { bySid, espnToSid }
}
const TEAM_ALIAS = { LVR: 'LV', JAC: 'JAX', KCC: 'KC', SFO: 'SF', NEP: 'NE', NOS: 'NO', TBB: 'TB', GBP: 'GB' }
const ktcTeam = t => { if (!t) return null; const u = t.toUpperCase(); return TEAM_ALIAS[u] ?? u }
// ── KTC ──
export function matchKTC(ktcPlayers, pm, xw) {
  const ktcNorm = n => n.toLowerCase().replace(/['']/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\b(jr|sr|ii|iii|iv|v)\b\.?/g,'').replace(/\s+/g,' ').trim()
  const exact = new Map(), alias = new Map() // key name|POS → Set(sid)
  const add = (m, k, sid) => { if (!m.has(k)) m.set(k, new Set()); m.get(k).add(sid) }
  for (const [sid, p] of Object.entries(pm)) {
    const poss = skillPositions(p); if (!p.full_name || !poss.length) continue
    const names = new Set([ktcNorm(p.full_name)]); const x = xw?.bySid.get(sid); if (x?.name) { if (surnameAgrees(x.name, p.full_name)) names.add(ktcNorm(x.name)); else { REJECT.ktcAlias++; REJECT.list.push(['ktc', sid, p.full_name, x.name]) } }
    for (const n of names) for (const pos of poss) add(exact, `${n}|${pos}`, sid)
    for (const n of names) for (const v of nameVariants(n)) for (const pos of poss) add(alias, `${v}|${pos}`, sid)
  }
  const out = new Map(), how = new Map()
  const pick = (ids, team) => {
    ids = [...ids]; if (ids.length === 1) return ids[0]
    const t = ktcTeam(team); const byTeam = ids.filter(s => (pm[s].team ?? 'FA') === (t ?? 'FA'))
    if (byTeam.length === 1) return byTeam[0]
    return null
  }
  for (const r of ktcPlayers) {
    const name = r.name ?? r.playerName; if (!name || r.value == null) continue
    const pos = typeof r.position === 'string' ? r.position.toUpperCase() : null
    if (!SKILL.has(pos)) continue
    const n = ktcNorm(name)
    let sid = null, path = null
    const ex = exact.get(`${n}|${pos}`)
    if (ex?.size) { sid = pick(ex, r.team); path = ex.size > 1 ? (sid ? 'exact-team-tiebreak' : 'ambiguous') : 'exact' }
    if (!sid && !ex?.size) {
      const al = new Set(); for (const v of nameVariants(n)) for (const s of alias.get(`${v}|${pos}`) ?? []) al.add(s)
      // alias path requires team agreement
      const ok = [...al].filter(s => (pm[s].team ?? 'FA') === (ktcTeam(r.team) ?? 'FA'))
      if (ok.length === 1) { sid = ok[0]; path = 'alias-team' }
    }
    how.set(r, { sid, path })
    if (sid) out.set(sid, { value: r.value, confidence: 'high' })
  }
  return { map: out, how }
}
// ── Draft ──
const collegeAgree = (a, b) => { const x = normalizeCollege(a ?? ''), y = normalizeCollege(b ?? ''); if (!x || !y) return false; if (x === y) return true; const xs = x.split(' '), ys = y.split(' '); return xs.some(w => w.length > 3 && ys.includes(w)) }
export function matchDraft(picksByYear, pm, xw, fallback) {
  const res = {}, src = {}, claimed = new Set()
  const years = new Set(Object.keys(picksByYear).map(Number))
  for (const [sid, x] of xw?.bySid ?? []) {
    const p = pm[sid]; if (!skillPositions(p).length) continue
    if (x.undrafted !== false || !years.has(x.draftYear) || x.draftOvr == null) continue
    const pk = (picksByYear[x.draftYear] ?? []).find(q => q.pick === x.draftOvr); if (!pk) continue
    const nm = normalizeName(pk.fullName)
    if (!(nm === normalizeName(p.full_name) || (x.name && nm === normalizeName(x.name)) || collegeAgree(pk.college, x.college ?? p.college))) continue
    res[sid] = { year: pk.year ?? x.draftYear, round: pk.round, pick: pk.pick, team: pk.team, college: pk.college, position: pk.position, ageAtDraft: pk.age ?? null }
    src[sid] = 'id'; claimed.add(`${x.draftYear}|${pk.pick}`)
  }
  // fallback: existing name matcher over unclaimed picks, only for sids with no ID decision
  const unclaimed = Object.fromEntries(Object.entries(picksByYear).map(([y, ps]) => [y, ps.filter(q => !claimed.has(`${y}|${q.pick}`))]))
  const fb = fallback(unclaimed)
  for (const [sid, m] of Object.entries(fb)) {
    if (res[sid]) continue
    const x = xw?.bySid.get(sid)
    if (x && (x.undrafted === true || (x.draftYear != null && x.draftYear !== m.year))) continue // crosswalk contradicts
    res[sid] = m; src[sid] = 'name'
  }
  return { res, src }
}
// ── College ──
export function matchCollege(raw, pm, xw) {
  const lastYear = Math.max(...Object.keys(raw.receiving).map(Number))
  const nameMap = {}
  for (const [pid, p] of Object.entries(pm)) {
    if (!SKILL.has(p.position)) continue; const poss = skillPositions(p)
    const x = xw?.bySid.get(pid)
    const keys = new Set(nameVariants(normalizeName(p.full_name)))
    if (x?.name && surnameAgrees(x.name, p.full_name)) keys.add(normalizeName(x.name)); if (x?.cfbrefName && surnameAgrees(x.cfbrefName, p.full_name)) keys.add(normalizeName(x.cfbrefName))
    for (const k of keys) { if (!k) continue; (nameMap[k] ??= []); if (!nameMap[k].some(c => c.player_id === pid)) nameMap[k].push({ player_id: pid, colleges: [p.college, x?.college].filter(Boolean), position: poss[0], positions: poss, draftYear: x?.draftYear ?? null }) }
  }
  const idSid = (id, row) => { const s = xw?.espnToSid.get(id); if (!s) return null; const x = xw.bySid.get(s); if ([pm[s].full_name, x?.name, x?.cfbrefName].some(n => n && surnameAgrees(n, row.player))) return s; REJECT.espn++; REJECT.list.push(['espn', s, pm[s].full_name, row.player, row.team]); return null }
  // idYears: years in which any category has a row whose CFBD id maps to the sid
  const idYears = new Map()
  const years = Object.keys(raw.receiving).map(Number).sort()
  for (const c of ['receiving','rushing','passing']) for (const y of years) for (const [id, row] of Object.entries(raw[c]?.[y] ?? {})) { const s = idSid(id, row); if (s) { if (!idYears.has(s)) idYears.set(s, new Set()); idYears.get(s).add(y) } }
  const result = {}, how = {}
  for (const year of years) {
    const rec = raw.receiving[year] ?? {}, rush = raw.rushing[year] ?? {}, pass = raw.passing?.[year] ?? {}
    const tr = computeTeamTotals(rec), tru = computeTeamTotals(rush), tp = computeTeamTotals(pass)
    const resolve = (cfbdId, row) => {
      const s = idSid(cfbdId, row); if (s) return { player_id: s, position: skillPositions(pm[s])[0], positions: skillPositions(pm[s]), via: 'id' }
      let cands = (nameMap[normalizeName(row.player)] ?? [])
        .filter(c => !idYears.get(c.player_id)?.has(year))
        .filter(c => c.draftYear == null || (year < c.draftYear && year >= c.draftYear - 6))
      if (cands.length === 1) return { ...cands[0], via: 'name' }
      if (!cands.length) return null
      const cc = normalizeCollege(row.team ?? '')
      const pickC = cands.find(c => normalizeCollege(c.colleges[0] ?? '') === cc) ?? cands.find(c => { const cw0 = normalizeCollege(c.colleges[0] ?? ''); return cw0 && cw0.split(' ').some(w => w.length > 3 && cc.split(' ').includes(w)) })
      return pickC ? { ...pickC, via: 'name' } : null
    }
    const ye = {}
    const up = (pid, team, payload, via) => { ye[pid] ??= { year, team, receiving: null, rushing: null, passing: null, teamRecTotals: tr[team] ?? { YDS:0, TD:0 }, teamRushTotals: tru[team] ?? { YDS:0, TD:0 }, teamPassTotals: tp[team] ?? { YDS:0, TD:0 } }; Object.assign(ye[pid], payload); (how[pid] ??= new Set()).add(via) }
    // phase 1: resolve every row; name proposals are held per candidate
    const props = [] // { m, id, r, kind }
    for (const [id, r] of Object.entries(rec)) { const m = resolve(id, r); if (m) props.push({ m, id, r, kind: 'rec' }) }
    for (const [id, r] of Object.entries(pass)) { const m = resolve(id, r); if (m && m.positions.includes('QB')) props.push({ m, id, r, kind: 'pass' }) }
    // phase 2: a candidate name-matched to >1 distinct CFBD id this year keeps only the college-agreeing one
    const nameIds = new Map(); for (const x of props) if (x.m.via === 'name') { if (!nameIds.has(x.m.player_id)) nameIds.set(x.m.player_id, new Set()); nameIds.get(x.m.player_id).add(x.id) }
    const keepId = new Map()
    for (const [pid, ids] of nameIds) {
      const teams = new Set([...ids].map(id => normalizeCollege((rec[id] ?? pass[id]).team)))
      if (ids.size === 1 || teams.size === 1) { keepId.set(pid, 'ALL'); continue }
      const cols = (nameMap[normalizeName(pm[pid].full_name)] ?? []).find(c => c.player_id === pid)?.colleges ?? []
      const agree = [...ids].filter(id => { const row = rec[id] ?? pass[id]; return cols.some(col => collegeAgree(col, row.team)) })
      keepId.set(pid, agree.length === 1 ? agree[0] : null)
    }
    for (const x of props) {
      if (x.m.via === 'name' && keepId.get(x.m.player_id) !== 'ALL' && keepId.get(x.m.player_id) !== x.id) continue
      if (x.kind === 'rec') up(x.m.player_id, x.r.team, { receiving: x.r, rushing: rush[x.id] ?? null }, x.m.via)
      else up(x.m.player_id, x.r.team, { passing: x.r }, x.m.via)
    }
    for (const [pid, e] of Object.entries(ye)) (result[pid] ??= []).push(e)
  }
  return { result, how }
}
