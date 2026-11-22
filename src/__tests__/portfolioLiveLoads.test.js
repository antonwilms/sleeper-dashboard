import { readFileSync, readdirSync } from 'node:fs'
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

// myteam-m2a-offences.md D7 — /week reads App's live team context; its route-scoped load is gone.
describe('/week reads App\'s live team context (M2a)', () => {
  const listSrc = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const full = `${dir}/${e.name}`
    if (e.isDirectory()) return listSrc(full)
    return /\.jsx?$/.test(e.name) && !/\.test\.jsx?$/.test(e.name) ? [full] : []
  })

  it('useWeeklyDecision no longer loads team context', () => {
    const hook = readFileSync('src/hooks/useWeeklyDecision.js', 'utf8')
    expect(hook).not.toMatch(/loadTeamContext|api\/teamContext/)
    expect(hook).not.toMatch(/setLiveTeamContext/)
  })

  it('App passes teamContextByYear to <WeekView>', () => {
    const start = APP.indexOf('<WeekView')
    const block = APP.slice(start, APP.indexOf('/>', start))
    expect(block).toContain('teamContextByYear={teamContextByYear}')
  })

  it('only App.jsx and useTeamHistoryLoader.js import loadTeamContext', () => {
    const importers = listSrc('src')
      .filter(f => /import\s*\{[^}]*\bloadTeamContext\b[^}]*\}\s*from/.test(readFileSync(f, 'utf8')))
      .sort()
    expect(importers).toEqual(['src/App.jsx', 'src/hooks/useTeamHistoryLoader.js'])
  })
})

// myteam-m3-visuals.md D1/D4 — My Team's weekly strip is fed App's /week basis and live weekly rows.
describe('My Team weekly strip props (M3 P3)', () => {
  const block = tag => { const start = APP.indexOf(tag); return APP.slice(start, APP.indexOf('/>', start)) }

  it('<Portfolio> gets /week\'s percentile basis and the live weekly rows through the shared selector', () => {
    const portfolio = block('<Portfolio')
    expect(portfolio).toContain('percentileBasis={starterPercentiles}')
    expect(portfolio).toContain('liveWeeklyRows={selectLiveWeekly(defenceWeeklyByYear, nflState)}')
    expect(block('<WeekView')).toContain('percentileBasis={starterPercentiles}')
  })
})

