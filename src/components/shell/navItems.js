export const DEFAULT_ROUTE = '/portfolio'

// Flat — consumed by BottomTabBar (mobile), capped at 5 items there already.
export const PRIMARY_NAV = [
  { key: 'portfolio', label: 'Portfolio',   path: '/portfolio' },
  { key: 'market',    label: 'Market',      path: '/market'    },
  { key: 'trade',     label: 'Trade desk',  path: '/trade'     },
  { key: 'board',     label: 'Draft board', path: '/board'     },
]

export const LEAGUE_NAV = [
  { key: 'standings', label: 'Standings', path: '/league/standings' },
  { key: 'schedule',  label: 'Schedule',  path: '/league/schedule'  },
  { key: 'rosters',   label: 'Rosters',   path: '/league/rosters'   },
]

export const ROOKIES_NAV = { key: 'rookies', label: 'Rookies', path: '/rookies' } // route added in slice 7

// Grouped — consumed by NavRail (desktop). Mirrors the handoff's MANAGE/ACT/LEAGUE sections.
export const NAV_GROUPS = [
  { key: 'manage', label: 'MANAGE', items: [PRIMARY_NAV[0], PRIMARY_NAV[1]] },
  { key: 'act',    label: 'ACT',    items: [PRIMARY_NAV[2], PRIMARY_NAV[3]] },
  { key: 'league', label: 'LEAGUE', items: LEAGUE_NAV },
]

export function isRookieSeason(now = new Date()) {
  const m = now.getMonth()          // 0=Jan … 11=Dec
  return m >= 0 && m <= 4           // Jan–May
}
