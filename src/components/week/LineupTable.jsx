import { ClickableRow } from '../dp/cells'
import { PlayerHeadshot, TeamLogo } from '../dp/SleeperImages'

// weekly-decision-1-lineup.md §6, weekly-decision-2a-lineup-truth.md §6, week-lineup-cleanup.md §6 —
// starters as set in Sleeper, slot by slot, then the bench. Nothing on this table ranks or selects
// players. Column groups OPPONENT DEFENCE / USAGE / SCORING per artboard 9a. Presentational,
// props-only, no fetching. Player rows open the player pop-up (mouse and keyboard); empty slots are
// inert. Usage cells show count · share; the under-name line is the season rank line (by total
// league-scored points, weeklyRanks.js) plus a BACKUP chip from the raw depth entry
// (weeklyLineup.js). The grey sub-line is SNAP-only and carries its season
// (weekly-decision-2-panels.md §1a — see weeklyUsage.js's priorSeasonSnapShare header) —
// `priorSnapByPlayer`, keyed by `player_id`, is an optional prop defaulting to `{}`. Player rows
// carry a headshot and team logos (sleeper-images.md). OURS (week-own-projection.md) is the season
// projection nudged by this week's Vegas implied team total — a heuristic, not a model; BACKUP for
// WR/TE additionally needs a current snap share under 50%.

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

// weekly-decision-2-panels.md §1a — `priorShare` is set only for the SNAP column; its sub-line is
// labelled with the season it describes (`2025 · 61%`). RUSH/TARGET/TOUCH/RZ pass no prior share (a
// decision, not a gap — see weeklyUsage.js's priorSeasonSnapShare header) and render no sub-line at
// all, never a dash: a dash here would read as "last season was zero" rather than "not computed".
function UsageCell({ count, share, priorShare = null, priorSeason = null }) {
  const empty = count == null && share == null
  return (
    <td className="px-2.5 py-2.5 text-right">
      <div className={`font-dp-mono text-[12px] whitespace-nowrap ${empty ? 'text-dp-muted' : 'text-dp-text-2'}`}>
        {empty ? '—' : `${count ?? '—'} · ${pctText(share)}`}
      </div>
      {priorShare != null && (
        <div data-testid="prior-share" className="font-dp-mono text-[10px] text-dp-muted-2">
          {priorSeason != null ? `${priorSeason} · ${pctText(priorShare)}` : pctText(priorShare)}
        </div>
      )}
    </td>
  )
}

