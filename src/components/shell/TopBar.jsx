import { NavLink } from 'react-router-dom'

// <!-- slot: phase-chip / "as of" / command-palette trigger (filled in later slices) -->
export function TopBar({ user, selectedLeague, onSwitch, tooltipsEnabled, onToggleTooltips, theme, onToggleTheme, showLeagueLink }) {
  const isDark = theme === 'dark'
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="max-w-5xl mx-auto px-8 h-14 flex items-center justify-between">
        <span className="font-bold text-[var(--color-text)] tracking-tight">Sleeper Dashboard</span>
        <div className="flex items-center gap-3 text-sm">
          {/* League affordance for mobile — hidden on desktop where NavRail shows it */}
          {showLeagueLink && (
            <NavLink
              to="/league"
              className={({ isActive }) =>
                `md:hidden text-xs px-2 py-1 rounded transition-colors ${
                  isActive ? 'bg-[var(--color-accent-subtle-bg)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
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
              <span className="font-medium text-[var(--color-text-secondary)]">{user.display_name || user.username}</span>
              {selectedLeague && (
                <>
                  <span className="text-[var(--color-text-faintest)]">·</span>
                  <span className="text-[var(--color-text-muted)] max-w-48 truncate">{selectedLeague.name}</span>
                </>
              )}
              <button onClick={onSwitch}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-text-semi-muted)] text-xs underline underline-offset-2">
                Switch
              </button>
            </>
          )}
          <button
            onClick={onToggleTheme}
            className="text-[var(--color-text-faint)] hover:text-[var(--color-text-semi-muted)] text-xs flex items-center gap-1"
            title="Toggle light/dark theme"
          >
            <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
            <span>{isDark ? 'Light' : 'Dark'}</span>
          </button>
          <button
            onClick={onToggleTooltips}
            className="text-[var(--color-text-faint)] hover:text-[var(--color-text-semi-muted)] text-xs"
            title="Toggle tooltips on/off"
          >
            Tooltips {tooltipsEnabled ? 'on' : 'off'}
          </button>
        </div>
      </div>
    </header>
  )
}
