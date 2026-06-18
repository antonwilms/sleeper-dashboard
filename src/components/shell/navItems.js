export const DEFAULT_ROUTE = '/players'

export const PRIMARY_NAV = [
  { key: 'board',   label: 'Board',   path: '/board'   },
  { key: 'roster',  label: 'Roster',  path: '/roster'  },
  { key: 'players', label: 'Players', path: '/players' },
  { key: 'trade',   label: 'Trade',   path: '/trade'   },
]

export const LEAGUE_NAV = [
  { key: 'standings', label: 'Standings', path: '/league/standings' },
  { key: 'schedule',  label: 'Schedule',  path: '/league/schedule'  },
  { key: 'rosters',   label: 'Rosters',   path: '/league/rosters'   },
]

export const ROOKIES_NAV = { key: 'rookies', label: 'Rookies', path: '/rookies' } // route added in slice 7

export function isRookieSeason(now = new Date()) {
  const m = now.getMonth()          // 0=Jan … 11=Dec
  return m >= 0 && m <= 4           // Jan–May
}
