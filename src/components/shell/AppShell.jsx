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
  // Layout (Terminal direction): the nav rail runs the full height on the left; TopBar and the
  // content column sit to its right. With showNav false (onboarding) there is no rail and TopBar
  // spans the window.
  return (
    <div className="flex min-h-screen">
      {showNav && <NavRail showRookies={showRookies} />}

      <div className="flex-1 min-w-0 flex flex-col">
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

        {/* Content area — bottom padding accounts for mobile tab bar when nav is shown.
            `min-w-0` is load-bearing, not cosmetic: a flex item defaults to `min-width: auto`,
            which refuses to shrink below its content's min-content width. Without it, any wide
            child — a table inside `overflow-x-auto`, whose scroller then never gets to scroll —
            widens this element past the viewport and the whole PAGE scrolls sideways instead.
            Found in Portfolio Slice D, where a 12-column table took the document to 1549px
            against a 1425px viewport. Every surface's tables sit under this one element, so
            removing this class re-breaks all of them at once, and no class-string test can see
            it — only the running app can. The wrapping column above carries `min-w-0` for the
            same reason, one flex level up. */}
        <main
          className="flex-1 min-w-0 w-full mx-auto max-w-[1600px] px-4 sm:px-6 lg:px-7 py-7"
          style={showNav ? { paddingBottom: TAB_BAR_HEIGHT + 32 } : undefined}
        >
          {children}
        </main>
      </div>

      {showNav && <BottomTabBar showRookies={showRookies} />}
    </div>
  )
}
