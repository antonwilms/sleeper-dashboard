// week-lineup-readability-a.md §4 T1a/T1b — the pace definition says what the number measures
// (seconds between snaps within a drive in close games), and no hand-written copy of the old
// "seconds per play" wording survives anywhere in src/.
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { GLOSSARY } from '../utils/metricGlossary'

function sourceFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (name === '__fixtures__') continue
      out.push(...sourceFiles(p))
    } else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) {
      out.push(p)
    }
  }
  return out
}

describe('pace definition', () => {
  it('T1a states the between-snaps, within-a-drive, close-game meaning and says to compare ranks', () => {
    const d = GLOSSARY.pace.definition
    for (const part of ['between', 'snaps', 'within a drive', '20–80%', 'compare ranks']) expect(d, part).toContain(part)
    expect(d).not.toMatch(/per play/i)
  })

  it('T1b no source file outside tests and fixtures still says "seconds per play"', () => {
    const offenders = sourceFiles('src').filter(p => /seconds per play/i.test(readFileSync(p, 'utf8')))
    expect(offenders).toEqual([])
  })
})
