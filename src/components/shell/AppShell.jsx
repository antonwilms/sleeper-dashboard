import { TopBar } from './TopBar'
import { NavRail } from './NavRail'
import { BottomTabBar, TAB_BAR_HEIGHT } from './BottomTabBar'

export function AppShell({
  user,
  selectedLeague,
  onSwitch,
  tooltipsEnabled,
  onToggleTooltips,
  theme,
  onToggleTheme,
  showNav,
  showRookies,
  children,
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        user={user}
        selectedLeague={selectedLeague}
        onSwitch={onSwitch}
        tooltipsEnabled={tooltipsEnabled}
        onToggleTooltips={onToggleTooltips}
        theme={theme}
        onToggleTheme={onToggleTheme}
        showLeagueLink={showNav}
      />

      <div className="flex flex-1">
        {showNav && <NavRail showRookies={showRookies} />}

        {/* Content area — bottom padding accounts for mobile tab bar when nav is shown */}
        <main
          className="flex-1 w-full mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8"
          style={showNav ? { paddingBottom: TAB_BAR_HEIGHT + 32 } : undefined}
        >
          {children}
        </main>
      </div>

      {showNav && <BottomTabBar showRookies={showRookies} />}
    </div>
  )
}
