// Market filter panel (1b Slice vi) — the expandable grid card under the filter bar. Re-skinned
// in the dp token language from the Explorer's FilterSidebar/RangeSlider/MultiSelect
// (PlayersTab.jsx:1552-1616) rather than reused — that component is styled with the old
// --color-* family and shared with /players (see Market.jsx's header comment / task file §0).
// Presentational + view-local open/close only; filter VALUES live in Market.jsx and flow down
// as props, so this file owns no filter state of its own.

import { useState } from 'react'
import { DEFAULT_MARKET_FILTERS, DYNASTY_GROUP_MAP, NFL_TEAMS, MAX_PROJECTED_GAMES } from '../../utils/marketFilters'

const AVAILABILITY_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'myRoster', label: 'My roster' },
  { value: 'available', label: 'Available' },
  { value: 'nflFreeAgent', label: 'NFL free agent' },
]

const MARKET_SIGNAL_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'undervalued', label: 'Undervalued' },
  { value: 'overvalued', label: 'Overvalued' },
]

// Shared 13px round handle, both browser engines — the design's "13px round #e6e8eb handles".
const THUMB_CLS =
  '[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:pointer-events-auto ' +
  '[&::-webkit-slider-thumb]:w-[13px] [&::-webkit-slider-thumb]:h-[13px] [&::-webkit-slider-thumb]:rounded-full ' +
  '[&::-webkit-slider-thumb]:bg-[#e6e8eb] [&::-webkit-slider-thumb]:cursor-pointer ' +
  '[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:w-[13px] [&::-moz-range-thumb]:h-[13px] ' +
  '[&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#e6e8eb] [&::-moz-range-thumb]:border-0 ' +
  '[&::-moz-range-thumb]:cursor-pointer'

function GroupLabel({ children }) {
  return <div className="font-dp-mono text-[10px] uppercase tracking-[0.08em] text-dp-muted">{children}</div>
}

function Checkbox({ checked, onChange, label }) {
  return (
    <label className="flex items-center gap-2 text-xs text-dp-text-2 cursor-pointer">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="sr-only" />
      <span
        aria-hidden="true"
        className={`w-[13px] h-[13px] rounded-[4px] border shrink-0 ${
          checked ? 'bg-dp-up border-dp-up' : 'border-dp-border-raised bg-transparent'
        }`}
      />
      {label}
    </label>
  )
}

