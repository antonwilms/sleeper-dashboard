// Compare two `--dump-joins` dumps (computed-stats.mjs) of the top KTC rows: which KTC / draft / college
// joins were gained, lost or changed between two app commits. Read-only; writes only --out.
//   node scripts/verify/compare-joins.mjs -- --before <joins-before.json> --after <joins-after.json> --out <report.md>
// Never imported by src/.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const draftKey = d => (d ? `${d.year} R${d.round} #${d.pick}` : null)
const seasonsKey = ss => (ss?.length ? ss.map(s => `${s.year} ${s.team}`).join(', ') : null)

// Per-join extractors: value (comparable string or null) and a display form.
const JOINS = [
  { id: 'ktc', title: 'KTC → Sleeper id', value: r => r.sid ?? null },
  { id: 'draft', title: 'NFL draft entry', value: r => draftKey(r.draft) },
  { id: 'college', title: 'College seasons', value: r => seasonsKey(r.college) },
]

// → { joins: { ktc|draft|college: { gained, lost, changed } }, previouslyMatchedChanged: [...rows], counts }
// A rank present in only one dump is ignored (the top-N set is the same for the same KTC file).
export function compareJoinDumps(before, after) {
  const afterByRank = new Map(after.rows.map(r => [r.rank, r]))
  const joins = Object.fromEntries(JOINS.map(j => [j.id, { gained: [], lost: [], changed: [] }]))
  const changedRows = new Map()
  let unchangedRows = 0
  for (const b of before.rows) {
    const a = afterByRank.get(b.rank)
    if (!a) continue
    let any = false
    for (const j of JOINS) {
      const bv = j.value(b), av = j.value(a)
      if (bv === av) continue
      any = true
      const entry = { rank: b.rank, name: b.name, position: b.position, team: b.team, before: bv, after: av,
        ...(j.id === 'ktc' ? { ktcPath: a.ktcPath ?? null } : {}),
        ...(j.id === 'college' ? { matchedBy: (a.college ?? []).map(s => s.matchedBy ?? null) } : {}) }
      if (bv == null) joins[j.id].gained.push(entry)
      else if (av == null) joins[j.id].lost.push(entry)
      else joins[j.id].changed.push(entry)
      if (bv != null) changedRows.set(b.rank, b)   // before had a value and after differs
    }
    if (!any) unchangedRows++
  }
  const previouslyMatchedChanged = [...changedRows.values()].map(b => b.name)
  return { joins, previouslyMatchedChanged, counts: { rows: before.rows.length, unchangedRows } }
}

function table(entries) {
  if (!entries.length) return '_none_\n'
  const lines = ['| rank | player | pos | team | before | → after |', '|---|---|---|---|---|---|']
  for (const e of entries) lines.push(`| ${e.rank} | ${e.name} | ${e.position} | ${e.team ?? ''} | ${e.before ?? '—'} | ${e.after ?? '—'} |`)
  return lines.join('\n') + '\n'
}

export function renderJoinDiff(before, after, diff = compareJoinDumps(before, after)) {
  const out = ['# Join-fix diff — top-400 KTC rows, before vs after', '',
    `- before: app \`${before.inputs?.appHead ?? '?'}\`; after: app \`${after.inputs?.appHead ?? '?'}\``,
    `- KTC file: ${after.inputs?.ktcFile ?? '?'}; players map fetched ${after.inputs?.playersMapFetchedAt ?? '?'}; crosswalk generatedAt ${after.inputs?.crosswalkGeneratedAt ?? '?'}`,
    `- rows compared: ${diff.counts.rows}; rows with no join change: ${diff.counts.unchangedRows}`, '']
  for (const j of JOINS) {
    const d = diff.joins[j.id]
    out.push(`## ${j.title}`, '', `gained ${d.gained.length} · lost ${d.lost.length} · changed ${d.changed.length}`, '')
    for (const [label, list] of [['Gained', d.gained], ['Lost', d.lost], ['Changed', d.changed]]) out.push(`### ${j.title} — ${label}`, '', table(list))
  }
  out.push(`previously-matched joins changed: ${diff.previouslyMatchedChanged.length}`, '')
  if (diff.previouslyMatchedChanged.length) out.push(diff.previouslyMatchedChanged.map(n => `- ${n}`).join('\n'), '')
  return out.join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const get = k => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null }
  const [bf, af, outPath] = [get('--before'), get('--after'), get('--out')]
  if (!bf || !af || !outPath) throw new Error('usage: compare-joins.mjs -- --before <f> --after <f> --out <md>')
  const before = JSON.parse(fs.readFileSync(bf, 'utf8')), after = JSON.parse(fs.readFileSync(af, 'utf8'))
  fs.writeFileSync(outPath, renderJoinDiff(before, after))
  const d = compareJoinDumps(before, after)
  console.log(`wrote ${outPath}; previously-matched joins changed: ${d.previouslyMatchedChanged.length}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
