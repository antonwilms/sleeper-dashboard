// Portfolio Slice C — "Weakest slots, in points". Renders `buildWeakestSlots` output (Slice A,
// src/utils/lineup.js) unsliced; this component owns the row cap and the computed summary
// sentence over the rendered rows only. View-layer only — no lineup recomputation.
import { slotLabel } from './slotLabel'

const WEAKEST_ROW_LIMIT = 4

const POS_NOUN = {
  QB: ['quarterback', 'quarterbacks'], RB: ['running back', 'running backs'],
  WR: ['wide receiver', 'wide receivers'], TE: ['tight end', 'tight ends'],
}
const COUNT_WORD = ['zero', 'one', 'two', 'three', 'four']

const f1 = v => v.toFixed(1)

// Build the row labels once from `slots`: base = slotLabel(slot type); if that slot TYPE occurs
// more than once, append the 1-based occurrence number among slots of that same type.
function buildLabels(slots) {
  const typeCounts = new Map()
  for (const s of slots) typeCounts.set(s.slot, (typeCounts.get(s.slot) ?? 0) + 1)
  const seenSoFar = new Map()
  return slots.map(s => {
    const base = slotLabel(s.slot)
    const total = typeCounts.get(s.slot) ?? 0
    if (total <= 1) return base
    const occurrence = (seenSoFar.get(s.slot) ?? 0) + 1
    seenSoFar.set(s.slot, occurrence)
    return `${base}${occurrence}`
  })
}

function summaryText(rendered, slots) {
  if (slots.length === 0) return 'No starting lineup — league slots or roster not loaded.'
  if (rendered.length === 0) return 'No starting slot is losing points to a median lineup.'

  const total = rendered.reduce((sum, r) => sum + r.loss, 0)
  if (Math.round(total) < 1) return 'No starting slot costs you as much as a point a week against a median lineup.'

  const threshold = 0.6 * total
  let cumulative = 0
  let cutoff = rendered.length
  for (let i = 0; i < rendered.length; i++) {
    cumulative += rendered[i].loss
    if (cumulative >= threshold) { cutoff = i + 1; break }
  }
  const P = rendered.slice(0, cutoff)
  const R = rendered.slice(cutoff)

  // Group P by position, first-appearance order.
  const order = []
  const counts = new Map()
  for (const r of P) {
    if (!counts.has(r.position)) order.push(r.position)
    counts.set(r.position, (counts.get(r.position) ?? 0) + 1)
  }

  const groupPhrases = order.map((pos, idx) => {
    const n = counts.get(pos)
    const countWord = COUNT_WORD[n] ?? String(n)
    const word = idx === 0 ? countWord.charAt(0).toUpperCase() + countWord.slice(1) : countWord
    const noun = POS_NOUN[pos]
      ? POS_NOUN[pos][n === 1 ? 0 : 1]
      : `${pos} slot${n === 1 ? '' : 's'}`
    return `${word} ${noun}`
  })
  const groups = groupPhrases.join(' and ')

  const cost = Math.round(P.reduce((sum, r) => sum + r.loss, 0))
  const verb = P.length === 1 ? 'costs' : 'cost'
  const unit = cost === 1 ? 'point' : 'points'

  let text = `${groups} ${verb} you about ${cost} ${unit} a week against a median lineup.`

  if (R.length > 0) {
    const maxLoss = Math.max(...R.map(r => r.loss))
    if (maxLoss < 3) {
      text += ' Everything else is within a field goal.'
    } else {
      const rest = Math.round(R.reduce((sum, r) => sum + r.loss, 0))
      text += ` The rest adds another ${rest} points a week.`
    }
  }

  return text
}

export function WeakestSlots({ rows = [], slots = [] }) {
  const rendered = rows.slice(0, WEAKEST_ROW_LIMIT)
  const labels = buildLabels(slots)
  const labelFor = row => (row.slotIndex >= 0 && row.slotIndex < labels.length ? labels[row.slotIndex] : slotLabel(row.slot))

  const scaleMax = Math.max(...rendered.map(r => r.median), 0)
  const pct = v => (scaleMax > 0 ? Math.max(0, Math.min(100, (v / scaleMax) * 100)) : 0)

  return (
    <div data-testid="weakest-slots" className="bg-dp-card border border-dp-border rounded-[10px] px-[18px] pt-3.5 pb-3">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="text-[13px] font-semibold text-dp-text-strong">Weakest slots, in points</span>
        <span className="text-[11.5px] text-dp-muted">vs the median starter at that slot</span>
      </div>

      {rendered.map(row => {
        const mineW = pct(row.mine)
        const lossW = Math.min(pct(row.loss), 100 - mineW)
        return (
          <div
            key={row.slotIndex}
            data-testid={`weak-row-${row.slotIndex}`}
            className="grid grid-cols-[34px_minmax(0,1fr)_110px] gap-2.5 items-center py-[9px] border-t border-dp-border-row"
          >
            <span className="font-dp-mono text-[11px] font-semibold text-dp-text">{labelFor(row)}</span>
            <div className="min-w-0">
              <div className="text-xs text-dp-text-2 truncate">
                {row.name == null ? <span className="text-dp-muted">—</span> : row.name}
              </div>
              <div className="relative h-2 mt-[5px]">
                <span className="absolute left-0 top-px h-1.5 rounded-[2px] bg-dp-slate" style={{ width: `${mineW}%` }} />
                <span
                  className="absolute top-px h-1.5 rounded-r-[2px] bg-dp-down opacity-85"
                  style={{ left: `${mineW}%`, width: `${lossW}%` }}
                />
              </div>
            </div>
            <div className="text-right">
              <div className="font-dp-mono text-xs font-semibold text-dp-down-text">−{f1(row.loss)} ppg</div>
              <div className="font-dp-mono text-[10px] text-dp-muted">{f1(row.mine)} vs med {f1(row.median)}</div>
            </div>
          </div>
        )
      })}

      <p data-testid="weak-summary" className="text-[11px] text-dp-muted leading-normal mt-2 pt-2.5 border-t border-dp-border-row [text-wrap:pretty]">
        {summaryText(rendered, slots)}
      </p>
    </div>
  )
}
