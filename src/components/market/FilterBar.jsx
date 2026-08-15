// Market filter bar (1b Slice vi) — active-filter pills + free-text search (Slice vii) +
// "+ Add filter" + saved presets (Slice vii) + "Reset all", plus the FilterPanel it toggles.
// Rendered by Market.jsx and passed into MarketTable's `filterBar` render-prop, landing in the
// SAME flex row as the position pills (dp/MarketTable.jsx) — this is the resolution to an earlier
// draft's impossible "beside MarketTable" placement (task file §0/§12). The panel itself is a
// `w-full` child of that same flex-wrap row, which is what pushes it onto its own line below the
// pills/pills-bar instead of requiring a second render slot.
//
// Owns the panel's open/closed UI state AND the presets list (Slice vii §3/§5.1) — both ephemeral
// chrome/view state with this component as the single consumer, same precedent as Market.jsx's
// filters/columnSet. Filter VALUES themselves live in Market.jsx and flow down as
// `filters`/`onFiltersChange`; presets are a *separate* localStorage-backed list this file owns
// end to end (load/filter-on-mount/save/apply/delete), since nothing else needs it.

import { useEffect, useRef, useState } from 'react'
import { DEFAULT_MARKET_FILTERS, normalizeFilters, isRestorableFilters } from '../../utils/marketFilters'
import { FilterPanel } from './FilterPanel'

const AVAILABILITY_LABELS = { myRoster: 'My roster', available: 'Available', nflFreeAgent: 'NFL free agent' }

// A *new* key (§3) — distinct from the Explorer's `explorer-presets`, whose payloads are
// DEFAULT_FILTER_STATE-shaped (ten keys, no minProjectedGames, no search) and would be silently
// wrong if reused here. Slice viii deletes the Explorer's key with its surface.
const LS_PRESETS = 'market-filter-presets'
const PRESET_CAP = 5

// Strict at mount (§3.1) — a preset failing isRestorableFilters is dropped from the list rather
// than ever being offered for apply, since applying a salvaged version of it would silently mean
// something other than what the user saved under that name.
function loadPresets() {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_PRESETS))
    if (!Array.isArray(raw)) return []
    return raw.filter(p => p && typeof p.name === 'string' && isRestorableFilters(p.state))
  } catch { /* fall through */ }
  return []
}

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
  // search (Slice vii §2) — counts as an active filter for the pills/Reset-all like every other
  // dimension. Whitespace-only is treated as inactive, matching applyMarketFilters/activeFilterCount.
  if (f.search && f.search.trim() !== '') {
    pills.push({ key: 'search', label: `"${f.search.trim()}"` })
  }
  return pills
}

