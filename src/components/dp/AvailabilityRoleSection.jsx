import { DegradedBlock } from './DegradedBlock'
import { buildAvailabilityGrid, STATUS_LABEL } from '../../utils/availabilityGrid'

const STATUS_STYLE = {
  P: 'bg-dp-up',
  D: 'bg-dp-down',
  B: 'bg-dp-slate-2',
  X: 'border border-dashed border-dp-border-raised',
}

function Legend({ code }) {
  return (
    <div className="flex items-center gap-1">
      <div className={`w-[8px] h-[8px] rounded-[2px] ${STATUS_STYLE[code]}`} />
      <span>{STATUS_LABEL[code]}</span>
    </div>
  )
}

// dp-v2 Slice 4b. Two of the design's three blocks — the weekly status strip (Sleeper
// players-state, capture-only in the data repo, no app loader) is omitted entirely, not stood in
// with a DegradedBlock: the degraded kinds describe states of data, and this is a state of
// implementation (task file §4.2).
export function AvailabilityRoleSection({ careerStats, playerId, axisSeasons, teamDepthChart, position }) {
  const { rows, hasBye } = buildAvailabilityGrid(careerStats, playerId, axisSeasons)
  const posGroup = teamDepthChart?.[position] ?? []
  const hasNoGameRecorded = rows.some(r => r.weeks.includes('X'))

  return (
    <div className="flex flex-col gap-6">
      {/* ── Games-played grid ─────────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-semibold text-dp-text-3 mb-2">Games played</div>
        {rows.length === 0 ? (
          <p className="text-xs text-dp-muted italic">No season history available.</p>
        ) : (
          <div className="flex flex-col gap-1">
            {[...rows].reverse().map(r => (
              <div key={r.season} className="flex items-center gap-2">
                <span className="font-dp-mono text-[11px] text-dp-muted w-[36px] shrink-0">{r.season}</span>
                <div className="flex gap-[2px]">
                  {r.weeks.map((code, i) => (
                    <div
                      key={i}
                      title={`WK ${i + 1} · ${STATUS_LABEL[code]}`}
                      className={`w-[10px] h-[10px] rounded-[2px] ${STATUS_STYLE[code]}`}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        {rows.length > 0 && (
          <>
            <div className="flex items-center gap-3 mt-2.5 text-[10px] text-dp-muted-2">
              <Legend code="P" />
              <Legend code="D" />
              {hasBye && <Legend code="B" />}
              <Legend code="X" />
            </div>
            {hasNoGameRecorded && (
              <p className="text-[11px] text-dp-muted mt-1.5">
                &quot;No game recorded&quot; also includes byes under store-served data — those season totals don&apos;t resolve them.
              </p>
            )}
          </>
        )}
      </div>

      {/* ── Depth chart ────────────────────────────────────────────────────────────────────── */}
      <div>
        <div className="text-[11px] font-semibold text-dp-text-3 mb-2">Depth chart{position ? ` — ${position}` : ''}</div>
        {posGroup.length === 0 ? (
          <DegradedBlock kind="no-baseline">No depth chart data for this player&apos;s team.</DegradedBlock>
        ) : (
          <div className="flex flex-col gap-1">
            {posGroup.map(p => (
              <div
                key={p.player_id}
                className={`flex items-center gap-2.5 px-2 py-1.5 rounded-md ${p.player_id === playerId ? 'bg-dp-up-bg' : ''}`}
              >
                <span className="font-dp-mono text-[11px] text-dp-muted w-[24px] shrink-0">{p.depthOrder}</span>
                <span className={`flex-1 min-w-0 text-xs truncate ${p.player_id === playerId ? 'text-dp-up-text' : 'text-dp-text-2'}`}>
                  {p.full_name}
                </span>
                <span className="text-[11px] text-dp-muted w-[80px] shrink-0 truncate">{p.dynastyLabel ?? '—'}</span>
                <span className="font-dp-mono text-xs text-dp-text-2 w-[40px] shrink-0 text-right">
                  {p.currentSeasonPPG != null ? p.currentSeasonPPG.toFixed(1) : '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
