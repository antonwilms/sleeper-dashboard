// weekly-decision-1-lineup.md §6, weekly-decision-2a-lineup-truth.md §6 — starters as set in
// Sleeper, slot by slot, then the bench. Nothing on this table ranks or selects players. Column
// groups OPPONENT DEFENCE / USAGE / SCORING per artboard 9a. Presentational, props-only, no
// fetching. `role` is `playerMap[id].depth_chart_position` + `depth_chart_order`
// (weeklyLineup.js), matching Portfolio.jsx:334-336's treatment of the same fields — no invented
// "WR1"-style ranking beyond what those two fields give. The design mock's grey "last season"
// sub-line is SNAP-only (weekly-decision-2-panels.md §1a — see weeklyUsage.js's
// priorSeasonSnapShare header for why RUSH/TARGET/TOUCH render none) — `priorSnapByPlayer`, keyed
// by `player_id`, is an optional prop defaulting to `{}` so W2a's shape stays untouched.

const SLOT_LABEL = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'FLX', SUPER_FLEX: 'SF', BN: 'BN' }

// Colour bands, not a gradient (parent §4 — season-long reliability of points-allowed is ~0.2, so
// false precision here would misstate the confidence a single rank number carries). Buckets at
// rank >=27 / >=23 / <=6 / <=10 / else, per the design.
function allowsToneClass(rank) {
  if (rank == null) return 'text-dp-muted'
  if (rank >= 27) return 'text-dp-up-text'
  if (rank >= 23) return 'text-dp-up'
  if (rank <= 6) return 'text-dp-down-text'
  if (rank <= 10) return 'text-dp-down'
  return 'text-dp-text'
}

function pctText(v) {
  return v == null ? '—' : `${Math.round(v * 100)}%`
}

// weekly-decision-2-panels.md §1a — `priorShare` is set only for the SNAP column. RUSH/TARGET/
// TOUCH pass no prior share (a decision, not a gap — see weeklyUsage.js's priorSeasonSnapShare
// header) and render no sub-line at all, never a dash: a dash here would read as "last season was
// zero" rather than "not computed".
function ShareCell({ value, priorShare = null }) {
  return (
    <td className="px-2.5 py-2.5 text-right">
      <div className={`font-dp-mono text-[12px] ${value == null ? 'text-dp-muted' : 'text-dp-text-2'}`}>
        {pctText(value)}
      </div>
      {priorShare != null && (
        <div data-testid="prior-share" className="font-dp-mono text-[10px] text-dp-muted-2">{pctText(priorShare)}</div>
      )}
    </td>
  )
}

// Last-3-played-weeks form bars. `form` carries leading `null`s (fewer than three played weeks) —
// void slots render a dashed baseline marker, never a filled zero stub (the same rule
// dp/cells.jsx's CareerBars documents for a measured-zero-vs-void distinction).
function FormBars({ form = [] }) {
  const finite = form.filter(v => Number.isFinite(v))
  const max = Math.max(1, ...finite)
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 18 }}>
      {form.map((v, i) => {
        if (!Number.isFinite(v)) {
          return (
            <div
              key={i}
              className="w-[9px]"
              style={{ height: 0, borderTop: '1px dashed var(--color-dp-muted-2)' }}
            />
          )
        }
        const h = v > 0 ? Math.max(3, Math.round((v / max) * 18)) : 2
        return <div key={i} className="w-[9px] rounded-[1px] bg-dp-up" style={{ height: h }} />
      })}
    </div>
  )
}

function AllowsCell({ row }) {
  if (row.player_id == null || row.bye || row.allows == null) {
    return (
      <td className="px-2.5 py-2.5">
        <span className="text-dp-muted text-[12px]">—</span>
      </td>
    )
  }
  const tone = allowsToneClass(row.allowsRank)
  const weightPct = Math.round((row.weight ?? 0) * 100)
  return (
    <td className="px-2.5 py-2.5">
      <div className="flex items-center gap-2">
        <span className={`font-dp-mono text-[14px] font-semibold w-[42px] text-right ${tone}`}>
          {row.allows.toFixed(1)}
        </span>
        <div className="min-w-0">
          <div className={`font-dp-mono text-[10.5px] whitespace-nowrap ${tone}`}>
            {row.allowsRank != null ? `${row.allowsRank} of 32` : '—'}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="w-[26px] h-1 bg-dp-border rounded-full overflow-hidden block">
              <span className="block h-1 bg-dp-up" style={{ width: `${weightPct}%` }} />
            </span>
            <span className="font-dp-mono text-[9px] text-dp-muted whitespace-nowrap">{weightPct}%</span>
          </div>
        </div>
      </div>
    </td>
  )
}