// Dual-handle range — two overlapping native <input type="range"> with a shared fill bar drawn
// beneath them (a standard dual-slider trick: transparent tracks, pointer-events only on the
// thumbs). Bounds are load-bearing: `min`/`max` MUST equal DEFAULT_MARKET_FILTERS' pair for this
// key, or the sentinel-gated predicate's "off" state becomes unreachable by dragging (§4).
function RangeSlider({ label, min, max, step = 1, value, onChange, unit = '' }) {
  const [lo, hi] = value
  const span = max - min || 1
  const loPct = ((lo - min) / span) * 100
  const hiPct = ((hi - min) / span) * 100
  const setLo = v => onChange([Math.min(Number(v), hi), hi])
  const setHi = v => onChange([lo, Math.max(Number(v), lo)])

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-dp-muted">{label}</span>
        <span className="text-xs tabular-nums text-dp-text-2 font-dp-mono">{lo}–{hi}{unit && ` ${unit}`}</span>
      </div>
      <div className="relative h-[13px] flex items-center">
        <div className="absolute inset-x-0 h-[5px] rounded-full bg-dp-border-row" />
        <div className="absolute h-[5px] rounded-full bg-dp-up" style={{ left: `${loPct}%`, right: `${100 - hiPct}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={lo} onChange={e => setLo(e.target.value)}
          aria-label={`${label} minimum`}
          className={`absolute inset-0 w-full h-[13px] bg-transparent appearance-none pointer-events-none ${THUMB_CLS}`}
        />
        <input
          type="range" min={min} max={max} step={step} value={hi} onChange={e => setHi(e.target.value)}
          aria-label={`${label} maximum`}
          className={`absolute inset-0 w-full h-[13px] bg-transparent appearance-none pointer-events-none ${THUMB_CLS}`}
        />
      </div>
    </div>
  )
}

// Single-value slider for Min projected games — mono number + 5px meter, per the design.
function SingleSlider({ label, min, max, step = 1, value, onChange }) {
  const pct = ((value - min) / (max - min || 1)) * 100
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs text-dp-muted">{label}</span>
      <div className="font-dp-mono text-[18px] text-dp-text">{value}</div>
      <div className="relative h-[13px] flex items-center">
        <div className="absolute inset-x-0 h-[5px] rounded-full bg-dp-border-row" />
        <div className="absolute h-[5px] rounded-full bg-dp-up" style={{ width: `${pct}%` }} />
        <input
          type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))}
          aria-label={label}
          className={`absolute inset-0 w-full h-[13px] bg-transparent appearance-none pointer-events-none ${THUMB_CLS}`}
        />
      </div>
    </div>
  )
}

// Matches Market's own column-set switch styling rather than inventing a radio style (§4).
function SegmentedControl({ options, value, onChange }) {
  return (
    <div className="flex items-center gap-1 bg-dp-chip rounded-lg p-[3px] flex-wrap w-fit">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`px-2.5 py-1 rounded-md text-xs transition-colors whitespace-nowrap ${
            value === opt.value ? 'bg-dp-card text-dp-text font-semibold' : 'text-dp-text-4'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

// Re-skin of the Explorer's MultiSelect (PlayersTab.jsx:1572-1616) — a filter-local text search
// over a fixed option list, distinct from the global player search deferred to slice vii.
function MultiSelect({ label, placeholder, options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()))
  const toggle = opt => onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt])

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <span className="text-dp-muted">{label}</span>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-left border border-dp-border rounded-md px-2 py-1.5 bg-dp-card-quiet text-dp-text-2 flex items-center justify-between"
      >
        <span className="truncate text-dp-muted">{value.length === 0 ? placeholder : `${value.length} selected`}</span>
        <span className="text-dp-muted text-[10px] shrink-0">{open ? '▲' : '▼'}</span>
      </button>
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map(v => (
            <button
              key={v} type="button" onClick={() => toggle(v)}
              className="text-[10px] px-1.5 py-0.5 rounded-full bg-dp-up-bg text-dp-up-text border border-dp-up-border"
            >
              {v} ×
            </button>
          ))}
        </div>
      )}
      {open && (
        <div className="border border-dp-border rounded-md bg-dp-card-quiet max-h-40 overflow-y-auto">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
            className="w-full px-2 py-1.5 border-b border-dp-border text-xs bg-transparent text-dp-text-2 focus:outline-none"
          />
          <div className="py-1">
            {filtered.length === 0 && <div className="px-2 py-1 text-dp-muted text-[11px]">No matches</div>}
            {filtered.map(opt => (
              <label key={opt} className="flex items-center gap-2 px-2 py-1 hover:bg-dp-chip cursor-pointer text-dp-text-2">
                <input type="checkbox" checked={value.includes(opt)} onChange={() => toggle(opt)} />
                <span className="truncate">{opt}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function FilterPanel({ filters, onFiltersChange, onApply, onReset, filteredCount, fantasyTeamOptions }) {
  const update = patch => onFiltersChange({ ...filters, ...patch })

  return (
    <div className="bg-dp-card border border-dp-border rounded-[10px] p-[18px_20px] grid grid-cols-4 gap-x-[26px] gap-y-[22px]">
      <div className="flex flex-col gap-2.5">
        <GroupLabel>Player</GroupLabel>
        <Checkbox checked={filters.startersOnly} onChange={v => update({ startersOnly: v })} label="Starters only" />
        <Checkbox checked={filters.rookiesOnly} onChange={v => update({ rookiesOnly: v })} label="Rookies only" />
        <RangeSlider
          label="Age" min={DEFAULT_MARKET_FILTERS.ageRange[0]} max={DEFAULT_MARKET_FILTERS.ageRange[1]} step={1}
          value={filters.ageRange} onChange={v => update({ ageRange: v })}
        />
        <RangeSlider
          label="Experience" min={DEFAULT_MARKET_FILTERS.expRange[0]} max={DEFAULT_MARKET_FILTERS.expRange[1]} step={1}
          value={filters.expRange} onChange={v => update({ expRange: v })} unit="yrs"
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <GroupLabel>Availability</GroupLabel>
        <SegmentedControl options={AVAILABILITY_OPTIONS} value={filters.availability} onChange={v => update({ availability: v })} />
      </div>

      <div className="flex flex-col gap-2.5">
        <GroupLabel>Team</GroupLabel>
        <MultiSelect
          label="NFL team" placeholder="All NFL teams" options={NFL_TEAMS}
          value={filters.nflTeams} onChange={v => update({ nflTeams: v })}
        />
        <MultiSelect
          label="Fantasy team" placeholder="All fantasy teams" options={fantasyTeamOptions ?? []}
          value={filters.fantasyTeams} onChange={v => update({ fantasyTeams: v })}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <GroupLabel>Dynasty</GroupLabel>
        <div className="flex flex-wrap gap-1">
          {Object.keys(DYNASTY_GROUP_MAP).map(g => {
            const selected = filters.dynastyGroups.includes(g)
            return (
              <button
                key={g} type="button"
                onClick={() => update({
                  dynastyGroups: selected
                    ? filters.dynastyGroups.filter(x => x !== g)
                    : [...filters.dynastyGroups, g],
                })}
                className={`text-xs px-2 py-1 rounded-full transition-colors ${
                  selected ? 'bg-dp-up-bg text-dp-up-text border border-dp-up-border' : 'bg-dp-chip text-dp-text-4 border border-transparent'
                }`}
              >
                {g}
              </button>
            )
          })}
        </div>
        <SegmentedControl options={MARKET_SIGNAL_OPTIONS} value={filters.marketSignal} onChange={v => update({ marketSignal: v })} />
        <RangeSlider
          label="KTC" min={DEFAULT_MARKET_FILTERS.ktcRange[0]} max={DEFAULT_MARKET_FILTERS.ktcRange[1]} step={1}
          value={filters.ktcRange} onChange={v => update({ ktcRange: v })}
        />
      </div>

      <div className="flex flex-col gap-2.5">
        <GroupLabel>Projection</GroupLabel>
        <SingleSlider
          label="Min projected games" min={0} max={MAX_PROJECTED_GAMES} step={1}
          value={filters.minProjectedGames} onChange={v => update({ minProjectedGames: v })}
        />
      </div>

      <div className="col-start-4 flex items-end justify-end gap-2">
        <button
          type="button" onClick={onReset}
          className="px-3 py-1.5 rounded-md text-xs border border-dp-border text-dp-text-4 hover:bg-dp-chip"
        >
          Reset
        </button>
        <button
          type="button" onClick={onApply}
          className="px-3 py-1.5 rounded-md text-xs bg-dp-up text-dp-canvas font-semibold"
        >
          Apply · {filteredCount} players
        </button>
      </div>
    </div>
  )
}
