// Sleeper image CDN URL builders (in-season notes P7 — sleeper-images.md). Pure, no React, no I/O.
// URLs are built only from validated tokens: a numeric player id, or one of the 32 Sleeper-domain
// team codes. Everything else returns null and the caller renders its fallback. Team codes are the
// SLEEPER domain only (`LAR`, never era-accurate `LA` — CR-16); this module performs no domain hop.

import { NFL_TEAMS } from './marketFilters'

const CDN = 'https://sleepercdn.com'

// Derived from marketFilters.js's NFL_TEAMS (the Sleeper-domain 32), not a second literal — a
// franchise move is edited in one place.
export const SLEEPER_LOGO_TEAMS = new Set(NFL_TEAMS)

// '4046' → …/content/nfl/players/thumb/4046.jpg; anything not all-digits (null, 'KC', 'p1') → null.
export function playerHeadshotUrl(playerId) {
  if (typeof playerId !== 'string' && typeof playerId !== 'number') return null
  const id = String(playerId)
  return /^\d+$/.test(id) ? `${CDN}/content/nfl/players/thumb/${id}.jpg` : null
}

// 'KC' → …/images/team_logos/nfl/kc.png; null / 'FA' / era codes / lower-case input → null.
export function teamLogoUrl(team) {
  if (typeof team !== 'string' || !SLEEPER_LOGO_TEAMS.has(team)) return null
  return `${CDN}/images/team_logos/nfl/${team.toLowerCase()}.png`
}
