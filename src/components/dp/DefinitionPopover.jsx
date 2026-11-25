import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CoveragePips } from './CoveragePips'

// dp-v2 Slice 1. Click, never hover — a hover-only trigger fails touch and keyboard both.
// Only one popover open at a time is owned with local state per instance plus a click-outside
// handler; no context/provider — this repo keeps view-local state view-local.
// strategy="fixed" positions the panel against the viewport for callers inside a clipping scroll container;
// it stays a DOM descendant of the trigger's wrapper so `:has()` lifts and descendant overrides keep working.
const GAP = 4, EDGE = 8, POPOVER_W = 256 // POPOVER_W = w-64

export function DefinitionPopover({ term, scope, gloss, percentiles, band, span, field, strategy = 'absolute', children }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef(null)
  const popoverRef = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKeyDown)
    // A fixed panel would stay put while its trigger scrolls away; scroll does not bubble, so capture.
    if (strategy === 'fixed') {
      document.addEventListener('scroll', close, true)
      window.addEventListener('resize', close)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open, strategy])

  // position: fixed escapes FrozenScroll's overflow clip; see .claude/tasks/usage-card-polish.md §0.3–0.4
  useLayoutEffect(() => {
    if (!open || strategy !== 'fixed') return
    const el = popoverRef.current, trigger = triggerRef.current
    if (!el || !trigger) return
    const r = trigger.getBoundingClientRect()
    const h = el.getBoundingClientRect().height
    const below = r.bottom + GAP
    const above = r.top - GAP - h
    const top = below + h > window.innerHeight - EDGE && above >= EDGE ? above : below
    const left = Math.max(EDGE, Math.min(r.left, window.innerWidth - POPOVER_W - EDGE))
    el.style.top = `${top}px`
    el.style.left = `${left}px`
  }, [open, strategy])

  // percentiles: { p10, p50, p90, subject } — the league 10th/50th/90th plus the subject's own
  // percentile. No colour, no verdict: further right is good for a receiver and bad for a
  // runner, so the strip must not editorialise.
  const { p10, p50, p90, subject: subjectPct } = percentiles ?? {}

  return (
    <span className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(o => !o)}
        className="border-b border-dotted border-dp-muted text-inherit bg-transparent p-0 cursor-pointer"
      >
        {children}
      </button>
      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          className={strategy === 'fixed'
            ? 'fixed z-20 w-64 bg-dp-card border border-dp-border rounded-[12px] p-3 shadow-lg'
            : 'absolute z-20 mt-1 w-64 bg-dp-card border border-dp-border rounded-[12px] p-3 shadow-lg'}
        >
          <div className="text-dp-text font-semibold text-[12px]">
            {term}{scope && <span className="text-dp-muted font-normal"> · {scope}</span>}
          </div>
          {gloss && <div className="text-dp-text-3 text-[11px] mt-1">{gloss}</div>}

          {(p10 != null || p50 != null || p90 != null) && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[10px] font-dp-mono text-dp-text-4">
                <span>{p10}</span>
                <span>{p50}</span>
                <span>{p90}</span>
              </div>
              <div className="mt-1 text-dp-text-3 text-[10px]">
                {subjectPct != null && `subject at p${subjectPct}`}
              </div>
              <div className="font-dp-mono text-[9px] tracking-[0.06em] text-dp-muted-3 mt-1">
                LEAGUE 10th → 90th · RAW VALUE, NOT RANK
              </div>
            </div>
          )}

          {(band != null || span != null) && (
            <div className="mt-2 flex items-center gap-1.5">
              <CoveragePips band={band} />
              {span && <span className="text-dp-text-4 text-[10px]">{span}</span>}
            </div>
          )}

          {field && (
            <div className="font-dp-mono text-[10px] text-dp-text-4 mt-2" style={{ wordBreak: 'break-all' }}>
              {field}
            </div>
          )}
        </div>
      )}
    </span>
  )
}
