import { NavLink } from 'react-router-dom'

// <!-- slot: phase-chip / "as of" / command-palette trigger (filled in later slices) -->
export function TopBar({ user, selectedLeague, onSwitch, tooltipsEnabled, onToggleTooltips, showLeagueLink }) {
  return (
    <header className="sticky top-0 z-30 border-b bg-white">
      <div className="max-w-5xl mx-auto px-8 h-14 flex items-center justify-between">
        <span className="font-bold text-gray-900 tracking-tight">Sleeper Dashboard</span>
        <div className="flex items-center gap-3 text-sm">
          {/* League affordance for mobile — hidden on desktop where NavRail shows it */}
          {showLeagueLink && (
            <NavLink
              to="/league"
              className={({ isActive }) =>
                `md:hidden text-xs px-2 py-1 rounded transition-colors ${
                  isActive ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:text-gray-700'
                }`
              }
            >
              League
            </NavLink>
          )}
          {user && (
            <>
              {user.avatar && (
                <img src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} alt=""
                  className="w-7 h-7 rounded-full object-cover" />
              )}
              <span className="font-medium text-gray-700">{user.display_name || user.username}</span>
              {selectedLeague && (
                <>
                  <span className="text-gray-300">·</span>
                  <span className="text-gray-500 max-w-48 truncate">{selectedLeague.name}</span>
                </>
              )}
              <button onClick={onSwitch}
                className="text-gray-400 hover:text-gray-600 text-xs underline underline-offset-2">
                Switch
              </button>
            </>
          )}
          <button
            onClick={onToggleTooltips}
            className="text-gray-400 hover:text-gray-600 text-xs"
            title="Toggle tooltips on/off"
          >
            Tooltips {tooltipsEnabled ? 'on' : 'off'}
          </button>
        </div>
      </div>
    </header>
  )
}
