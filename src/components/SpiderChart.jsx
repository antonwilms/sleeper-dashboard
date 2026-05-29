import Tooltip from './Tooltip'

// ---------------------------------------------------------------------------
// SpiderChart — 5-axis radar/spider chart for dynasty score components
//
// Supports 1 or 2 player overlays. Pure SVG geometry with HTML overlay labels
// for the existing Tooltip component to hook into.
// ---------------------------------------------------------------------------

const AXES = [
  // Clockwise from top
  { key: 'ageAdjusted',  label: 'Age',         tooltip: 'Production vs age curve expectation' },
  { key: 'trajectory',   label: 'Trajectory',  tooltip: 'Career trend — improving or declining' },
  { key: 'opportunity',  label: 'Opportunity', tooltip: 'Role security and offensive context' },
  { key: 'reliability',  label: 'Reliability', tooltip: 'Consistency and durability' },
  { key: 'currentLevel', label: 'Level',       tooltip: 'Percentile rank vs position peers' },
]
const N = AXES.length
const ANGLE_OFFSET_DEG = -90

const DEFAULT_COLORS = ['#6366f1', '#10b981']  // indigo, emerald

function angleRadFor(i) {
  return ((ANGLE_OFFSET_DEG + i * (360 / N)) * Math.PI) / 180
}

// Horizontal alignment for an axis label given its angle.
// Use cos(angle) to decide: right side → start, left side → end, vertical → middle.
function labelAlignFor(angleRad) {
  const cos = Math.cos(angleRad)
  if (cos > 0.3)  return { translateX: '0%',   textAlign: 'left'   }
  if (cos < -0.3) return { translateX: '-100%', textAlign: 'right'  }
  return                  { translateX: '-50%',  textAlign: 'center' }
}

export default function SpiderChart({ players = [], size = 260, interactive = true }) {
  if (!players || players.length === 0) return null

  const cx = size / 2
  const cy = size / 2
  const outerRadius = size * 0.36
  const labelRadius = size * 0.46

  // Precompute axis tips and label positions
  const axisGeo = AXES.map((axis, i) => {
    const a = angleRadFor(i)
    return {
      ...axis,
      angleRad: a,
      tipX:   cx + outerRadius * Math.cos(a),
      tipY:   cy + outerRadius * Math.sin(a),
      labelX: cx + labelRadius * Math.cos(a),
      labelY: cy + labelRadius * Math.sin(a),
    }
  })

  // Compute a point on axis i for a given 0-100 value
  function pointOnAxis(i, v) {
    const a = axisGeo[i].angleRad
    const r = (Math.max(0, Math.min(100, v ?? 0)) / 100) * outerRadius
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
  }

  // Build per-player point lists
  const playerPolygons = players.map((p, pIdx) => {
    const color = p.color ?? DEFAULT_COLORS[pIdx] ?? DEFAULT_COLORS[0]
    const points = axisGeo.map((axis, i) => pointOnAxis(i, p.values?.[axis.key]))
    return { ...p, color, points }
  })

  // ── Grid ring opacities ─────────────────────────────────────────────────
  const ringLevels = [
    { pct: 25,  opacity: 0.15 },
    { pct: 50,  opacity: 0.20 },
    { pct: 75,  opacity: 0.25 },
    { pct: 100, opacity: 0.35 },
  ]

  return (
    <div style={{ position: 'relative', width: size, height: size + (players.length === 2 ? 24 : 0) }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block' }}>
        {/* LAYER 1 — grid rings */}
        {ringLevels.map(({ pct, opacity }) => {
          const pts = axisGeo.map(axis => {
            const r = (pct / 100) * outerRadius
            return `${cx + r * Math.cos(axis.angleRad)},${cy + r * Math.sin(axis.angleRad)}`
          }).join(' ')
          return (
            <polygon key={pct} points={pts} fill="none" stroke="#9ca3af"
              strokeOpacity={opacity} strokeWidth={1} />
          )
        })}
        {/* "100" tick label on top-right axis (axisGeo[1]) */}
        {(() => {
          const a = axisGeo[1].angleRad
          const r = outerRadius * 1.0
          const x = cx + r * Math.cos(a) + 4
          const y = cy + r * Math.sin(a) - 2
          return <text x={x} y={y} fontSize={9} fill="#9ca3af">100</text>
        })()}

        {/* LAYER 2 — axis lines */}
        {axisGeo.map((axis, i) => (
          <line key={i} x1={cx} y1={cy} x2={axis.tipX} y2={axis.tipY}
            stroke="#9ca3af" strokeOpacity={0.3} strokeWidth={1} />
        ))}

        {/* LAYER 3 — data polygons + points */}
        {playerPolygons.map((p, pIdx) => {
          const pointsStr = p.points.map(pt => `${pt.x},${pt.y}`).join(' ')
          return (
            <g key={pIdx}>
              <polygon points={pointsStr}
                fill={p.color} fillOpacity={0.20}
                stroke={p.color} strokeOpacity={0.80}
                strokeWidth={2} />
              {p.points.map((pt, i) => (
                <circle key={i} cx={pt.x} cy={pt.y} r={4}
                  fill={p.color} stroke="white" strokeWidth={1.5} />
              ))}
            </g>
          )
        })}
      </svg>

      {/* LAYER 4 — axis labels (HTML overlay so Tooltip can hook in) */}
      {axisGeo.map((axis, i) => {
        const align = labelAlignFor(axis.angleRad)
        const labelEl = (
          <div
            style={{
              position:  'absolute',
              left:      axis.labelX,
              top:       axis.labelY,
              transform: `translate(${align.translateX}, -50%)`,
              fontSize:  11,
              fontWeight: 500,
              color:     '#6b7280',
              whiteSpace: 'nowrap',
              cursor:    interactive ? 'help' : 'default',
              textAlign: align.textAlign,
              pointerEvents: 'auto',
            }}
          >
            {axis.label}
          </div>
        )
        return interactive
          ? <Tooltip key={i} content={axis.tooltip} position="top">{labelEl}</Tooltip>
          : <div key={i}>{labelEl}</div>
      })}

      {/* Data point hover targets — invisible overlays for tooltips */}
      {interactive && playerPolygons.flatMap((p, pIdx) =>
        p.points.map((pt, i) => {
          const v = p.values?.[axisGeo[i].key] ?? 0
          const labelPrefix = players.length > 1 ? `${p.label} — ` : ''
          return (
            <Tooltip key={`${pIdx}-${i}`}
              content={`${labelPrefix}${axisGeo[i].label}: ${Math.round(v)}/100`}
              position="top"
            >
              <div
                style={{
                  position:  'absolute',
                  left:      pt.x,
                  top:       pt.y,
                  transform: 'translate(-50%, -50%)',
                  width:     16,
                  height:    16,
                  borderRadius: '50%',
                  cursor:    'help',
                  pointerEvents: 'auto',
                }}
              />
            </Tooltip>
          )
        })
      )}

      {/* LAYER 5 — Legend for 2-player overlay */}
      {players.length === 2 && (
        <div
          style={{
            position: 'absolute',
            left:     0,
            right:    0,
            bottom:   0,
            display:  'flex',
            justifyContent: 'center',
            gap:      16,
            fontSize: 11,
            color:    '#6b7280',
          }}
        >
          {playerPolygons.map((p, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span
                style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: p.color, display: 'inline-block',
                }}
              />
              <span style={{ fontWeight: 500 }}>{p.label}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
