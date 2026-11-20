// Shared dp-styled presentational cells — moved out of Market.jsx (1b Slice iii) so Portfolio
// (Slice iv) can import them rather than fork them. Pure relocation: every component here is
// byte-identical in behaviour to its pre-move Market.jsx version (DeltaCell is the one exception
// worth naming — it is the delta *div* extracted verbatim from Market's inline Value/NEXT column
// markup, now a named component instead of inline JSX; the rendered output is unchanged).
// PlayerCell is the one shared player cell (W2b-2, .claude/tasks/week-w2b-2-shared-player-cell.md):
// 28/40px photo, abbr-first sub-line, a team-logo watermark behind the cell, and the content slots
// `marker` (after the name), `sub` (sub-line content) and `footer` (lines under the sub-line).

import { PlayerHeadshot, TeamLogo } from './SleeperImages'
import { teamLogoUrl } from '../../utils/sleeperImages'
import { injuryShort } from '../../utils/injuryStatus'

// Sleeper injury designation chip (live display only, never captured). Questionable is outlined
// amber; everything else filled red — severity readable from the label and the fill, not hue alone (W1 D3).
export function StatusChip({ status, bodyPart = null }) {
  const label = injuryShort(status)
  if (label == null) return null
  const severity = status === 'Questionable' ? 'caution' : 'severe'
  return (
    <span
      data-testid="status-flag"
      data-severity={severity}
      title={bodyPart ? `${status} · ${bodyPart}` : status}
      className={`font-dp-mono text-[9.5px] tracking-[0.04em] font-medium rounded px-1.5 py-px ${severity === 'caution' ? 'border border-dp-caution-border text-dp-caution-text' : 'bg-dp-severe-bg text-dp-severe-text'}`}
    >
      {label}
    </span>
  )
}

// Page-title eyebrow (Terminal direction): the small mono section label above a surface's <h1>.
// Presentational only — callers pass the nav group or a breadcrumb; it is not a heading.
export function PageEyebrow({ children }) {
  return (
    <span className="block font-dp-mono text-[11px] tracking-[0.12em] uppercase text-dp-muted mb-1.5">
      {children}
    </span>
  )
}

