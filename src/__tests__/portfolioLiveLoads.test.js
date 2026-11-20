import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// myteam-m1-live-season.md D3/D4 — My Team's live-season loads are wired in App.jsx: the live teamcontext
// effect (merged into the view-only teamContextByYear) and the on-demand gamelogs callback. Source guard,
// modelled on weeklyDecisionViewOnly.test.js.
const APP = readFileSync('src/App.jsx', 'utf8')

describe('My Team live loads (App.jsx)', () => {
  it('loads dataSeason + 1 team context into teamContextByYear', () => {
    expect(APP).toMatch(/const liveTcSeason = allSeasons\[allSeasons\.length - 1\] \+ 1/)
    expect(APP).toMatch(/loadTeamContext\(liveTcSeason\)/)
    expect(APP).toMatch(/setTeamContextByYear\(prev => \(\{ \.\.\.prev, \[liveTcSeason\]: r \}\)\)/)
  })

  it('passes onNeedGameLogSeason to <Portfolio> and no longer a username', () => {
    const start = APP.indexOf('<Portfolio')
    const block = APP.slice(start, APP.indexOf('/>', start))
    expect(block).toContain('onNeedGameLogSeason={onNeedGameLogSeason}')
    expect(block).not.toContain('username=')
  })
})
