// View-only helper for LensSwitch (./cells.jsx): the class for a cell in column-view `group` while
// `lens` is active. `null` group = a fixed column, never hidden. Inactive groups get Tailwind's
// `hidden` — the cell stays mounted, so no data leaves the page and cell counts stay stable.
export function lensHidden(group, lens) {
  return group == null || group === lens ? '' : 'hidden'
}
