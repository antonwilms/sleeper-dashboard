// Frozen leading columns (slot + player) for tables inside <FrozenScroll>. Literal strings — Tailwind
// must see whole class names. Callers add the opaque background (tables differ); FROZEN_EDGE goes on
// the last frozen cell of each row and header. Existing tokens only. Week W2a, D4.
export const FROZEN_SLOT_W = 'w-[56px] min-w-[56px]'
// A td width is only a minimum in auto table layout; the label's own block caps it (56 − 18 − 4 padding).
export const FROZEN_SLOT_INNER = 'block w-[34px] truncate'
export const FROZEN_FIRST = 'sticky left-0 z-[2]'
export const FROZEN_SECOND = 'sticky left-[56px] z-[2]'
export const FROZEN_ROW_HOVER = 'group-hover/row:bg-dp-row-self group-focus/row:bg-dp-row-self'
export const FROZEN_EDGE = "after:content-[''] after:absolute after:inset-y-0 after:-right-3 after:w-3 after:pointer-events-none after:opacity-0 after:bg-linear-to-r after:from-dp-canvas after:to-transparent group-data-[scrolled=true]/scroll:after:opacity-100"
// A sticky cell is a stacking context; lift it while a popover dialog is open inside it (W2b-2 D12).
export const FROZEN_POPOVER_LIFT = 'has-[[role=dialog]]:z-[3]'
