import { useMemo } from 'react'
import { useWeeklyDecision } from '../../hooks/useWeeklyDecision'
import { WeightPanel } from './WeightPanel'
import { MatchupHeader } from './MatchupHeader'
import { LineupTable } from './LineupTable'
import { ProjectionGapNotice } from './ProjectionGapNotice'
import { SeasonGrid } from './SeasonGrid'
import { PageEyebrow } from '../dp/cells'

// weekly-decision-1-lineup.md §6, weekly-decision-2a-lineup-truth.md §6,
// weekly-decision-2-panels.md §6 — route container for `/week`, "This week". Header: "This week",
// then `Week {n} · {season} · {myTeamName} · {league format}`. Stacks the weight panel, the
// PROJ-gap notice (§4b), the lineup table (starters as set in
// Sleeper, then the bench, with the §1a prior-season SNAP sub-line)
// and the season grid (§3). Defences moved to My Team's Defences ahead (myteam-m2b-defences-ahead.md); offences moved to My Team's offences table (myteam-m2a-offences.md);
// the lineup's PACE/PROE read App's teamContextByYear[season]. The lineup's OURS column
// (week-own-projection.md) reads the scored `seasonProjections` passed in. Props-only, exactly as `/teams` is; no fetching
// of its own beyond what useWeeklyDecision orchestrates.
//
// The header card names this week's league opponent from a live-week `getMatchups` read in
// `useWeeklyDecision` (week-w-matchup-flags-visuals.md), states why when there is none, and the
// weight panel now sits in the lineup's "How to read these columns" legend. The lineup gets `matchupCols` (its matchup columns) and `oursPending` (season projections still null — OURS and the header's OURS total read "not available yet"); `defenceSeason` names the grey YDS ALLOWED season. It also gets `stripByPlayer` and `usageTrendByPlayer` (W2b-3: the weekly strip and usage trend) and `usagePctByPlayer` (usage-share colour) and `percentileBasis`; the season grid renders the hook's `seasonGrid`.

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
  defenceAllowed = null,
  rosterTeams = [],
  rosterPositions = [],
  scoringSettings = {},
  playerMap = null,
  nflState = null,
  myTeamName = null,
  nflScheduleByYear = {},
  teamContextByYear = {},
  onOpenPlayerDetail = () => {},
  seasonProjections = null,
  leagueId = null,
  standings = [],
  percentileBasis = null,
  starterWeeks = [],
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
  // Live team context from App's teamContextByYear (myteam-m2a-offences.md D7) — the hook gates on
  // .complete; an absent key reads as no data.
  const liveTeamContext = teamContextByYear?.[season] ?? null

  const {
    weights, lineup, n, loading, error, failedWeeks,
    priorSeason, priorSnapByPlayer, dataSeason,
    projectionGap, ownByPlayer, matchup, startSit, matchupCols,
    seasonGrid, stripByPlayer, usageTrendByPlayer, usagePctByPlayer,
  } = useWeeklyDecision({
    season,
    currentWeek,
    myTeam,
    rosterPositions,
    scoringSettings,
    careerStats,
    defenceAllowed,
    playerMap,
    schedule,
    seasonProjections,
    leagueId,
    starterWeeks,
    rosterTeams,
    standings,
    liveTeamContext,
  })

  // OURS reads "not available yet" while App.jsx's season projections are null (W2a D8).
  const oursPending = seasonProjections == null

  const metaParts = []
  if (myTeamName != null) metaParts.push(myTeamName)
  if (rosterTeams.length > 0) metaParts.push(`${rosterTeams.length}-team ${qbFormatLabel(rosterPositions)}`)
  const scoringPart = formatScoring(scoringSettings?.rec)
  if (scoringPart != null) metaParts.push(scoringPart)

  if (myTeamName == null) {
    return (
      <div className="bg-dp-canvas rounded-lg py-12 text-center">
        <div>
          <PageEyebrow>Manage</PageEyebrow>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-dp-text mb-3">This week</h1>
        </div>
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
        <div>
          <PageEyebrow>Manage</PageEyebrow>
          <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-dp-text mb-3">This week</h1>
        </div>
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
          <div>
            <PageEyebrow>Manage</PageEyebrow>
            <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-dp-text">This week</h1>
          </div>
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
              {failedWeeks.length > 1 ? 'are' : 'is'} missing from usage, ranks and form below.
            </p>
          )}
        </div>
        <div className="w-full xl:w-[420px] shrink-0">
          <MatchupHeader matchup={matchup} startSit={startSit} loading={loading} oursPending={oursPending} />
        </div>
      </div>

      <ProjectionGapNotice reason={projectionGap} week={currentWeek} />
      <LineupTable
        starters={lineup.starters}
        bench={lineup.bench}
        loading={loading}
        priorSnapByPlayer={priorSnapByPlayer}
        onOpenPlayerDetail={onOpenPlayerDetail}
        lastSeason={dataSeason}
        thisSeason={season}
        ownByPlayer={ownByPlayer}
        matchupCols={matchupCols}
        oursPending={oursPending}
        defenceSeason={priorSeason}
        startSit={startSit}
        stripByPlayer={stripByPlayer}
        usageTrendByPlayer={usageTrendByPlayer}
        usagePctByPlayer={usagePctByPlayer}
        percentileBasis={percentileBasis}
        legendLead={<WeightPanel weights={weights} n={n} season={season} priorSeason={priorSeason} />}
      />

      <SeasonGrid grid={seasonGrid} percentileBasis={percentileBasis} />
    </div>
  )
}
