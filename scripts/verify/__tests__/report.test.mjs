import { describe, it, expect } from 'vitest'
import { renderReport, buildSummaryRows, validateAnnotations } from '../lib/report.mjs'

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
  it('V3 KTC: team-resolved matches and team spelling alone are pass; an unresolved ambiguity is a defect', () => {
    const base = { ...minimal, ran: { v1: false, v2: false, v3: true } }
    const verdict = ktc => Object.fromEntries(buildSummaryRows({ ...base, v3: { top: [{}], ktc, draft: [], college: [] } }).map(x => [x[0], x[5]]))['V3 KTC']
    expect(verdict([{ reasons: ['ktc-team-fallback', 'ktc-team-disagree'] }])).toBe('pass')
    expect(verdict([{ reasons: ['ktc-ambiguous-unresolved'] }])).toBe('defect')
  })
})

describe('annotations', () => {
  const v2 = { summary: { 'V2.6': { compared: 100, out: 10, rate: 0.1, verdict: 'defect' } }, series: {}, info: { population: {}, unmapped: {}, doubling: [], rz: {}, fallbackBranch: {}, dnpSignedDistribution: { n: 0, hist: {} } }, findings: [], traded: [], outOfTolerance: [] }
  const withV2 = { ...minimal, ran: { v1: false, v2: true, v3: false }, seasons: [], v2 }
  it('renders notes under their own heading and leaves the computed verdict alone', () => {
    const r = { ...withV2, notes: { 'V2.6': 'looks like a trade effect' } }
    const md = renderReport(r)
    expect(md).toContain('## Session notes (hand-written, not computed)')
    expect(md).toContain('looks like a trade effect')
    expect(buildSummaryRows(r).find(x => x[0] === 'V2.6')[5]).toBe('defect')
  })
  it('accepts the three allowed keys', () => {
    expect(() => validateAnnotations({ defects: [{ id: 'a', file: 'f', title: 't', blocking: 'no' }], unclassified: ['x'], notes: { 'V2.6': 'n' } })).not.toThrow()
  })
  it('throws on a verdictOverrides key', () => {
    expect(() => validateAnnotations({ verdictOverrides: { 'V2.6': 'pass' } })).toThrow(/verdictOverrides/)
  })
})
