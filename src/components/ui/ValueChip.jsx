/*
 * ValueChip — pure presentational dynasty-value chip.
 * No context reads, no fetching, no state. Props in, render out.
 * Computes nothing from the data layer — only formats/normalizes props it is handed.
 *
 * Caller row-field mapping (slice 3 / peek wire this):
 *   <ValueChip
 *     value={row.dynastyScore?.score ?? null}
 *     marketDelta={{
 *       signal:  row.divergenceSignal ?? null,
 *       pct:     row.divergencePct   ?? null,
 *       dynRank: row.dynRank         ?? null,
 *       ktcRank: row.ktcRank         ?? null,
 *     }}
 *     confidence={row.dynastyScore?.confidence ?? null}
 *     ktcValue={row.ktcValue ?? null}
 *     position={row.position}
 *   />
 *
 * Confidence source: pass row.dynastyScore.confidence when pairing with the dynasty score
 * (default); pass row.projectionConfidence when pairing with projectedPPG (peek). Both
 * vocabularies are unified by normalizeConfidence.
 *
 * marketDelta shape: { signal: 'undervalued'|'overvalued'|null, pct: Number|null,
 *   dynRank: Number|null, ktcRank: Number|null }
 */

// eslint-disable-next-line react-refresh/only-export-components
export function normalizeConfidence(c) {
  switch (c) {
    case 'high':     return 'high'
    case 'medium':   return 'medium'
    case 'moderate': return 'medium'   // dynastyScore vocab → canonical
    case 'low':      return 'low'
    case 'rookie':   return 'rookie'
    case 'prospect': return 'rookie'   // dynastyScore vocab → canonical
    case 'none':     return null
    default:         return null       // null / undefined / unknown → null
  }
}

const CONFIDENCE_COLOR = {
  high:   'text-confidence-high',
  medium: 'text-confidence-medium',
  low:    'text-confidence-low',
  rookie: 'text-confidence-rookie',
}

const CONFIDENCE_LABEL = {
  high:   'High',
  medium: 'Med',
  low:    'Low',
  rookie: 'Rookie',
}

function DeltaPill({ marketDelta, position }) {
  if (!marketDelta) return null
  const { signal, pct, dynRank, ktcRank } = marketDelta

  if (signal === 'undervalued') {
    const rankCtx = `${position}${dynRank} vs market ${position}${ktcRank}`
    return (
      <span
        className="inline-flex items-center gap-0.5 text-market-up bg-market-up-bg rounded-pill px-1.5 py-0.5 text-xs font-medium tabular-nums"
        aria-label={rankCtx}
        title={rankCtx}
      >
        ▲ +{Math.round(pct)}%
      </span>
    )
  }

  if (signal === 'overvalued') {
    const rankCtx = `${position}${dynRank} vs market ${position}${ktcRank}`
    return (
      <span
        className="inline-flex items-center gap-0.5 text-market-down bg-market-down-bg rounded-pill px-1.5 py-0.5 text-xs font-medium tabular-nums"
        aria-label={rankCtx}
        title={rankCtx}
      >
        ▼ {Math.round(pct)}%
      </span>
    )
  }

  // signal === null and pct != null → computed but within ±25% ("aligned")
  if (pct != null) {
    return (
      <span className="text-market-neutral text-xs">
        ≈ aligned
      </span>
    )
  }

  return null
}

function ConfidenceBadge({ confidence }) {
  const norm = normalizeConfidence(confidence)
  if (!norm) return null
  const colorCls = CONFIDENCE_COLOR[norm]
  return (
    <span className="inline-flex items-center gap-0.5 text-xs">
      <span className={`${colorCls} leading-none`} aria-hidden="true">●</span>
      <span className={colorCls}>{CONFIDENCE_LABEL[norm]}</span>
    </span>
  )
}

export function ValueChip({
  value,
  marketDelta,
  confidence,
  ktcValue,
  position,
  size = 'sm',
}) {
  const valueNode = value == null
    ? <span className="text-text-faint tabular-nums">—</span>
    : <span className="text-text tabular-nums">{Math.round(value)}</span>

  if (size === 'md') {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{valueNode}</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          <DeltaPill marketDelta={marketDelta} position={position} />
          <ConfidenceBadge confidence={confidence} />
        </div>
        {ktcValue != null && (
          <span className="text-text-muted text-xs">KTC {ktcValue.toLocaleString()}</span>
        )}
      </div>
    )
  }

  // size === 'sm' — single-line compact for table cells
  return (
    <span className="inline-flex items-center gap-1.5">
      {valueNode}
      <DeltaPill marketDelta={marketDelta} position={position} />
      <ConfidenceBadge confidence={confidence} />
      {ktcValue != null && (
        <span className="text-text-muted text-xs">KTC {ktcValue.toLocaleString()}</span>
      )}
    </span>
  )
}
