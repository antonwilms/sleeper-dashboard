import { TopBar } from './TopBar'
import { NavRail } from './NavRail'
import { BottomTabBar, TAB_BAR_HEIGHT } from './BottomTabBar'

export function AppShell({
  user,
  selectedLeague,
  onSwitch,
  showNav,
  showRookies,
  currentWeek,
  searchablePlayers,
  popupOpen,
  onOpenPlayerDetail,
  children,
}) {
  return (
    <div className="flex flex-col min-h-screen">
      <TopBar
        user={user}
        selectedLeague={selectedLeague}
        onSwitch={onSwitch}
        showLeagueLink={showNav}
        currentWeek={currentWeek}
        searchablePlayers={searchablePlayers}
        popupOpen={popupOpen}
        onOpenPlayerDetail={onOpenPlayerDetail}
      />

      <div className="flex flex-1">
        {showNav && <NavRail showRookies={showRookies} />}

        {/* Content area — bottom padding accounts for mobile tab bar when nav is shown.
            `min-w-0` is load-bearing, not cosmetic: a flex item defaults to `min-width: auto`,
            which refuses to shrink below its content's min-content width. Without it, any wide
            child — a table inside `overflow-x-auto`, whose scroller then never gets to scroll —
            widens this element past the viewport and the whole PAGE scrolls sideways instead.
            Found in Portfolio Slice D, where a 12-column table took the document to 1549px
            against a 1425px viewport. Every surface's tables sit under this one element, so
            removing this class re-breaks all of them at once, and no class-string test can see
            it — only the running app can. */}
        <main
          className="flex-1 min-w-0 w-full mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-8 py-8"
          style={showNav ? { paddingBottom: TAB_BAR_HEIGHT + 32 } : undefined}
        >
          {children}
        </main>
      </div>

      {showNav && <BottomTabBar showRookies={showRookies} />}
    </div>
  )
}
