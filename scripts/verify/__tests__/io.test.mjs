import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { assertOutPath, newestDated } from '../lib/io.mjs'

describe('assertOutPath', () => {
  it('accepts <data>/verification', () => {
    expect(assertOutPath('/x/data/verification', '/x/data')).toBe('/x/data/verification')
    expect(assertOutPath('/x/data/./verification/', '/x/data')).toBe('/x/data/verification')
  })
  it('throws for <data>, <data>/snapshots, and an app path', () => {
    expect(() => assertOutPath('/x/data', '/x/data')).toThrow()
    expect(() => assertOutPath('/x/data/snapshots', '/x/data')).toThrow()
    expect(() => assertOutPath('/x/app/src', '/x/data')).toThrow()
  })
})

describe('newestDated', () => {
  it('picks the highest date and ignores non-matching names', () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'nd-'))
    fs.mkdirSync(path.join(d, 'ktc'))
    for (const n of ['snapshot-2026-09-28.json', 'snapshot-2026-10-12.json', 'snapshot-2026-10-02.json', 'README.md']) fs.writeFileSync(path.join(d, 'ktc', n), '[]')
    expect(newestDated(d, 'ktc', /^snapshot-(\d{4}-\d{2}-\d{2})\.json$/)).toBe('snapshot-2026-10-12.json')
    fs.rmSync(d, { recursive: true })
  })
})
