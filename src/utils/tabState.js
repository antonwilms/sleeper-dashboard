// Pure, testable state-transition helpers for the player detail pop-up's tabs[]/activeTab pair
// (1b Slice v). App.jsx's openPlayerDetail/closeTab wrap these with the actual setState calls —
// extracted here (not left inline) because the FIFO-eviction and neighbour-activation rules are
// exactly the kind of logic worth unit-testing without mounting the whole app, which this repo
// has no precedent for.

/**
 * Adds a player_id to the open-tabs array, or activates it if already open.
 * At the cap, evicts the OLDEST tab (FIFO) rather than the active one — replacing the active tab
 * would silently remove what the user is currently reading.
 * @param {string[]} tabs  current open tabs, oldest first
 * @param {string} id
 * @param {number} cap
 * @returns {string[]}  next tabs array
 */
export function addTab(tabs, id, cap) {
  if (tabs.includes(id)) return tabs
  return tabs.length >= cap ? [...tabs.slice(1), id] : [...tabs, id]
}

/**
 * Removes one tab. When it was the active tab, activates its left neighbour (or null if it was
 * the last tab open) — closing the last tab closes the whole pop-up.
 * @param {string[]} tabsBefore
 * @param {string|null} activeTab
 * @param {string} id  the tab being closed
 * @returns {{ tabs: string[], activeTab: string|null }}
 */
export function removeTab(tabsBefore, activeTab, id) {
  const idx = tabsBefore.indexOf(id)
  if (idx === -1) return { tabs: tabsBefore, activeTab }
  const tabs = tabsBefore.filter(t => t !== id)
  if (activeTab !== id) return { tabs, activeTab }
  const nextActive = tabs.length === 0 ? null : tabs[Math.max(0, idx - 1)]
  return { tabs, activeTab: nextActive }
}