export function FilterBar({ filters, onFiltersChange, filteredCount, fantasyTeamOptions }) {
  const [open, setOpen] = useState(false)
  const pills = buildPills(filters)

  const clearOne = key => onFiltersChange({ ...filters, [key]: DEFAULT_MARKET_FILTERS[key] })
  const resetAll = () => onFiltersChange(DEFAULT_MARKET_FILTERS)

  // ── Presets (Slice vii §3) ──────────────────────────────────────────────────────────────────
  const [presets, setPresets] = useState(loadPresets)
  const [presetsOpen, setPresetsOpen] = useState(false)
  const [presetName, setPresetName] = useState('')
  const presetsRef = useRef(null)

  useEffect(() => {
    if (!presetsOpen) return
    const handler = e => { if (presetsRef.current && !presetsRef.current.contains(e.target)) setPresetsOpen(false) }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [presetsOpen])

  const persistPresets = next => {
    setPresets(next)
    try { localStorage.setItem(LS_PRESETS, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const trimmedName = presetName.trim()
  const nameExists = presets.some(p => p.name === trimmedName)
  // Disable saving only when the list is full AND the typed name is new — the Explorer disables
  // the moment presets.length >= 5 regardless of name, which makes its own name-replace branch
  // unreachable at the cap (§3, §0). Re-saving an existing name must always work.
  const saveDisabled = trimmedName === '' || (presets.length >= PRESET_CAP && !nameExists)

  const handleSavePreset = () => {
    if (saveDisabled) return
    const next = [...presets.filter(p => p.name !== trimmedName), { name: trimmedName, state: filters }].slice(-PRESET_CAP)
    persistPresets(next)
    setPresetName('')
  }
  // normalizeFilters is a no-op for anything already in `presets` (isRestorableFilters guaranteed
  // that at load), but routing apply through it anyway keeps one path — and it's what forces
  // search back to '' regardless of what was saved in the preset's state (§3.1, §2).
  const handleApplyPreset = p => {
    onFiltersChange(normalizeFilters(p.state))
    setPresetsOpen(false)
  }
  const handleDeletePreset = name => persistPresets(presets.filter(p => p.name !== name))

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

      {/* Free-text filter (Slice vii §2) — left of "+ Add filter", worded "Filter" rather than
          "Search" to keep this narrowing control visually/semantically distinct from TopBar's
          global-navigate search (§1's "accepted redundancy" — the two must read as different). */}
      <input
        type="text"
        value={filters.search}
        onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
        placeholder="Filter by name…"
        aria-label="Filter players by name"
        className="w-[150px] rounded-full px-[11px] py-[5px] text-xs bg-dp-card-quiet border border-dp-border text-dp-text-2 placeholder:text-dp-muted focus:outline-none"
      />

      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`rounded-full px-[11px] py-[5px] text-xs border transition-colors ${
          open ? 'bg-dp-up-bg text-dp-up-text border-dp-up-border' : 'border-dashed border-dp-border-raised text-dp-muted'
        }`}
      >
        + Add filter
      </button>

      {/* Presets + Reset all share ONE ml-auto wrapper (§3) — two ml-auto siblings would fight,
          and gating the preset control on pills.length > 0 (Reset all's own condition) would hide
          it whenever presets exist but nothing is currently active. */}
      {(pills.length > 0 || presets.length > 0) && (
        <div className="ml-auto flex items-center gap-2">
          <div className="relative" ref={presetsRef}>
            <button
              type="button"
              onClick={() => setPresetsOpen(o => !o)}
              className={`rounded-full px-[11px] py-[5px] text-xs border transition-colors ${
                presetsOpen ? 'bg-dp-up-bg text-dp-up-text border-dp-up-border' : 'border-dp-border-raised text-dp-muted'
              }`}
            >
              Presets{presets.length > 0 ? ` (${presets.length})` : ''}
            </button>
            {presetsOpen && (
              <div className="absolute right-0 top-[32px] w-[220px] bg-dp-card border border-dp-border-raised rounded-[9px] p-2.5 z-10 shadow-[0_16px_40px_rgba(0,0,0,0.5)] flex flex-col gap-2">
                {presets.length === 0 ? (
                  <p className="text-[11px] text-dp-muted">No saved presets yet.</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {presets.map(p => (
                      <div key={p.name} className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(p)}
                          className="flex-1 min-w-0 truncate text-left text-dp-text-2 hover:text-dp-text"
                        >
                          {p.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeletePreset(p.name)}
                          aria-label={`Delete ${p.name}`}
                          className="shrink-0 text-dp-muted hover:text-dp-down-text"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-1 pt-2 border-t border-dp-border">
                  <input
                    type="text"
                    value={presetName}
                    onChange={e => setPresetName(e.target.value)}
                    placeholder="Preset name"
                    aria-label="Preset name"
                    className="flex-1 min-w-0 rounded px-1.5 py-1 text-xs bg-dp-card-quiet border border-dp-border text-dp-text-2 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSavePreset}
                    disabled={saveDisabled}
                    className="text-xs px-2 py-1 rounded bg-dp-up text-dp-canvas font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>

          {pills.length > 0 && (
            <button type="button" onClick={resetAll} className="text-xs text-dp-muted hover:text-dp-text-2">
              Reset all
            </button>
          )}
        </div>
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
