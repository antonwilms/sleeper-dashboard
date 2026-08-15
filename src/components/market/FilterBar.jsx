// Market filter bar (1b Slice vi) — active-filter pills + "+ Add filter" + "Reset all", plus the
// FilterPanel it toggles. Rendered by Market.jsx and passed into MarketTable's `filterBar`
// render-prop, landing in the SAME flex row as the position pills (dp/MarketTable.jsx) — this is
// the resolution to an earlier draft's impossible "beside MarketTable" placement (task file §0/§12).
// The panel itself is a `w-full` child of that same flex-wrap row, which is what pushes it onto
// its own line below the pills/pills-bar instead of requiring a second render slot.
//
// Owns only the panel's open/closed UI state — filter VALUES live in Market.jsx (view-local,
// like columnSet) and flow down as `filters`/`onFiltersChange`.

import { useState } from 'react'
import { DEFAULT_MARKET_FILTERS } from '../../utils/marketFilters'
import { FilterPanel } from './FilterPanel'

const AVAILABILITY_LABELS = { myRoster: 'My roster', available: 'Available', nflFreeAgent: 'NFL free agent' }

function buildPills(f) {
  const d = DEFAULT_MARKET_FILTERS
  const pills = []
  if (f.startersOnly) pills.push({ key: 'startersOnly', label: 'Starters only' })
  if (f.rookiesOnly) pills.push({ key: 'rookiesOnly', label: 'Rookies only' })
  if (f.ageRange[0] !== d.ageRange[0] || f.ageRange[1] !== d.ageRange[1]) {
    pills.push({ key: 'ageRange', label: `Age ${f.ageRange[0]}–${f.ageRange[1]}` })
  }
  if (f.expRange[0] !== d.expRange[0] || f.expRange[1] !== d.expRange[1]) {
    pills.push({ key: 'expRange', label: `Exp ${f.expRange[0]}–${f.expRange[1]}` })
  }
  if (f.availability !== 'all') {
    pills.push({ key: 'availability', label: AVAILABILITY_LABELS[f.availability] ?? f.availability })
  }
  if (f.nflTeams.length > 0) {
    pills.push({ key: 'nflTeams', label: `NFL team${f.nflTeams.length > 1 ? 's' : ''} (${f.nflTeams.length})` })
  }
  if (f.fantasyTeams.length > 0) {
    pills.push({ key: 'fantasyTeams', label: `Fantasy team${f.fantasyTeams.length > 1 ? 's' : ''} (${f.fantasyTeams.length})` })
  }
  if (f.dynastyGroups.length > 0) {
    pills.push({ key: 'dynastyGroups', label: `Dynasty (${f.dynastyGroups.length})` })
  }
  if (f.marketSignal !== 'all') {
    pills.push({ key: 'marketSignal', label: f.marketSignal === 'undervalued' ? 'Undervalued' : 'Overvalued' })
  }
  if (f.ktcRange[0] !== d.ktcRange[0] || f.ktcRange[1] !== d.ktcRange[1]) {
    pills.push({ key: 'ktcRange', label: `KTC ${f.ktcRange[0]}–${f.ktcRange[1]}` })
  }
  if (f.minProjectedGames > 0) {
    pills.push({ key: 'minProjectedGames', label: `Min ${f.minProjectedGames} games` })
  }
  return pills
}

export function FilterBar({ filters, onFiltersChange, filteredCount, fantasyTeamOptions }) {
  const [open, setOpen] = useState(false)
  const pills = buildPills(filters)

  const clearOne = key => onFiltersChange({ ...filters, [key]: DEFAULT_MARKET_FILTERS[key] })
  const resetAll = () => onFiltersChange(DEFAULT_MARKET_FILTERS)

  return (
    <>
      {pills.map(p => (
        <span
          key={p.key}
          className="inline-flex items-center gap-1.5 rounded-full px-[11px] py-[5px] text-xs bg-dp-up-bg text-dp-up-text border border-dp-up-border"
        >
          {p.label}
          <button type="button" onClick={() => clearOne(p.key)} aria-label={`Clear ${p.label}`} className="leading-none hover:opacity-70">
            ×
          </button>
        </span>
      ))}

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`rounded-full px-[11px] py-[5px] text-xs border transition-colors ${
          open ? 'bg-dp-up-bg text-dp-up-text border-dp-up-border' : 'border-dashed border-dp-border-raised text-dp-muted'
        }`}
      >
        + Add filter
      </button>

      {pills.length > 0 && (
        <button type="button" onClick={resetAll} className="ml-auto text-xs text-dp-muted hover:text-dp-text-2">
          Reset all
        </button>
      )}

      {open && (
        <div className="w-full">
          <FilterPanel
            filters={filters}
            onFiltersChange={onFiltersChange}
            onApply={() => setOpen(false)}
            onReset={() => { resetAll(); setOpen(false) }}
            filteredCount={filteredCount}
            fantasyTeamOptions={fantasyTeamOptions}
          />
        </div>
      )}
    </>
  )
}
