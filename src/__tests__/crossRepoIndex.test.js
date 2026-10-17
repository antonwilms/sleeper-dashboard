import { statSync, existsSync, readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// docs/cross-repo-registry.md is the cross-repo contract index (../CLAUDE.md → Cross-repo rule).
// This test guards the app half: ids run CR-01…CR-NN with no gap, reuse or renumbering (docs in
// both repos cite them), the index stays under its 12,000-byte cap, every App site resolves here, and
// every app test it names exists. The data repo's test/registry.test.mjs checks the Data half of
// the same file. Symbols are matched whole-word in the named file, never by line number.

const INDEX = 'docs/cross-repo-registry.md'
const CAP_BYTES = 12000
const RETIRED_IDS = ['CR-20', 'CR-24']
const MIN_LIVE_IDS = 29
const GROUP_RE = /^`([^`]+)`(?: \((`[^`]+`(?:, `[^`]+`)*)\))?$/

function parseIndex(text) {
  const entries = []
  let current = null
  for (const line of text.split('\n')) {
    const header = line.match(/^#### (CR-\d+) · (.+)$/)
    if (header) {
      current = { id: header[1], title: header[2], fields: {} }
      entries.push(current)
      continue
    }
    const field = current && line.match(/^- \*\*([A-Za-z]+):\*\* (.+)$/)
    if (field) current.fields[field[1]] = field[2]
  }
  return entries
}

function parseGroups(value) {
  if (value === 'none') return []
  return value.split('; ').map((group) => {
    const m = group.match(GROUP_RE)
    if (!m) throw new Error(`malformed site group: ${group}`)
    const symbols = m[2] ? [...m[2].matchAll(/`([^`]+)`/g)].map((s) => s[1]) : []
    return { file: m[1], symbols }
  })
}

function symbolResolvesIn(symbol, source) {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(source)
}

const isRetired = (e) => / — retired \d{4}-\d{2}-\d{2}$/.test(e.title)

describe('cross-repo contract index', () => {
  const text = readFileSync(INDEX, 'utf8')
  const entries = parseIndex(text)

  it('stays at or under its 12,000-byte cap', () => {
    const size = statSync(INDEX).size
    expect(size, `${INDEX} is ${size} bytes; cap is ${CAP_BYTES}. Prune in the same commit.`).toBeLessThanOrEqual(CAP_BYTES)
  })

  it('numbers ids CR-01…CR-NN contiguously, once each, in order', () => {
    const ids = entries.map((e) => e.id)
    expect(ids.length).toBeGreaterThanOrEqual(MIN_LIVE_IDS)
    ids.forEach((id, i) => expect(id).toBe(`CR-${String(i + 1).padStart(2, '0')}`))
  })

  it('keeps retired ids as bare headers and gives every live entry Invariant, App and Data', () => {
    for (const id of RETIRED_IDS) expect(isRetired(entries.find((e) => e.id === id))).toBe(true)
    for (const e of entries) {
      if (isRetired(e)) expect(Object.keys(e.fields), e.id).toEqual([])
      else for (const f of ['Invariant', 'App', 'Data']) expect(e.fields[f], `${e.id} ${f}`).toBeTruthy()
    }
  })

  it('resolves every App site in this repo', () => {
    const failures = []
    let checked = 0
    for (const e of entries.filter((x) => !isRetired(x))) {
      for (const { file, symbols } of parseGroups(e.fields.App)) {
        if (!existsSync(file)) { failures.push(`${e.id}: missing ${file}`); continue }
        const src = readFileSync(file, 'utf8')
        for (const s of symbols) {
          checked++
          if (!symbolResolvesIn(s, src)) failures.push(`${e.id}: \`${s}\` not in ${file}`)
        }
      }
    }
    expect(checked, 'guard may be vacuous').toBeGreaterThanOrEqual(30)
    expect(failures).toEqual([])
  })

  it('names only app tests that exist', () => {
    const missing = entries
      .flatMap((e) => (e.fields.Tests ? parseGroups(e.fields.Tests).map((g) => [e.id, g.file]) : []))
      .filter(([, file]) => file.startsWith('src/') && !existsSync(file))
    expect(missing).toEqual([])
  })

  it('parses only the documented site grammar', () => {
    expect(parseGroups('none')).toEqual([])
    expect(parseGroups('`a.js` (`x`, `y`); `b.md`')).toEqual([
      { file: 'a.js', symbols: ['x', 'y'] },
      { file: 'b.md', symbols: [] },
    ])
    expect(() => parseGroups('`a.js` (x)')).toThrow(/malformed/)
    expect(() => parseGroups('see `a.js`')).toThrow(/malformed/)
  })

  it('matches symbols whole-word only', () => {
    expect(symbolResolvesIn('eraTeam', 'export function eraTeam(')).toBe(true)
    expect(symbolResolvesIn('eraTeam', 'const eraTeamMap = {}')).toBe(false)
  })
})
