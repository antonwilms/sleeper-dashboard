// REFERENCE ONLY - Session 1 prototype (2026-10-25) that produced the task file's numbers. Not app code; never import from src/. Run from sleeper-dashboard/ with node_modules/.bin/vite-node.
import fs from 'node:fs'
const APP = '/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard'
const DATA = '/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard-data'
const { matchKTCToSleeper } = await import(APP + '/src/utils/ktcMatch.js')
const { matchCollegeToSleeper } = await import(APP + '/src/utils/collegeMatch.js')
const { matchNflDraftToSleeper } = await import(APP + '/src/utils/nflDraftMatch.js')
const { normalizeCollegeStats } = await import(APP + '/src/api/cfbd.js')
const { topKtcRows } = await import(APP + '/scripts/verify/lib/v3Joins.mjs')
const N = await import('./newmatch.mjs')
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const pm = J(APP + '/node_modules/.cache/verify-computed-stats/2026-10-18/dee7f1b002d698e35c55f9f25d8007cc86fa8db3.json').data
const ktc = J(DATA + '/ktc/' + (process.env.KTCF ?? 'snapshot-2026-10-12.json'))
const cw = J(DATA + '/nflverse/playerids.json')
const pa = J(DATA + '/nflverse/draft/draft_picks.json').picksByYear
const picks = Object.fromEntries(Object.entries(pa).filter(([y]) => +y >= 2017 && +y <= 2026))
const raw = { receiving: {}, rushing: {}, passing: {} }
for (const c of Object.keys(raw)) for (let y = 2017; y <= 2025; y++) raw[c][y] = normalizeCollegeStats(J(`${DATA}/college/${c}/${y}.json`)) ?? {}
const q = fn => { const l = console.log, w = console.warn; console.log = console.warn = () => {}; try { return fn() } finally { console.log = l; console.warn = w } }
const xw = N.buildCrosswalkIndex(cw, pm)
const oldK = q(() => matchKTCToSleeper(ktc, pm)); const newK = N.matchKTC(ktc, pm, xw)
const oldD = q(() => matchNflDraftToSleeper(picks, pm)); const newD = N.matchDraft(picks, pm, xw, pk => q(() => matchNflDraftToSleeper(pk, pm)))
const oldC = q(() => matchCollegeToSleeper(raw, pm)); const newC = N.matchCollege(raw, pm, xw)
// KTC row-level: which sid each KTC row lands on old vs new
const oldInv = new Map(); for (const [s, v] of oldK) oldInv.set(s, v.value)
const top = topKtcRows(ktc, 400)
const rowKey = r => `${r.name}|${r.position}|${r.value}`
const newBy = new Map(); for (const [r, h] of newK.how) newBy.set(rowKey(r), h)
// old: replicate resolver
const { buildKtcResolver } = await import(APP + '/scripts/verify/lib/v3Joins.mjs'); const res = buildKtcResolver(pm)
const ktcChanges = []
for (const r of ktc.filter(r => N.SKILL.has(r.position) && r.value != null)) {
  const o = res(r).sid, n = newBy.get(rowKey(r))?.sid ?? null
  if (o !== n) ktcChanges.push({ name: r.name, pos: r.position, team: r.team, value: r.value, old: o && `${o}:${pm[o].full_name}/${pm[o].team}`, new: n && `${n}:${pm[n].full_name}/${pm[n].team}`, path: newBy.get(rowKey(r))?.path })
}
console.log('KTC sizes old/new', oldK.size, newK.map.size, 'row changes', ktcChanges.length); for (const c of ktcChanges) console.log(' ', JSON.stringify(c))
// Draft diff
const dk = d => d ? `${d.year}/${d.round}/${d.pick}` : null
const dsids = new Set([...Object.keys(oldD), ...Object.keys(newD.res)])
const dch = []; for (const s of dsids) { const a = dk(oldD[s]), b = dk(newD.res[s]); if (a !== b) dch.push({ s, n: pm[s]?.full_name, pos: pm[s]?.position, old: a, new: b, src: newD.src[s] }) }
const srcCount = {}; for (const v of Object.values(newD.src)) srcCount[v] = (srcCount[v] ?? 0) + 1
console.log('Draft sizes old/new', Object.keys(oldD).length, Object.keys(newD.res).length, srcCount, 'changes', dch.length); for (const c of dch) console.log(' ', JSON.stringify(c))
// College diff (all players): seasons signature
const ck = arr => arr ? arr.map(e => `${e.year}:${e.team}:${e.receiving ? 'R' : ''}${e.rushing ? 'U' : ''}${e.passing ? 'P' : ''}`).join(',') : ''
const csids = new Set([...Object.keys(oldC), ...Object.keys(newC.result)])
const cch = []; for (const s of csids) { const a = ck(oldC[s]), b = ck(newC.result[s]); if (a !== b) cch.push({ s, n: pm[s]?.full_name, pos: pm[s]?.position, ye: pm[s]?.years_exp, team: pm[s]?.team, old: a, new: b, via: [...(newC.how[s] ?? [])].join('+') }) }
console.log('College sizes old/new', Object.keys(oldC).length, Object.keys(newC.result).length, 'changed players', cch.length)
const topSids = new Map(); for (const r of top) { const h = newBy.get(rowKey(r)); if (h?.sid) topSids.set(h.sid, r.rank) }
const cTop = cch.filter(c => topSids.has(c.s)).map(c => ({ rank: topSids.get(c.s), ...c })).sort((a, b) => a.rank - b.rank)
console.log('College changes in top 400:', cTop.length); for (const c of cTop) console.log(' ', JSON.stringify(c))
// categorize all college changes
const cat = { gained: 0, lost: 0, changed: 0 }; for (const c of cch) { if (!c.old) cat.gained++; else if (!c.new) cat.lost++; else cat.changed++ }
console.log('college change categories (all players)', cat)
const viaCount = {}; for (const h of Object.values(newC.how)) { const k = [...h].sort().join('+'); viaCount[k] = (viaCount[k] ?? 0) + 1 }; console.log('college via', viaCount)
fs.writeFileSync(process.env.OUT ?? '/dev/null', JSON.stringify({ ktcChanges, dch, cch }, null, 1))
// classify every lost season (old had (sid,year), new lacks it)
const cwb = cw.bySleeper
const lostCls = {}, gainCls = {}, lostInWin = []
for (const c of cch) {
  const oy = new Map((oldC[c.s] ?? []).map(e => [e.year, e.team])), ny = new Map((newC.result[c.s] ?? []).map(e => [e.year, e.team]))
  const dy = cwb[c.s]?.draftYear
  for (const [y, t] of oy) if (!ny.has(y) || ny.get(y) !== t) {
    const k = dy == null ? 'no-cw' : y >= dy ? 'after-draft' : y < dy - 6 ? 'before-window' : (ny.has(y) ? 'replaced-same-year' : 'in-window')
    lostCls[k] = (lostCls[k] ?? 0) + 1
    if (k === 'in-window') lostInWin.push({ s: c.s, n: pm[c.s]?.full_name, y, t, dy, rank: topSids.get(c.s) ?? null })
  }
  for (const [y, t] of ny) if (!oy.has(y) || oy.get(y) !== t) { const k = (newC.how[c.s] && [...newC.how[c.s]].join('+')) || '?'; gainCls[k] = (gainCls[k] ?? 0) + 1 }
}
console.log('lost season classes', lostCls, 'gained season rows by via', gainCls)
console.log('lost in-window seasons:', lostInWin.length); for (const l of lostInWin.slice(0, 80)) console.log(' ', JSON.stringify(l))
const nocw = [], other = []
for (const c of cch) {
  const oy = new Map((oldC[c.s] ?? []).map(e => [e.year, e.team])), ny = new Map((newC.result[c.s] ?? []).map(e => [e.year, e.team]))
  const dy = cwb[c.s]?.draftYear
  for (const [y, t] of oy) if (!ny.has(y) || ny.get(y) !== t) {
    const row = { s: c.s, n: pm[c.s]?.full_name, pos: pm[c.s]?.position, ye: pm[c.s]?.years_exp, st: pm[c.s]?.status, col: pm[c.s]?.college, y, t, dy, nowTeam: ny.get(y) ?? null }
    if (dy == null) nocw.push(row); else if (!(y >= dy)) other.push(row)
  }
}
const ksum = {}; for (const r of nocw) { const k = `ye=${r.ye} st=${r.st}`; ksum[k] = (ksum[k] ?? 0) + 1 }
console.log('no-cw losses by ye/status', ksum)
const nocwActive = nocw.filter(r => r.st === 'Active'); console.log('no-cw Active losses', nocwActive.length); for (const r of nocwActive.slice(0, 40)) console.log(' ', JSON.stringify(r))
console.log('other non-after-draft losses'); for (const r of other) console.log(' ', JSON.stringify(r))
console.log("REJECT", N.REJECT)
const V = await import(APP + '/scripts/verify/lib/v3Joins.mjs')
const resolvedNew = new Map(); for (const r of top) resolvedNew.set(r.rank, newBy.get(rowKey(r))?.sid ?? null)
const dN = V.diagnoseDraft(top, resolvedNew, pm, pa, newD.res, cw)
const cN = V.diagnoseCollege(top, resolvedNew, pm, newC.result, raw, cw, 2026)
const cnt = {}; for (const f of [...dN.flagged, ...cN.flagged]) for (const c of f.reasons) cnt[c] = (cnt[c] ?? 0) + 1
console.log('SIMULATED V3 after (draft+college):', cnt, 'ktc unmatched:', top.filter(r => !resolvedNew.get(r.rank)).map(r => r.name))
for (const f of [...dN.flagged, ...cN.flagged]) if (!f.reasons.every(x => x === 'draft-out-of-window')) console.log(' ', f.rank, f.name, f.reasons.join(','), JSON.stringify(f.evidence).slice(0, 220))
// sample name-gains
let k = 0; for (const c of cch) { const hv = newC.how[c.s]; if (hv && hv.has('name') && !hv.has('id') && !c.old) { console.log('  name-gain', JSON.stringify(c)); if (++k > 12) break } }
for (const nm of ['KeAndre Lambert-Smith','Kameron Johnson','Jack Strand','Dohnte Meyers','Matthew Hibner']) { const r = top.find(t => t.name === nm); const s = resolvedNew.get(r.rank); const b = cw.bySleeper[s]; console.log('DBG', nm, s, pm[s]?.full_name, pm[s]?.college, JSON.stringify(b && { dy: b.draftYear, espn: b.espnId, col: b.college }), (newC.result[s] ?? []).map(e => e.year + e.team).join(',')) }
const seen=new Set(); for (const r of N.REJECT.list) { const k=r.slice(0,4).join("|"); if (!seen.has(k)) { seen.add(k); console.log("REJ", JSON.stringify(r)) } }