function LineupRow({ r, i, priorSnapByPlayer }) {
  return (
    <tr key={`${r.slot}-${i}`} className="border-t border-dp-border-row">
      <td className="px-[18px] py-2.5 font-dp-mono text-[10.5px] text-dp-muted w-[26px]">
        {SLOT_LABEL[r.slot] ?? r.slot}
      </td>
      <td className="px-2.5 py-2.5">
        {r.player_id == null ? (
          <span className="text-dp-muted text-[12px]">Empty</span>
        ) : (
          <div className="min-w-0 flex items-start gap-1.5">
            {r.team && (
              <span className="text-[10px] font-dp-mono tracking-[0.08em] text-dp-muted-2 border border-dp-border-raised rounded px-1.5 py-0.5 shrink-0">
                {r.team}
              </span>
            )}
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-dp-text whitespace-nowrap">{r.name}</div>
              <div className="text-[10.5px] text-dp-muted">
                {r.position}
                {r.role ? ` · ${r.role}` : ''}
              </div>
            </div>
          </div>
        )}
      </td>
      <td className="px-2.5 py-2.5 border-l border-dp-border-row">
        {r.player_id == null ? (
          <span className="text-dp-muted">—</span>
        ) : r.bye ? (
          <span className="font-dp-mono text-[11px] text-dp-muted">BYE</span>
        ) : (
          <div className="font-dp-mono text-[11.5px] text-dp-text-2">{r.opponent ?? '—'}</div>
          // PROVISIONAL(no-data): opponent W-L record · not derived this slice · the live
          // schedule's homeScore/awayScore (already indexed by weeklySchedule.js) would supply it
        )}
      </td>
      <AllowsCell row={r} />
      <ShareCell value={r.usage?.rush ?? null} />
      <ShareCell value={r.usage?.target ?? null} />
      <ShareCell value={r.usage?.touch ?? null} />
      <ShareCell value={r.usage?.snap ?? null} priorShare={priorSnapByPlayer?.[r.player_id] ?? null} />
      <td className="px-2.5 py-2.5 border-l border-dp-border-row">
        <div className="flex items-center gap-2">
          <FormBars form={r.form} />
          <span className="font-dp-mono text-[10.5px] text-dp-muted whitespace-nowrap">
            {(r.form ?? []).map(v => (Number.isFinite(v) ? v.toFixed(1) : '—')).join(' / ')}
          </span>
        </div>
      </td>
      <td className="px-[18px] py-2.5 font-dp-mono text-[13px] font-semibold text-dp-text text-right">
        {r.points != null ? r.points.toFixed(1) : '—'}
      </td>
    </tr>
  )
}

export function LineupTable({ starters = [], bench = [], loading = false, priorSnapByPlayer = {} }) {
  if (loading) {
    return (
      <div className="bg-dp-card border border-dp-border rounded-[10px] py-10 text-center text-dp-muted text-sm">
        Loading this week…
      </div>
    )
  }

  return (
    <div className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
      <div className="flex items-baseline gap-2.5 px-[18px] py-3 border-b border-dp-border-row flex-wrap">
        <span className="text-[13px] font-semibold text-dp-text-strong">The lineup</span>
        <span className="text-[11.5px] text-dp-muted">
          {starters.length} slots as set in Sleeper, then the bench · opponent, usage and form beside each
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-dp-card-quiet">
              <th colSpan={2} className="px-[18px] py-1"></th>
              <th
                colSpan={2}
                className="text-left px-2.5 py-1 font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted border-l border-dp-border-row"
              >
                OPPONENT DEFENCE
              </th>
              <th
                colSpan={4}
                className="text-left px-2.5 py-1 font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted border-l border-dp-border-row"
              >
                USAGE — SHARE OF HIS OFFENCE
              </th>
              <th
                colSpan={2}
                className="text-left px-2.5 py-1 font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted border-l border-dp-border-row"
              >
                SCORING
              </th>
            </tr>
            <tr className="bg-dp-card-quiet">
              <th className="px-[18px] pb-2"></th>
              <th className="text-left px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted">PLAYER</th>
              <th className="text-left px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted border-l border-dp-border-row">VS</th>
              <th className="text-left px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">
                ALLOWS TO POS · PTS/G
              </th>
              <th className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted border-l border-dp-border-row">RUSH</th>
              <th className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted">TARGET</th>
              <th className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted">TOUCH</th>
              <th className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted">SNAP</th>
              <th className="text-left px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted border-l border-dp-border-row whitespace-nowrap">
                LAST 3
              </th>
              <th className="text-right px-[18px] pb-2 font-dp-mono text-[10px] text-dp-text">PROJ</th>
            </tr>
          </thead>
          <tbody>
            {starters.map((r, i) => <LineupRow key={`starter-${r.slot}-${i}`} r={r} i={i} priorSnapByPlayer={priorSnapByPlayer} />)}
            {bench.length > 0 && (
              <tr>
                <td colSpan={11} className="px-[18px] py-1.5 border-t border-dp-border-row bg-dp-card-quiet font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted">
                  BENCH · {bench.length}
                </td>
              </tr>
            )}
            {bench.map((r, i) => <LineupRow key={`bench-${r.player_id}-${i}`} r={r} i={i} priorSnapByPlayer={priorSnapByPlayer} />)}
          </tbody>
        </table>
      </div>
      <div className="flex gap-6 px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet flex-wrap">
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          ALLOWS is blended per-game fantasy points allowed to that player&rsquo;s position, on
          Sleeper&rsquo;s half-PPR <span className="font-dp-mono text-dp-text-4">fan_pts_allow_*</span> basis,
          not this league&rsquo;s scoring. Rank 1 is the toughest of 32. The bar beneath is how much
          of the blend is the current season.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          RUSH is carries ÷ team rush attempts, TARGET is targets ÷ team pass attempts, TOUCH is
          (carries + receptions) ÷ (team rush + pass attempts) — attempts, not plays: they exclude
          sacks and include kneels. SNAP is <span className="font-dp-mono text-dp-text-4">off_snp</span> ÷
          that player&rsquo;s own <span className="font-dp-mono text-dp-text-4">tm_off_snp</span>, live and
          weekly from the Sleeper stats endpoint.
        </span>
      </div>
    </div>
  )
}
