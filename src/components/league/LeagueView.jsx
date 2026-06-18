import { NavLink, useParams } from 'react-router-dom'
import { StandingsTable } from './StandingsTable'
import { ScheduleGrid } from './ScheduleGrid'
import { RostersTab } from './RostersTab'
import { LEAGUE_NAV } from '../shell/navItems'

export function LeagueView({ leagueData }) {
  const { view = 'standings' } = useParams()
  const activeView = ['standings', 'schedule', 'rosters'].includes(view) ? view : 'standings'

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b">
        {LEAGUE_NAV.map(item => (
          <NavLink
            key={item.key}
            to={item.path}
            className={({ isActive }) =>
              `px-4 py-2 text-sm capitalize transition-colors ${
                isActive || (item.key === activeView)
                  ? 'border-b-2 border-blue-600 text-blue-600 font-medium'
                  : 'text-gray-500 hover:text-gray-700'
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
