// '/market' is the landing surface (settled 2026-08-18, dp-v2 §2.2). Market is the app's
// data-display centre of gravity; Portfolio is one click away in the rail.
export const DEFAULT_ROUTE = '/market'

// Flat — consumed by BottomTabBar (mobile), capped at 5 items there already.
export const PRIMARY_NAV = [
  { key: 'portfolio', label: 'Portfolio',   path: '/portfolio' },
  { key: 'market',    label: 'Market',      path: '/market'    },
]

export const LEAGUE_NAV = [
  { key: 'standings', label: 'Standings', path: '/league/standings' },
  { key: 'schedule',  label: 'Schedule',  path: '/league/schedule'  },
  { key: 'rosters',   label: 'Rosters',   path: '/league/rosters'   },
]

export const ROOKIES_NAV = { key: 'rookies', label: 'Rookies', path: '/rookies' } // route added in slice 7

// The ACT group (Trade desk, Draft board) was removed from nav in dp-v2 Slice 5a: both members
// are gated placeholders, and a rail group with a dead third undermined the rest of it. Their
// routes (/trade, /board) stay live and reachable by URL — they are unbuilt, not retired, so no
// redirects — they are simply no longer linked from PRIMARY_NAV or NAV_GROUPS.

// Small key lookup, not array-index slicing — indexing PRIMARY_NAV positionally (as this file did
// before 5a) silently re-points a group at whatever shifts into that slot when an entry is added
// or removed, which produces a wrong nav rather than an error.
function byKey(key) {
  const item = PRIMARY_NAV.find(i => i.key === key)
  if (!item) throw new Error(`navItems: PRIMARY_NAV has no entry with key "${key}"`)
  return item
}

// Grouped — consumed by NavRail (desktop). Mirrors the handoff's MANAGE/LEAGUE sections (ACT
// removed, dp-v2 Slice 5a).
export const NAV_GROUPS = [
  { key: 'manage', label: 'MANAGE', items: [byKey('portfolio'), byKey('market')] },
  { key: 'league', label: 'LEAGUE', items: LEAGUE_NAV },
]

export function isRookieSeason(now = new Date()) {
  const m = now.getMonth()          // 0=Jan … 11=Dec
  return m >= 0 && m <= 4           // Jan–May
}
