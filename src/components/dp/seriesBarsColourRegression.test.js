import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// dp-v2 Slice 6b — SeriesBars gained an additive `colour="neutral"` option (task file §3.1/§7).
// TrendCell does NOT import SeriesBars (grep-verified against live source at plan time), so a
// guard naming it would guard nothing — these three are SeriesBars' only real callers.
//
// EnvironmentSection.jsx and UsageEfficiencySection.jsx are NOT touched by this slice and must
// keep their default (sign-based) colouring — a future edit that slips a `colour=` prop onto
// either without updating this guard is exactly the silent-editorialising regression the task
// file's §3.1 was written to prevent. Teams.jsx, conversely, MUST pass `colour="neutral"` on its
// distribution strip now (6a's own flagged follow-up) — this guard checks that too.

describe('SeriesBars colour prop — the three real callers', () => {
  it('dp/EnvironmentSection.jsx does not pass a colour prop — default sign-based colouring stays', () => {
    const src = readFileSync('src/components/dp/EnvironmentSection.jsx', 'utf8')
    expect(src).toMatch(/<SeriesBars\b/)
    expect(src).not.toMatch(/<SeriesBars[^>]*colour=/)
  })

  it('dp/UsageEfficiencySection.jsx does not pass a colour prop — always scaled mode, already neutral', () => {
    const src = readFileSync('src/components/dp/UsageEfficiencySection.jsx', 'utf8')
    expect(src).toMatch(/<SeriesBars\b/)
    expect(src).not.toMatch(/<SeriesBars[^>]*colour=/)
  })

  it('teams/Teams.jsx passes colour="neutral" on its distribution strip', () => {
    const src = readFileSync('src/components/teams/Teams.jsx', 'utf8')
    expect(src).toMatch(/<SeriesBars[^>]*colour="neutral"/)
  })

  it('dp/TrendCell.jsx does not import SeriesBars — not a caller, guarding it would guard nothing', () => {
    const src = readFileSync('src/components/dp/TrendCell.jsx', 'utf8')
    expect(src).not.toMatch(/from\s+['"]\.\/SeriesBars['"]/)
  })
})
