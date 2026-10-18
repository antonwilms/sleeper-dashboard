import { describe, it, expect } from 'vitest'
import { renderReport, buildSummaryRows } from '../lib/report.mjs'

const minimal = {
  header: { date: '2026-10-18', appSha: 'abc', dataSha: 'def', dataClean: true, command: 'cmd' },
  ran: { v1: false, v2: false, v3: false },
  gaps: {}, defects: [], unclassified: [],
}

describe('renderReport', () => {
  const md = renderReport(minimal)
  it('contains the summary table header', () => {
    expect(md).toContain('| check | description | compared | out of tolerance | rate | verdict |')
  })
  it('contains every G1–G10 heading', () => {
    for (let i = 1; i <= 10; i++) expect(md).toContain(`### G${i}\n`)
  })
  it('marks a skipped check as not run', () => {
    expect(buildSummaryRows(minimal).every(r => r[5] === 'not run')).toBe(true)
    expect(md).toContain('not run')
  })
  it('gives V3 verdicts: draft-out-of-window alone is pass, anything else is defect', () => {
    const r = { ...minimal, ran: { v1: false, v2: false, v3: true }, v3: { top: [{}, {}], ktc: [], draft: [{ reasons: ['draft-out-of-window'] }], college: [{ reasons: ['college-none'] }] } }
    const rows = Object.fromEntries(buildSummaryRows(r).map(x => [x[0], x[5]]))
    expect(rows['V3 draft']).toBe('pass')
    expect(rows['V3 college']).toBe('defect')
    expect(rows['V3 KTC']).toBe('pass')
  })
})
