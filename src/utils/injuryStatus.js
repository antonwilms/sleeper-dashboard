// Sleeper injury_status → short chip text. Moved out of Portfolio.jsx (D12) so the Portfolio
// status column and the team depth chart share one mapping. View-only.
export const INJURY_ABBR = { Questionable: 'Q', Doubtful: 'D', Out: 'OUT', IR: 'IR', PUP: 'PUP', Sus: 'SUS' }

export function injuryShort(status) {
  if (status == null || status === '') return null
  return INJURY_ABBR[status] ?? String(status).toUpperCase()
}
