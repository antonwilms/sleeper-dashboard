import { statSync, existsSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// CLAUDE.md auto-loads into every session in this repo, so its size is a per-session tax.
// statSync().size is exact bytes on disk — readFileSync(...).length is UTF-16 code units in JS
// and undercounts every non-ASCII character (this file is full of —, →, ·, ≥).

const CEILING = 25000
const TRAPS_CAP = 3000

describe('CLAUDE.md size ceiling', () => {
  it('exists at the repo root', () => {
    expect(existsSync('CLAUDE.md')).toBe(true)
  })

  it('is at or under the 25,000-byte ceiling', () => {
    const size = statSync('CLAUDE.md').size
    expect(
      size,
      `CLAUDE.md is ${size} bytes; the ceiling is ${CEILING} (over by ${size - CEILING}).\n` +
        'CLAUDE.md is auto-loaded into every session in this repo, so its size is a\n' +
        'per-session tax. Do not raise this ceiling.\n' +
        'Per-file detail belongs in docs/navigation.md. A trap specific to one module\n' +
        "belongs in that module's own header comment. Prune in this same commit."
    ).toBeLessThanOrEqual(CEILING)
  })

  it('keeps the ## Traps section under its own 3,000-byte sub-cap', () => {
    const text = readFileSync('CLAUDE.md', 'utf8')
    const start = text.indexOf('## Traps')
    if (start === -1) return // section folded away — not this test's business

    const nextHeadingIdx = text.indexOf('\n## ', start + 1)
    const end = nextHeadingIdx === -1 ? text.length : nextHeadingIdx
    const trapsBytes = new TextEncoder().encode(text.slice(start, end)).length

    expect(trapsBytes).toBeLessThanOrEqual(TRAPS_CAP)
  })
})
