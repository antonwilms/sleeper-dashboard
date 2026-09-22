import { useMemo } from 'react'
import { useWeeklyDecision } from '../../hooks/useWeeklyDecision'
import { WeightPanel } from './WeightPanel'
import { LineupTable } from './LineupTable'
import { StoreLagNotice } from './StoreLagNotice'

// weekly-decision-1-lineup.md §6, weekly-decision-2a-lineup-truth.md §6 — route container for
// `/week`, "This week". Header: "This week", then `Week {n} · {season} · {myTeamName} · {league
// format}`. Stacks the weight panel, the store-lag notice (when behind) and the lineup table
// (starters as set in Sleeper, then the bench) — panels 3–5 (Defences you face / Offences you own
// / the season grid) are weekly-decision-2-panels.md, not this slice. Props-only, exactly as
// `/teams` is; no fetching of its own beyond what useWeeklyDecision orchestrates.
//
// No "vs {opponent}" clause. The design's header names the week's league matchup, but nothing in
// `leagueData` carries it — `weeklyScores` is built from completed weeks only (App.jsx:790-805)
// and neither `rosterTeams` nor `standings` holds a schedule. v1 omits it rather than adding a
// Sleeper matchups fetch for a line of chrome (Anton, 2026-09-21) — a deliberate departure from
// artboard 9a, not an oversight.

function formatScoring(rec) {
  if (rec === 1) return 'PPR'
  if (rec === 0.5) return 'half-PPR'
  if (rec === 0) return 'standard'
  if (Number.isFinite(rec)) return `${rec}-PPR`
  return null
}

function qbFormatLabel(rosterPositions) {
  const list = rosterPositions ?? []
  if (list.includes('SUPER_FLEX')) return 'superflex'
  if (list.filter(s => s === 'QB').length >= 2) return '2QB'
  return '1QB'
}

export function WeekView({
  careerStats,
  currentSeasonTotals = null,
  rosterTeams = [],
  rosterPositions = [],
  scoringSettings = {},
  playerMap = null,
  nflState = null,
  myTeamName = null,
  nflScheduleByYear = {},
}) {
  const season = nflState?.season != null ? parseInt(nflState.season, 10) : null
  const currentWeek = nflState?.week ?? 0

  const myTeam = useMemo(
    () => rosterTeams.find(t => t.teamName === myTeamName) ?? null,
    [rosterTeams, myTeamName]
  )

  // Gated on `.complete` here, not by the hook — an absent/incomplete load passes null through,
  // and the graceful `unknown` path in weeklySchedule.js runs (§4).
  const scheduleEntry = nflScheduleByYear?.[season]
  const schedule = scheduleEntry?.complete ? scheduleEntry : null

  const { weights, lineup, n, storeLag, loading, error, failedWeeks } = useWeeklyDecision({
    season,
    currentWeek,
    myTeam,
    rosterPositions,
    scoringSettings,
    careerStats,
    currentSeasonTotals,
    playerMap,
    schedule,
  })

  const metaParts = []
  if (myTeamName != null) metaParts.push(myTeamName)
  if (rosterTeams.length > 0) metaParts.push(`${rosterTeams.length}-team ${qbFormatLabel(rosterPositions)}`)
  const scoringPart = formatScoring(scoringSettings?.rec)
  if (scoringPart != null) metaParts.push(scoringPart)

  if (myTeamName == null) {
    return (
      <div className="bg-dp-canvas rounded-lg py-12 text-center">
        <h1 className="text-xl font-semibold text-dp-text mb-3">This week</h1>
        <p className="text-dp-muted text-sm max-w-sm mx-auto">
          No roster found for your account in this league.
        </p>
      </div>
    )
  }

  // useWeeklyDecision clears its own `loading` on this same gate (no season or no NFL week yet) —
  // render a stated empty state rather than a spinner or a lineup built with no real week to score.
  if (!season || !currentWeek) {
    return (
      <div className="bg-dp-canvas rounded-lg py-12 text-center">
        <h1 className="text-xl font-semibold text-dp-text mb-3">This week</h1>
        <p className="text-dp-muted text-sm max-w-sm mx-auto">
          This week isn&rsquo;t known yet — the NFL week hasn&rsquo;t been reported.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-dp-canvas flex flex-col gap-[18px]">
      <div className="flex flex-col xl:flex-row xl:items-start gap-4 xl:gap-7">
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">This week</h1>
          <p className="text-[13px] text-dp-muted mt-1">
            Week {currentWeek} · {season ?? '—'}{metaParts.length ? ` · ${metaParts.join(' · ')}` : ''}
          </p>
          {error && (
            <p className="text-[12px] text-dp-down-text mt-2">
              This week&rsquo;s projections failed to load: {error}
            </p>
          )}
          {failedWeeks.length > 0 && (
            <p className="text-[12px] text-dp-down-text mt-2">
              Week{failedWeeks.length > 1 ? 's' : ''} {failedWeeks.join(', ')} failed to load and{' '}
              {failedWeeks.length > 1 ? 'are' : 'is'} missing from usage and form below.
            </p>
          )}
        </div>
        <div className="w-full xl:w-[420px] shrink-0">
          <WeightPanel weights={weights} n={n} season={season} storeLag={storeLag} />
        </div>
      </div>

      <StoreLagNotice storeLag={storeLag} season={season} />
      <LineupTable starters={lineup.starters} bench={lineup.bench} loading={loading} />
    </div>
  )
}
