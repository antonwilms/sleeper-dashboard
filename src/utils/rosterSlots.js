// weekly-decision-2a-lineup-truth.md §2 — Sleeper's raw roster.starters, aligned to
// startingSlots(rosterPositions) order, with the empty-slot sentinel resolved. Also owns Sleeper
// roster -> id-list splitting (lineup-pool-startable.md). Leaf module, imports nothing.

export const EMPTY_SLOT_ID = '0'

// Sleeper's empty-starting-slot sentinel is the string '0'. null / '' are treated the same so a
// malformed entry can never shift later starters into the wrong slot.
export function isFilledSlotId(id) {
  return id !== EMPTY_SLOT_ID && id != null && id !== ''
}

// Sleeper's raw roster.starters, one entry per starting slot, in roster_positions order -> the
// same length, each entry a player id or null. Never filters, never re-sorts.
export function alignStarterSlots(rawStarters) {
  return (rawStarters ?? []).map(id => (isFilledSlotId(id) ? id : null))
}

// Sleeper's roster.players includes reserve (IR) and taxi ids. Returns four disjoint id lists:
// starters (filled slots only, in set order), bench = players − starters − reserve − taxi, reserve,
// taxi. null/absent reserve or taxi (Sleeper sends null when empty) -> [].
export function splitRosterIds(roster) {
  const starters = (roster?.starters ?? []).filter(isFilledSlotId)
  const reserve = roster?.reserve ?? []
  const taxi = roster?.taxi ?? []
  const excluded = new Set([...starters, ...reserve, ...taxi])
  const bench = (roster?.players ?? []).filter(id => !excluded.has(id))
  return { starters, bench, reserve, taxi }
}

// Every rostered player on a rosterTeams entry, once each, in starters → bench → reserve → taxi order
// (first occurrence wins). The union sites — ownership, the career-fetch id set, the Rosters tab — read
// this so taxi players stay owned now that `bench` excludes them. Absent fields -> [].
export function rosteredPlayers(team) {
  const seen = new Set()
  const out = []
  for (const p of [...(team?.starters ?? []), ...(team?.bench ?? []), ...(team?.reserve ?? []), ...(team?.taxi ?? [])]) {
    if (seen.has(p.id)) continue
    seen.add(p.id)
    out.push(p)
  }
  return out
}