// The under-name line: last-season and this-season position rank, then this-season overall rank
// (QB/RB/WR/TE). A segment with no value is omitted, never `—`; no segments → the bare position.
function rankLine(r, lastSeason, thisSeason) {
  const segs = []
  if (r.ranks?.lastPos != null && lastSeason != null) segs.push(`${lastSeason} ${r.position}${r.ranks.lastPos}`)
  if (r.ranks?.thisPos != null && thisSeason != null) segs.push(`${thisSeason} ${r.position}${r.ranks.thisPos}`)
  if (r.ranks?.thisOverall != null) segs.push(`#${r.ranks.thisOverall} overall`)
  return segs.length > 0 ? segs.join(' · ') : r.position
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

const MINUS = '\u2212'

function ownTitle(own, season) {
  const label = season ?? "this season's"
  if (own.reason === null) {
    const kind = own.baseKind === 'ros' ? 'Rest-of-season' : 'Season'
    const v = own.vegas
    return `${kind} projection ${own.base.toFixed(1)} PPG \u00d7 ${v.factor.toFixed(2)} = ${own.value.toFixed(1)}. The factor is half the percentage difference between this week's Vegas implied team total (${v.implied.toFixed(1)}) and his team's average over ${v.baselineWeeks} earlier ${label} games with a line (${v.baseline.toFixed(1)}). A heuristic, not a model.`
  }
  if (own.reason === 'no-baseline') {
    return `Vegas implied team total ${own.vegas.implied.toFixed(1)}, but fewer than ${own.vegas.minBaselineWeeks} earlier ${label} games with a line to compare it with \u2014 no number.`
  }
  if (own.reason === 'no-line') return 'No Vegas line for this game in the schedule file \u2014 no number.'
  if (own.reason === 'no-base') return 'No season projection for this player \u2014 no number.'
  if (own.reason === 'out') return `Listed ${own.status} in Sleeper \u2014 no number.`
  if (own.reason === 'bye') return 'Bye week.'
  return undefined
}

// PROVISIONAL(heuristic): OURS cell · renders weeklyOwnProjection.js's heuristic, not a model verdict · a fitted, graded weekly model would make it real
function OwnCell({ own, thisSeason }) {
  const implied = own?.vegas?.implied
  const baseline = own?.vegas?.baseline
  let top
  if (own?.value != null) {
    top = <span className="text-dp-text-2">{own.value.toFixed(1)}</span>
  } else if (own?.reason === 'out') {
    top = <span className="text-[11px] text-dp-muted">OUT</span>
  } else {
    top = <span className="text-dp-muted">—</span>
  }
  let delta = null
  if (Number.isFinite(implied) && Number.isFinite(baseline)) {
    const d = Math.abs(implied - baseline).toFixed(1)
    delta = ` \u00b7 ${implied >= baseline ? '+' : MINUS}${d}`
  }
  return (
    <td className="px-2.5 py-2.5 text-right" title={own ? ownTitle(own, thisSeason) : undefined}>
      <div className="font-dp-mono text-[13px]">{top}</div>
      {Number.isFinite(implied) && (
        <div data-testid="own-implied" className="font-dp-mono text-[10px] text-dp-muted-2 whitespace-nowrap">
          {`imp ${implied.toFixed(1)}`}{delta}
        </div>
      )}
    </td>
  )
}

function LineupRow({ r, i, priorSnapByPlayer, ownByPlayer, lastSeason, thisSeason, onOpenPlayerDetail }) {
  const cells = (
    <>
      <td className="px-[18px] py-2.5 font-dp-mono text-[10.5px] text-dp-muted w-[26px]">
        {SLOT_LABEL[r.slot] ?? r.slot}
      </td>
      <td className="px-2.5 py-2.5">
        {r.player_id == null ? (
          <span className="text-dp-muted text-[12px]">Empty</span>
        ) : (
          <div className="min-w-0 flex items-start gap-1.5">
            <PlayerHeadshot playerId={r.player_id} size={28} />
            {r.team && (
              <span className="inline-flex items-center gap-1 text-[10px] font-dp-mono tracking-[0.08em] text-dp-muted-2 border border-dp-border-raised rounded px-1.5 py-0.5 shrink-0">
                <TeamLogo team={r.team} size={12} />
                {r.team}
              </span>
            )}
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-dp-text whitespace-nowrap">{r.name}</div>
              <div
                className="text-[10.5px] text-dp-muted"
                title="Rank by total points in this league's scoring; overall is among QB, RB, WR and TE"
              >
                {rankLine(r, lastSeason, thisSeason)}
                {r.backup && (
                  <span
                    data-testid="backup-flag"
                    title={`Depth chart: ${r.depth.position}${r.depth.order}`}
                    className="ml-1.5 font-dp-mono text-[9px] tracking-[0.08em] text-dp-muted border border-dp-border-raised rounded px-1"
                  >
                    BACKUP
                  </span>
                )}
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
          <div className="font-dp-mono text-[11.5px] text-dp-text-2 flex items-center gap-1.5">
            <TeamLogo team={r.opponent} size={14} />
            {r.opponent ?? '—'}
          </div>
          // PROVISIONAL(no-data): opponent W-L record · not rendered on this row · buildTeamRecords
          // (weeklySchedule.js) supplies it; Defences you face renders it for starters — wire here if wanted
        )}
      </td>
      <AllowsCell row={r} />
      <UsageCell count={r.counts?.rush ?? null} share={r.usage?.rush ?? null} />
      <UsageCell count={r.counts?.target ?? null} share={r.usage?.target ?? null} />
      <UsageCell count={r.counts?.touch ?? null} share={r.usage?.touch ?? null} />
      <UsageCell count={r.counts?.rzRush ?? null} share={r.usage?.rzRush ?? null} />
      <UsageCell count={r.counts?.rzTarget ?? null} share={r.usage?.rzTarget ?? null} />
      <UsageCell
        count={r.counts?.snap ?? null}
        share={r.usage?.snap ?? null}
        priorShare={priorSnapByPlayer?.[r.player_id] ?? null}
        priorSeason={lastSeason}
      />
      <td className="px-2.5 py-2.5 border-l border-dp-border-row">
        <div className="flex items-center gap-2">
          <FormBars form={r.form} />
          <span className="font-dp-mono text-[10.5px] text-dp-muted whitespace-nowrap">
            {(r.form ?? []).map(v => (Number.isFinite(v) ? v.toFixed(1) : '—')).join(' / ')}
          </span>
        </div>
      </td>
      <OwnCell own={ownByPlayer?.[r.player_id] ?? null} thisSeason={thisSeason} />
      <td className="px-[18px] py-2.5 font-dp-mono text-[13px] font-semibold text-dp-text text-right">
        {r.points != null ? r.points.toFixed(1) : '—'}
      </td>
    </>
  )
  if (r.player_id == null) {
    return <tr key={`${r.slot}-${i}`} className="border-t border-dp-border-row">{cells}</tr>
  }
  return <ClickableRow row={r} onOpen={onOpenPlayerDetail}>{cells}</ClickableRow>
}

export function LineupTable({
  starters = [], bench = [], loading = false, priorSnapByPlayer = {}, ownByPlayer = {},
  onOpenPlayerDetail = () => {}, lastSeason = null, thisSeason = null,
}) {
  if (loading) {
    return (
      <div className="bg-dp-card border border-dp-border rounded-[10px] py-10 text-center text-dp-muted text-sm">
        Loading this week…
      </div>
    )
  }

  const rowProps = { priorSnapByPlayer, ownByPlayer, lastSeason, thisSeason, onOpenPlayerDetail }
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
                colSpan={6}
                className="text-left px-2.5 py-1 font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted border-l border-dp-border-row"
              >
                USAGE — COUNT · SHARE OF HIS OFFENCE
              </th>
              <th
                colSpan={3}
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
              <th className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">RZ RUSH</th>
              <th className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted whitespace-nowrap">RZ TGT</th>
              <th className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted">SNAP</th>
              <th className="text-left px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted border-l border-dp-border-row whitespace-nowrap">
                LAST 3
              </th>
              <th
                className="text-right px-2.5 pb-2 font-dp-mono text-[10px] text-dp-muted"
                title="Our number: the season projection nudged by this week's Vegas implied team total. A heuristic, not a model."
              >
                OURS
              </th>
              <th className="text-right px-[18px] pb-2 font-dp-mono text-[10px] text-dp-text">PROJ</th>
            </tr>
          </thead>
          <tbody>
            {starters.map((r, i) => <LineupRow key={`starter-${r.slot}-${i}`} r={r} i={i} {...rowProps} />)}
            {bench.length > 0 && (
              <tr>
                <td colSpan={13} className="px-[18px] py-1.5 border-t border-dp-border-row bg-dp-card-quiet font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted">
                  BENCH · {bench.length}
                </td>
              </tr>
            )}
            {bench.map((r, i) => <LineupRow key={`bench-${r.player_id}-${i}`} r={r} i={i} {...rowProps} />)}
          </tbody>
        </table>
      </div>
      <div className="flex gap-6 px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet flex-wrap">
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          ALLOWS is blended per-game fantasy points allowed to that player&rsquo;s position, in this
          league&rsquo;s scoring (Sleeper weekly stat lines, scored with your settings). Rank 1 is the
          toughest of 32. The bar beneath is how much of the blend is the current season.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          Each usage cell is a count over the weeks he played, then its share. RUSH is carries ÷ team
          rush attempts, TARGET is targets ÷ team pass attempts, TOUCH is (carries + receptions) ÷
          (team rush + pass attempts) — attempts, not plays: they exclude sacks and include kneels. RZ
          RUSH and RZ TGT are the same inside the opponent&rsquo;s 20: red-zone carries ÷ team red-zone
          rush attempts, red-zone targets ÷ team red-zone pass attempts. SNAP is{' '}
          <span className="font-dp-mono text-dp-text-4">off_snp</span> ÷ that player&rsquo;s own{' '}
          <span className="font-dp-mono text-dp-text-4">tm_off_snp</span>; the grey line beneath is{' '}
          {lastSeason ?? 'last season'}. All live and weekly from the Sleeper stats endpoint.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          Under each name: position rank last season and this season, and overall rank this season
          among QB, RB, WR and TE — all by total points in this league&rsquo;s scoring (My
          Team&rsquo;s RANK uses points per game). BACKUP marks a player listed second or lower on his
          NFL depth chart &mdash; for WR and TE only while his snap share this season is under 50%,
          since Sleeper lists receivers by side.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          OURS is a stand-in, not a model: our season projection (rest of season once this
          season&rsquo;s games count), moved by half the percentage difference between this
          week&rsquo;s Vegas implied team total and his team&rsquo;s average implied total in earlier
          weeks. In a 2024&ndash;25 backtest (weeks 5&ndash;18) that nudge beat no nudge by under 1%,
          scaling fully by ALLOWS made it worse (so ALLOWS is shown but not used), and Sleeper&rsquo;s
          PROJ was 2&ndash;4% more accurate. Blank when any input is missing; OUT when Sleeper lists
          him out.
        </span>
      </div>
    </div>
  )
}