// Column-view switch (Terminal direction): a wide table keeps its key columns fixed and shows one
// group of the rest at a time. Every column stays in the DOM — `lensHidden(group, lens)` (./lens.js) only adds
// `hidden` to the inactive groups — so no data leaves the page, it is one click away. The state is
// view-local to the caller (a table UI choice, not domain state).
export function LensSwitch({ lenses, value, onChange, label = 'Columns' }) {
  return (
    <div role="group" aria-label={label} className="flex items-center gap-0.5 bg-dp-card-quiet border border-dp-border rounded-[9px] p-[3px] w-fit">
      {lenses.map(l => (
        <button
          key={l.key}
          type="button"
          aria-pressed={value === l.key}
          onClick={() => onChange(l.key)}
          className={`px-3 h-7 rounded-md text-[12px] transition-colors ${
            value === l.key ? 'bg-dp-accent text-dp-on-accent font-semibold' : 'text-dp-text-3 hover:text-dp-text'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

export function SortTh({ label, col, sortKey, sortAsc, onSort, tooltip, align = 'left', className = '' }) {
  const active = sortKey === col
  const inner = <>{label}{active ? (sortAsc ? ' ↑' : ' ↓') : ''}</>
  return (
    <th
      onClick={() => onSort(col)}
      title={tooltip}
      className={`px-3 py-[9px] first:pl-[18px] last:pr-[18px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase cursor-pointer select-none whitespace-nowrap ${
        align === 'right' ? 'text-right' : 'text-left'
      } ${active ? 'text-dp-text' : 'text-dp-muted'}${className ? ` ${className}` : ''}`}
    >
      {inner}
    </th>
  )
}

export const WATERMARK_OPACITY = 0.12
export const WATERMARK_OPACITY_CLASS = 'opacity-[0.12]' // literal — Tailwind must see it

function defaultSub(row) {
  const parts = []
  if (row.age != null) parts.push(row.age)
  if (row.years_exp != null) parts.push(`${row.years_exp}yr`)
  return parts.length ? parts.join(' · ') : null
}

export function PlayerCell({
  row, marker, sub, footer, showPosition = true, photoFromMd = false, className = '',
}) {
  const abbr = row.nfl_team && row.nfl_team !== 'FA' ? row.nfl_team : 'FA'
  const subContent = sub !== undefined ? sub : defaultSub(row)
  return (
    <div data-testid="player-cell" className={`relative flex items-center gap-2.5 min-w-0 ${className}`}>
      {teamLogoUrl(row.nfl_team) != null && (
        <span
          data-testid="team-watermark"
          aria-hidden="true"
          className={`absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none select-none ${WATERMARK_OPACITY_CLASS}`}
        >
          <TeamLogo team={row.nfl_team} size={44} />
        </span>
      )}
      <span className={`relative shrink-0 ${photoFromMd ? 'hidden md:flex' : 'flex'}`}>
        <PlayerHeadshot playerId={row.player_id} size={40} sizeClass="size-7 md:size-10" />
      </span>
      {showPosition && (
        <span data-testid="player-cell-pos" className="relative font-dp-mono text-[10px] w-[26px] text-center py-0.5 rounded bg-dp-chip text-dp-text-3 shrink-0">
          {row.position}
        </span>
      )}
      <div className="relative min-w-0 flex-1">
        {/* The marker's popover must not sit inside the truncating (overflow-hidden) name span. */}
        <div data-testid="player-cell-name" className="text-[13px] font-semibold text-dp-text flex items-center min-w-0 whitespace-nowrap">
          <span className="truncate">{row.full_name}</span>
          {marker}
        </div>
        <div data-testid="player-cell-sub" className="text-[11px] leading-snug text-dp-text-4">
          <span data-testid="player-cell-team">{abbr}</span>
          {subContent != null && <> · {subContent}</>}
        </div>
        {footer}
      </div>
    </div>
  )
}

export function ClickableRow({ row, onOpen, children }) {
  return (
    <tr
      role="button"
      tabIndex={0}
      onClick={() => onOpen(row.player_id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(row.player_id)
        }
      }}
      className="group/row border-t border-dp-border-row cursor-pointer hover:bg-dp-row-self focus:outline-none focus:bg-dp-row-self"
    >
      {children}
    </tr>
  )
}

// 5-wide career sparkline, dp-styled — a fresh build, never shared with the Explorer's
// old-tokens CareerSparkline (deleted with that surface in 1b Slice viii). Do not respec these
// dimensions per-caller — Slice iv's task file is explicit that Portfolio reuses this unchanged.
//
// The normalisation rule (dp-v2 Slice 1 — see the matching comment in SeriesBars.jsx):
// CareerBars is zero-based (max over positives; a 0.0 season must look like nothing but still
// stay visible as a stub). SeriesBars/TrendCell are min–max normalised instead — a value series
// like 9781 → 9989 is flat under zero-based scaling, so only min–max shows its movement. Never
// render a value series with CareerBars, and never render a PPG series with SeriesBars/TrendCell
// in 'scaled' mode without a stated domain.
//
// Void slots (dp-v2 Slice 1): `values` may hold `null` for "no season here" (produced by
// App.jsx's careerSparkline memo). Only Number.isFinite(v) counts as measured — NaN/undefined
// are void too, never a measured zero.
export function CareerBars({ values }) {
  const BAR_W = 6, GAP = 2, H = 22
  const vals = values ?? []
  const max = Math.max(...vals.filter(v => Number.isFinite(v) && v > 0), 1)
  return (
    <div className="flex items-end" style={{ gap: GAP, height: H }}>
      {vals.map((v, i) => {
        const isLast = i === vals.length - 1
        if (!Number.isFinite(v)) {
          // Void slot — no fill, a dashed marker at the baseline, never a filled stub.
          return (
            <div
              key={i}
              style={{ width: BAR_W, height: 0, borderTop: '1px dashed var(--color-dp-slate-2)' }}
            />
          )
        }
        const barH = v > 0 ? Math.max(3, Math.round((v / max) * H)) : 2
        return (
          <div
            key={i}
            style={{ width: BAR_W, height: barH }}
            className={`rounded-[1px] ${isLast ? 'bg-dp-up' : 'bg-dp-slate'}`}
          />
        )
      })}
    </div>
  )
}

// Extracted verbatim from Market.jsx's Value/NEXT column (the second, delta line beneath the
// projected-value line). Market wraps this beneath a value line; Portfolio's PROJ Δ column uses
// it standalone as the entire cell content.
export function DeltaCell({ delta }) {
  return (
    <div className={`font-dp-mono text-[11px] ${delta == null ? 'text-dp-muted' : delta > 0 ? 'text-dp-up-text' : delta < 0 ? 'text-dp-down-text' : 'text-dp-muted'}`}>
      {delta == null ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`}
    </div>
  )
}
