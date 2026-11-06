import { NavLink, useParams } from 'react-router-dom'
import { StandingsTable } from './StandingsTable'
import { ScheduleGrid } from './ScheduleGrid'
import { RostersTab } from './RostersTab'
import { LEAGUE_NAV } from '../shell/navItems'
import { PageEyebrow } from '../dp/cells'

export function LeagueView({ leagueData }) {
  const { view = 'standings' } = useParams()
  const activeView = ['standings', 'schedule', 'rosters'].includes(view) ? view : 'standings'

  const activeLabel = LEAGUE_NAV.find(item => item.key === activeView)?.label

  return (
    <div className="flex flex-col gap-5">
      <div>
        <PageEyebrow>League</PageEyebrow>
        <h1 className="text-[28px] leading-tight font-semibold tracking-[-0.025em] text-[var(--color-text)]">{activeLabel}</h1>
      </div>
      <div className="flex gap-2 md:hidden">
        {LEAGUE_NAV.map(item => (
          <NavLink
            key={item.key}
            to={item.path}
            className={({ isActive }) =>
              `px-3.5 h-8 flex items-center rounded-full text-[12.5px] capitalize transition-colors ${
                isActive || (item.key === activeView)
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] font-semibold'
                  : 'border border-[var(--color-surface-4)] text-[var(--color-text-semi-muted)] hover:text-[var(--color-text)]'
              }`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </div>

      {activeView === 'standings' && <StandingsTable standings={leagueData.standings} />}
      {activeView === 'schedule' && (
        <ScheduleGrid
          standings={leagueData.standings}
          weeklyScores={leagueData.weeklyScores}
          weeks={leagueData.weeks}
        />
      )}
      {activeView === 'rosters' && <RostersTab rosterTeams={leagueData.rosterTeams} />}
    </div>
  )
}
