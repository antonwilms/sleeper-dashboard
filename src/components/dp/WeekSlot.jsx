// Brief items 2–3 — one week's slot, shared by dp/WeeklyStrip (points) and LineupTable's
// usage mini-bars (shares), so both strips draw the same mark for the same weeklySeasonGrid.js kind.
// Every slot stands on a 1px baseline segment; only a played week rises above it. View-only.
import { VoidBar } from './SeriesBars'

export const WEEK_SLOT_GAP = 1

export function WeekSlot({ kind, width, trackH, barHeight = null, barClassName = '', barStyle = null, ...attrs }) {
  let mark = null
  let solid = false
  if (kind === 'played') {
    if (Number.isFinite(barHeight)) {
      mark = <div data-slot-mark="bar" className={`rounded-t-[1px] ${barClassName}`} style={{ width, height: barHeight, ...barStyle }} />
      solid = true
    }
  } else if (kind === 'dnp') {
    mark = (
      <svg data-slot-mark="dnp" aria-hidden="true" width={width} height={width} viewBox="0 0 5 5" style={{ display: 'block' }}>
        <path d="M1 1L4 4M4 1L1 4" stroke="var(--color-dp-missed)" strokeWidth="1.25" strokeLinecap="round" fill="none" />
      </svg>
    )
    solid = true
  } else if (kind === 'bye') {
    mark = <div data-slot-mark="bye" className="bg-dp-bye-hatch" style={{ width, height: width }} />
    solid = true
  }
  return (
    <div {...attrs} style={{ width, height: trackH + 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      {mark}
      {solid
        ? <div data-slot-base="solid" className="bg-dp-border-row" style={{ width, height: 1 }} />
        : <div data-slot-base="void"><VoidBar width={width} /></div>}
    </div>
  )
}
