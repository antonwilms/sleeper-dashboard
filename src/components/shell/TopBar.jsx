import { NavLink } from 'react-router-dom'

export function TopBar({ user, selectedLeague, onSwitch, tooltipsEnabled, onToggleTooltips, theme, onToggleTheme, showLeagueLink, currentWeek }) {
  const isDark = theme === 'dark'
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-[18px] h-[18px] rounded-sm bg-[var(--color-accent)]" aria-hidden="true" />
          {selectedLeague && (
            <span className="font-semibold text-[var(--color-text)] tracking-tight flex items-center gap-1">
              {selectedLeague.name}
              <span className="text-[var(--color-text-faint)]" aria-hidden="true">▾</span>
            </span>
          )}
        </div>

        <div className="flex-1 max-w-md hidden sm:block">
          <input
            type="text"
            disabled
            placeholder="Search players, teams…"
            className="w-full text-sm border border-[var(--color-border)] bg-[var(--color-surface)] rounded px-3 py-1.5 placeholder:text-[var(--color-text-muted)]"
          />
        </div>

        <div className="flex items-center gap-3 text-sm shrink-0">
          {currentWeek != null && (
            <span className="hidden md:flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive-solid)]" aria-hidden="true" />
              Data current · Week {currentWeek}
            </span>
          )}
          <button
            onClick={onToggleTheme}
            className="text-[var(--color-text-faint)] hover:text-[var(--color-text-semi-muted)] text-xs flex items-center gap-1"
            title="Toggle light/dark theme"
          >
            <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
            <span>{isDark ? 'Light' : 'Dark'}</span>
          </button>
          {user && (
            <>
              {user.avatar && (
                <img src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} alt=""
                  className="w-7 h-7 rounded-full object-cover" />
              )}
              <span className="font-medium text-[var(--color-text-secondary)]">{user.display_name || user.username}</span>
              <button onClick={onSwitch}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-text-semi-muted)] text-xs underline underline-offset-2">
                Switch
              </button>
            </>
          )}
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
