import { describe, it, expect } from 'vitest'
import { compareJoinDumps, renderJoinDiff } from '../compare-joins.mjs'
import { buildJoinDump } from '../lib/v3Joins.mjs'

const row = (rank, name, over = {}) => ({ rank, name, position: 'WR', team: 'DET', value: 9000 - rank, sid: String(rank), ktcPath: null,
  draft: { year: 2022, round: 1, pick: 5 }, college: [{ year: 2021, team: 'Ohio State', matchedBy: null }], ...over })
const dump = rows => ({ inputs: { appHead: 'abc' }, rows })

describe('compareJoinDumps', () => {
  it('reports gained, lost and changed per join and counts unchanged rows', () => {
    const before = dump([
      row(1, 'Same'),
      row(2, 'Gains Ktc', { sid: null }),
      row(3, 'Loses Draft'),
      row(4, 'Changes College'),
      row(5, 'Gains College', { college: [] }),
    ])
    const after = dump([
      row(1, 'Same'),
      row(2, 'Gains Ktc', { sid: '77', ktcPath: 'alias-team' }),
      row(3, 'Loses Draft', { draft: null }),
      row(4, 'Changes College', { college: [{ year: 2021, team: 'Wake Forest', matchedBy: 'id' }] }),
      row(5, 'Gains College', { college: [{ year: 2020, team: 'Utah', matchedBy: 'name' }] }),
    ])
    const d = compareJoinDumps(before, after)
    expect(d.joins.ktc.gained).toEqual([expect.objectContaining({ name: 'Gains Ktc', before: null, after: '77', ktcPath: 'alias-team' })])
    expect(d.joins.draft.lost).toEqual([expect.objectContaining({ name: 'Loses Draft', before: '2022 R1 #5', after: null })])
    expect(d.joins.college.changed).toEqual([expect.objectContaining({ name: 'Changes College', before: '2021 Ohio State', after: '2021 Wake Forest', matchedBy: ['id'] })])
    expect(d.joins.college.gained.map(e => e.name)).toEqual(['Gains College'])
    expect(d.counts.unchangedRows).toBe(1)
    // gained joins had no before value → not "previously matched"; lost + changed did
    expect(d.previouslyMatchedChanged.sort()).toEqual(['Changes College', 'Loses Draft'])
  })

  it('renders the count line and per-join sections', () => {
    const before = dump([row(1, 'A'), row(2, 'B')])
    const after = dump([row(1, 'A', { sid: '9' }), row(2, 'B')])
    const md = renderJoinDiff(before, after)
    expect(md).toContain('## KTC → Sleeper id')
    expect(md).toContain('previously-matched joins changed: 1')
    expect(md).toContain('| 1 | A | WR | DET | 1 | 9 |')
  })

  it('identical dumps change nothing', () => {
    const d = dump([row(1, 'A'), row(2, 'B')])
    const r = compareJoinDumps(d, d)
    expect(r.previouslyMatchedChanged).toEqual([])
    expect(r.counts.unchangedRows).toBe(2)
  })
})

describe('buildJoinDump', () => {
  it('maps resolved sid, draft and college seasons per top row; matchedBy and ktcPath are null when absent', () => {
    const top = [{ rank: 1, name: 'A', team: 'DET', position: 'WR', value: 9000 }, { rank: 2, name: 'B', team: 'FA', position: 'RB', value: 8000 }]
    const resolved = new Map([[1, '10']])
    const drafts = { 10: { year: 2022, round: 1, pick: 5 } }
    const college = { 10: [{ year: 2021, team: 'Ohio State' }] }
    const rows = buildJoinDump(top, resolved, drafts, college)
    expect(rows[0]).toMatchObject({ rank: 1, sid: '10', ktcPath: null, draft: { year: 2022, round: 1, pick: 5 }, college: [{ year: 2021, team: 'Ohio State', matchedBy: null }] })
    expect(rows[1]).toMatchObject({ sid: null, draft: null, college: [] })
    expect(buildJoinDump(top, resolved, drafts, college, new Map([[1, 'exact']]))[0].ktcPath).toBe('exact')
  })
})
