// Brief items 2–3 — one week's slot, shared by dp/WeeklyStrip (points) and LineupTable's
// usage mini-bars (shares), so both strips draw the same mark for the same weeklySeasonGrid.js kind.
// Every slot stands on a 1px baseline; only a played week rises above it, and a bye (hollow
// circle) or did-not-play (red ×) sits just below it. View-only.
import { VoidBar } from './SeriesBars'

export const WEEK_SLOT_GAP = 1

// bar area (trackH) + base (1) + gap (1) + below area (width).
// eslint-disable-next-line react-refresh/only-export-components -- pure sizing helper the spec places beside the slot it sizes
export function weekSlotHeight(trackH, width) { return trackH + 1 + 1 + width }

export function WeekSlot({ kind, width, trackH, barHeight = null, barClassName = '', barStyle = null, ...attrs }) {
  let barMark = null
  let belowMark = null
  let solid = false
  if (kind === 'played') {
    if (Number.isFinite(barHeight)) {
      barMark = <div data-slot-mark="bar" className={`rounded-t-[1px] ${barClassName}`} style={{ width, height: barHeight, ...barStyle }} />
      solid = true
    }
  } else if (kind === 'dnp') {
    belowMark = (
      <svg data-slot-mark="dnp" aria-hidden="true" width={width} height={width} viewBox="0 0 5 5" style={{ display: 'block' }}>
        <path d="M1 1L4 4M4 1L1 4" stroke="var(--color-dp-missed)" strokeWidth="1.25" strokeLinecap="round" fill="none" />
      </svg>
    )
    solid = true
  } else if (kind === 'bye') {
    belowMark = (
      <svg data-slot-mark="bye" aria-hidden="true" width={width} height={width} viewBox="0 0 5 5" style={{ display: 'block' }}>
        <circle cx="2.5" cy="2.5" r="1.75" fill="none" stroke="var(--color-dp-muted-2)" strokeWidth="1" />
      </svg>
    )
    solid = true
  }
  return (
    <div {...attrs} style={{ width, height: weekSlotHeight(trackH, width), display: 'flex', flexDirection: 'column' }}>
      <div data-slot-area="bar" style={{ height: trackH, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
        {barMark}
      </div>
      {solid
        ? <div data-slot-base="solid" className="bg-dp-border-row" style={{ width, height: 1 }} />
        : <div data-slot-base="void"><VoidBar width={width} /></div>}
      <div data-slot-area="below" style={{ marginTop: 1, height: width }}>
        {belowMark}
      </div>
    </div>
  )
}
