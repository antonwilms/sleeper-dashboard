import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Static guard for the §3.1 hazard in dp-v2-2-loader-wiring.md: App.jsx already binds a
// `teamContext` memo (current-team-pinned, feeding computeDynastyScore/computeNextSeasonProjection).
// The redeclaration hazard of adding a same-named useState is loud (the build goes red), but
// silently RENAMING THE MEMO instead would feed the view-only nflverse teamContext loader family
// straight into the dynasty score and the projection — and none of the three src/utils/-scoped
// view-only guards can see App.jsx to catch it. This test makes that invariant mechanically
// checkable inside App.jsx itself.

const src = readFileSync('src/App.jsx', 'utf8')

// Extracts the full text of a call expression starting at `name(`, balancing parens so
// multi-line argument lists (including object-literal args) are captured whole rather than
// truncated at the first `)` — a whole-file regex would false-positive on the state
// declarations sitting ~200 lines above these call sites.
function extractCall(source, name) {
  const start = source.indexOf(`${name}(`)
  if (start === -1) throw new Error(`${name}( not found in src/App.jsx`)
  let depth = 0
  let i = start + name.length
  const argsStart = i
  for (; i < source.length; i++) {
    if (source[i] === '(') depth++
    else if (source[i] === ')') {
      depth--
      if (depth === 0) return source.slice(argsStart, i + 1)
    }
  }
  throw new Error(`unbalanced parens reading ${name}( call in src/App.jsx`)
}

describe('projection inputs guard (App.jsx)', () => {
  it('the projection teamContext memo still exists, not renamed', () => {
    expect(src).toMatch(/const teamContext = useMemo\(/)
  })

  it('computeDynastyScore still receives the bare teamContext memo', () => {
    const call = extractCall(src, 'computeDynastyScore')
    expect(call).toMatch(/(^|[^.\w])teamContext,/)
  })

  it('computeNextSeasonProjection still receives the bare teamContext memo', () => {
    const call = extractCall(src, 'computeNextSeasonProjection')
    expect(call).toMatch(/(^|[^.\w])teamContext,/)
  })

  it('computeDynastyScore does not receive any of the new …ByYear state', () => {
    const call = extractCall(src, 'computeDynastyScore')
    expect(call).not.toMatch(/teamContextByYear|gameLogsByYear|nflScheduleByYear/)
  })

  it('computeNextSeasonProjection does not receive any of the new …ByYear state', () => {
    const call = extractCall(src, 'computeNextSeasonProjection')
    expect(call).not.toMatch(/teamContextByYear|gameLogsByYear|nflScheduleByYear/)
  })
})
