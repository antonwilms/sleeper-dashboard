// Sleeper injury_status → short chip text. Moved out of Portfolio.jsx (D12) so the Portfolio
// status column and the team depth chart share one mapping. View-only.
export const INJURY_ABBR = { Questionable: 'Q', Doubtful: 'D', Out: 'OUT', IR: 'IR', PUP: 'PUP', Sus: 'SUS' }

export function injuryShort(status) {
  if (status == null || status === '') return null
  return INJURY_ABBR[status] ?? String(status).toUpperCase()
}

// Statuses that take a player off the field for the week (moved from weeklyOwnProjection.js so My Team
// can read it without importing the /week projection module; weeklyOwnProjection re-exports it).
export const OUT_STATUSES = ['Out', 'IR', 'PUP', 'Sus', 'DNR']
