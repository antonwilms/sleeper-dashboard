import { useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useTooltipsEnabled } from '../context/TooltipContext'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ARROW_PX = 6    // half-diagonal of the rotated arrow square
const GAP_PX   = 3    // space between arrow tip and anchor edge
const MAX_W    = 240  // max tooltip width (px) — for left-edge clamping
const EST_H    = 80   // conservative tooltip height estimate for flip detection

// ---------------------------------------------------------------------------
// Viewport-aware placement
// ---------------------------------------------------------------------------

function resolvePlacement(rect, preferred) {
  switch (preferred) {
    case 'top':
      return rect.top < EST_H + ARROW_PX + GAP_PX ? 'bottom' : 'top'
    case 'bottom':
      return rect.bottom + EST_H + ARROW_PX + GAP_PX > window.innerHeight ? 'top' : 'bottom'
    case 'left':
      return rect.left < MAX_W + ARROW_PX + GAP_PX ? 'right' : 'left'
    case 'right':
      return rect.right + MAX_W + ARROW_PX + GAP_PX > window.innerWidth ? 'left' : 'right'
    default:
      return preferred
  }
}

// ---------------------------------------------------------------------------
// Tooltip bubble (rendered in portal)
// ---------------------------------------------------------------------------

function TooltipBubble({ content, anchorRect, placement }) {
  const cx = anchorRect.left + anchorRect.width  / 2
  const cy = anchorRect.top  + anchorRect.height / 2
  const offset = ARROW_PX + GAP_PX

  // Base tooltip styles
  const style = {
    position:      'fixed',
    zIndex:        9999,
    maxWidth:      MAX_W,
    padding:       '6px 10px',
    background:    '#111827',
    color:         '#f9fafb',
    fontSize:      '11.5px',
    lineHeight:    1.45,
    borderRadius:  4,
    boxShadow:     '0 4px 14px rgba(0,0,0,0.30)',
    pointerEvents: 'none',
    whiteSpace:    'normal',
    wordBreak:     'break-word',
    animation:     'tooltip-fade-in 150ms ease both',
  }

  // Per-placement positioning (using CSS transforms so we don't need to know
  // the rendered tooltip dimensions up front).
  switch (placement) {
    case 'top':
      style.left      = Math.max(8, Math.min(window.innerWidth - MAX_W - 8, cx - MAX_W / 2))
      style.top       = anchorRect.top - offset
      style.transform = 'translateY(-100%)'
      break
    case 'bottom':
      style.left      = Math.max(8, Math.min(window.innerWidth - MAX_W - 8, cx - MAX_W / 2))
      style.top       = anchorRect.bottom + offset
      break
    case 'left':
      style.left      = anchorRect.left - offset
      style.top       = cy
      style.transform = 'translate(-100%, -50%)'
      break
    case 'right':
      style.left      = anchorRect.right + offset
      style.top       = cy
      style.transform = 'translateY(-50%)'
      break
  }

  // Arrow: a small rotated square clipped to a triangle by overflow:hidden
  // on a parent, but simpler: just a rotated square peeking out of the bubble.
  const arrowBase = {
    position:   'absolute',
    width:      ARROW_PX * 2,
    height:     ARROW_PX * 2,
    background: '#111827',
    transform:  'rotate(45deg)',
  }
  const arrowStyle = (() => {
    const half = -ARROW_PX
    switch (placement) {
      case 'top':    return { ...arrowBase, bottom: half, left: '50%', marginLeft: half }
      case 'bottom': return { ...arrowBase, top:    half, left: '50%', marginLeft: half }
      case 'left':   return { ...arrowBase, right:  half, top:  '50%', marginTop:  half }
      case 'right':  return { ...arrowBase, left:   half, top:  '50%', marginTop:  half }
      default:       return arrowBase
    }
  })()

  return (
    <div style={style}>
      <div style={arrowStyle} />
      {content}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Public component
// ---------------------------------------------------------------------------

export default function Tooltip({ content, children, position = 'top', delay = 350 }) {
  const enabled = useTooltipsEnabled()
  const [bubble, setBubble] = useState(null)  // { anchorRect, placement }
  const timerRef = useRef(null)
  const wrapRef  = useRef(null)

  const handleEnter = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      if (!wrapRef.current) return
      const rect      = wrapRef.current.getBoundingClientRect()
      const placement = resolvePlacement(rect, position)
      setBubble({ anchorRect: rect, placement })
    }, delay)
  }, [position, delay])

  const handleLeave = useCallback(() => {
    clearTimeout(timerRef.current)
    setBubble(null)
  }, [])

  // When disabled, render children with no wrapper overhead
  if (!enabled || !content) {
    return <>{children}</>
  }

  return (
    <>
      {/* display:contents avoids adding a box that breaks table/flex layouts */}
      <span
        ref={wrapRef}
        onMouseEnter={handleEnter}
        onMouseLeave={handleLeave}
        style={{ display: 'contents' }}
      >
        {children}
      </span>

      {bubble && createPortal(
        <TooltipBubble
          content={content}
          anchorRect={bubble.anchorRect}
          placement={bubble.placement}
        />,
        document.body
      )}
    </>
  )
}
