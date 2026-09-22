// weekly-decision-2a-lineup-truth.md §2 — Sleeper's raw roster.starters, aligned to
// startingSlots(rosterPositions) order, with the empty-slot sentinel resolved. Leaf module, imports
// nothing.

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
