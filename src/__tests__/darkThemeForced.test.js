import { readFileSync, existsSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// dp-v2 §2.1: the app is dark-only, and the class is hard-coded in markup so there is no
// light flash on first paint. This guards the invariant static assertions in index.html
// wouldn't otherwise catch if it regressed.

describe('dark theme is unconditional', () => {
  it('index.html carries class="dark" on <html>, reads no localStorage, and theme.js is gone', () => {
    const html = readFileSync('index.html', 'utf8')
    const htmlTag = html.match(/<html[^>]*>/)[0]
    expect(htmlTag).toMatch(/class="[^"]*\bdark\b[^"]*"/)
    expect(html).not.toMatch(/localStorage/)
    expect(existsSync('src/theme.js')).toBe(false)
  })
})
