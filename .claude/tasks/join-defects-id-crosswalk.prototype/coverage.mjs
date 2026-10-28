// REFERENCE ONLY - Session 1 prototype (2026-10-25) that produced the task file's numbers. Not app code; never import from src/. Run from sleeper-dashboard/ with node_modules/.bin/vite-node.
import fs from 'node:fs'
const APP = '/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard', DATA = '/Users/antonwilms/Claude Projects/Sleeper Dashboard/sleeper-dashboard-data'
const N = await import('./newmatch.mjs'); const { topKtcRows } = await import(APP + '/scripts/verify/lib/v3Joins.mjs')
const { normalizeCollegeStats } = await import(APP + '/src/api/cfbd.js')
const J = p => JSON.parse(fs.readFileSync(p, 'utf8'))
const pm = J(APP + '/node_modules/.cache/verify-computed-stats/2026-10-18/dee7f1b002d698e35c55f9f25d8007cc86fa8db3.json').data
const ktc = J(DATA + '/ktc/snapshot-2026-10-12.json'), cw = J(DATA + '/nflverse/playerids.json')
const xw = N.buildCrosswalkIndex(cw, pm); const k = N.matchKTC(ktc, pm, xw)
const ids = new Set(); for (const c of ['receiving','rushing','passing']) for (let y = 2017; y <= 2025; y++) for (const id of Object.keys(normalizeCollegeStats(J(`${DATA}/college/${c}/${y}.json`)) ?? {})) ids.add(id)
const top = topKtcRows(ktc, 400); const by = new Map(); for (const [r, h] of k.how) by.set(`${r.name}|${r.value}`, h.sid)
const t = { rows: 400, resolved: 0, cw: 0, name: 0, espn: 0, espnInCfbd: 0, draftable: 0, undrafted: 0, preWindow: 0 }; const none = [], noEspnHit = []
for (const r of top) { const s = by.get(`${r.name}|${r.value}`); if (!s) continue; t.resolved++; const b = cw.bySleeper[s]; if (!b) { none.push(`${r.rank} ${r.name}`); continue } t.cw++
  if (xw.bySid.get(s)?.name) t.name++; if (b.espnId) { t.espn++; if (ids.has(b.espnId)) t.espnInCfbd++; else noEspnHit.push(`${r.rank} ${r.name} (dy ${b.draftYear}, ${b.college})`) }
  if (b.undrafted === true) t.undrafted++; else if (b.draftYear >= 2017) t.draftable++; else t.preWindow++ }
console.log(t, 'no crosswalk:', none); console.log('espn not in CFBD files:', noEspnHit.length); console.log(noEspnHit.join('; '))
