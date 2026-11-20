import { useState } from 'react'
import { ClickableRow, LensSwitch, PlayerCell, StatusChip } from '../dp/cells'
import { lensHidden } from '../dp/lens'
import { FrozenScroll } from '../dp/FrozenScroll'
import {
  FROZEN_SLOT_W, FROZEN_SLOT_INNER, FROZEN_FIRST, FROZEN_SECOND, FROZEN_ROW_HOVER, FROZEN_EDGE,
} from '../dp/frozen'
import { TeamLogo } from '../dp/SleeperImages'
import { WeeklyStrip } from '../dp/WeeklyStrip'
import { SeriesBars } from '../dp/SeriesBars'

// weekly-decision-1-lineup.md §6, weekly-decision-2a-lineup-truth.md §6, week-lineup-cleanup.md §6 —
// starters as set in Sleeper, slot by slot, then the bench. Nothing on this table ranks or selects
// players. Fixed columns SLOT · PLAYER (both frozen, dp/frozen.js) · PROJ · OURS · VS, then one column
// view at a time — Matchup (IMPLIED, SPREAD, ALLOWED / G, YDS ALLOWED, PACE, PROE) / Usage & form /
// All (LINEUP_LENSES below; week-w2a-lineup-matchup-layout.md). Presentational,
// props-only, no fetching. Player rows open the player pop-up (mouse and keyboard); empty slots are
// inert. Usage cells show count · share, with a neutral week-by-week share trend under SNAP, TARGET (WR/TE) and RUSH (RB) (`usageTrendByPlayer`); the WEEKS column is dp/WeeklyStrip over `stripByPlayer` (one bar per completed week, percentile-coloured from `percentileBasis`); the under-name line is the season rank line (by total
// league-scored points, weeklyRanks.js); the BACKUP chip from the raw depth entry
// (weeklyLineup.js) sits on the name line beside the injury chip. The grey sub-line is SNAP-only and carries its season
// (weekly-decision-2-panels.md §1a — see weeklyUsage.js's priorSeasonSnapShare header) —
// `priorSnapByPlayer`, keyed by `player_id`, is an optional prop defaulting to `{}`. Player rows
// use dp/cells.jsx's shared `PlayerCell` (W2b-2); the VS cell carries the opponent logo. OURS (week-own-projection.md) is the season
// projection nudged by this week's Vegas implied team total — a heuristic, not a model; BACKUP for
// WR/TE additionally needs a current snap share under 50%.

// Column views: SLOT · PLAYER · PROJ · OURS · VS are fixed; the rest show one group at a time, or all
// of them. Every cell stays in the DOM (dp/lens.js lensHidden) — nothing is dropped.
const LINEUP_LENSES = [
  { key: 'matchup', label: 'Matchup' },
  { key: 'usage', label: 'Usage & form' },
  { key: 'all', label: 'All' },
]

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
function UsageCell({ testId, count, share, priorShare = null, priorSeason = null, trend = null, lens }) {
  const empty = count == null && share == null
  return (
    <td data-testid={testId} className={`px-2.5 py-2.5 text-right ${lensHidden('usage', lens)}`}>
      <div className={`font-dp-mono text-[12px] whitespace-nowrap ${empty ? 'text-dp-muted' : 'text-dp-text'}`}>
        {empty ? '—' : <>{count ?? '—'}<span className="text-dp-muted">{` · ${pctText(share)}`}</span></>}
      </div>
      {trend?.some(Number.isFinite) && (
        <div data-testid="usage-trend" className="flex justify-end mt-1">
          <SeriesBars values={trend} mode="scaled" domain={[0, 1]} height={12} barWidth={3} gap={1} />
        </div>
      )}
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

function AllowsCell({ row, lens }) {
  if (row.player_id == null || row.bye || row.allows == null) {
    return (
      <td data-testid="col-allows" className={`px-2.5 py-2.5 ${lensHidden('matchup', lens)}`}>
        <span className="text-dp-muted text-[12px]">—</span>
      </td>
    )
  }
  const tone = allowsToneClass(row.allowsRank)
  const weightPct = Math.round((row.weight ?? 0) * 100)
  return (
    <td data-testid="col-allows" className={`px-2.5 py-2.5 ${lensHidden('matchup', lens)}`}>
      <div className="flex items-center gap-2">
        <span className={`font-dp-mono text-[14px] font-semibold w-[42px] text-right ${tone}`}>
          {row.allows.toFixed(1)}
        </span>
        <div className="min-w-0">
          <div className={`font-dp-mono text-[10.5px] whitespace-nowrap ${tone}`}>
            {row.allowsRank != null ? `${row.allowsRank} of 32 · all ${row.position}s` : '—'}
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

const f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '—')

// week-w-matchup-flags-visuals.md §2b — the start/sit flag sub-line. Cites both PROJ numbers (and
// OURS beside them); a comparison, not a recommendation.
function flagText(flag) {
  const b = flag.bench
  const label = s => SLOT_LABEL[s] ?? s
  let lead
  if (flag.kind === 'unavailable') {
    lead = flag.cause === 'bye' ? 'BYE' : flag.cause === 'status' ? flag.status : 'No PROJ'
  }
  const via = flag.via
    ? ` two moves: ${flag.via.moveName} ${f1(flag.via.moveProj)} ${label(flag.via.fromSlot)} \u2192 ${label(flag.via.toSlot)}, ${b.name} ${f1(b.proj)} bench \u2192 ${label(flag.via.fromSlot)}`
    : null
  if (flag.kind === 'unavailable') {
    return via ? `${lead} \u00b7${via}` : `${lead} \u00b7 ${b.name} ${f1(b.proj)} PROJ on bench`
  }
  let text = via
    ? `PROJ \u00b7${via}; ${f1(b.proj)} > ${f1(flag.starterProj)}`
    : `PROJ \u00b7 ${b.name} ${f1(b.proj)} on bench > ${f1(flag.starterProj)}`
  if (flag.ours != null) {
    // PROVISIONAL(heuristic): OURS comparison in a lineup flag · compares weeklyOwnProjection.js's heuristic values, not a model verdict · a fitted, graded weekly model would make it real
    const verdict = flag.ours === 'agree' ? 'PROJ and OURS agree' : flag.ours === 'disagree' ? 'PROJ and OURS disagree' : 'OURS level'
    text += ` \u00b7 OURS ${f1(b.ours)} vs ${f1(flag.starterOurs)} \u00b7 ${verdict}`
  }
  return text
}

// week-w2a-lineup-matchup-layout.md §4b — the matchup cells, from matchupCols (weeklyMatchupColumns.js).
const DASH = <span className="text-dp-muted text-[12px]">—</span>

// Copy of OffencesOwned.jsx's fmtPct (not exported); equality pinned by LineupTable.test.jsx.
const signedPct = v => `${v >= 0 ? '+' : MINUS}${Math.abs(v * 100).toFixed(1)}%`

function MatchupTd({ testId, lens, title, children }) {
  return (
    <td data-testid={testId} title={title} className={`px-2.5 py-2.5 text-right font-dp-mono ${lensHidden('matchup', lens)}`}>
      {children}
    </td>
  )
}

function Grey({ children, testId }) {
  return <div data-testid={testId} className="text-[10px] text-dp-muted-2 whitespace-nowrap">{children}</div>
}

function ImpliedCell({ r, c, lens }) {
  if (c?.implied == null) return <MatchupTd testId="col-implied" lens={lens}>{DASH}</MatchupTd>
  const base = c.impliedBaseline
  const title = `Vegas implied points for ${r.team} this week (nflverse schedule: total ÷ 2 ± spread ÷ 2). Grey: difference from his team's average implied total over ${c.impliedBaselineWeeks} earlier games with a line.`
  return (
    <MatchupTd testId="col-implied" lens={lens} title={title}>
      <div className="text-[12px] text-dp-text whitespace-nowrap">{c.implied.toFixed(1)}</div>
      {base != null && (
        <Grey>{`${c.implied >= base ? '+' : MINUS}${Math.abs(c.implied - base).toFixed(1)} vs avg`}</Grey>
      )}
    </MatchupTd>
  )
}

function SpreadCell({ c, lens }) {
  const sp = c?.spread
  if (sp == null) return <MatchupTd testId="col-spread" lens={lens}>{DASH}</MatchupTd>
  const text = Math.abs(sp) < 0.05 ? 'PK' : `${sp > 0 ? '+' : MINUS}${Math.abs(sp).toFixed(1)}`
  return (
    <MatchupTd testId="col-spread" lens={lens}>
      <div className="text-[12px] text-dp-text whitespace-nowrap">{text}</div>
    </MatchupTd>
  )
}

function YardsCell({ c, lens }) {
  const y = c?.yards
  if (!y) return <MatchupTd testId="col-yds" lens={lens}>{DASH}</MatchupTd>
  return (
    <MatchupTd testId="col-yds" lens={lens}>
      <div className="text-[12px] text-dp-text whitespace-nowrap">
        {y.current != null ? <>{Math.round(y.current)}<span className="text-dp-muted">{` ${y.kind}`}</span></> : DASH}
      </div>
      {y.prior != null && <Grey>{`${y.priorSeason ?? 'last season'} · ${Math.round(y.prior)}`}</Grey>}
    </MatchupTd>
  )
}

function RankedCell({ testId, m, lens, format }) {
  if (!m) return <MatchupTd testId={testId} lens={lens}>{DASH}</MatchupTd>
  return (
    <MatchupTd testId={testId} lens={lens}>
      <div className="text-[12px] text-dp-text whitespace-nowrap">{format(m.value)}</div>
      {m.rank != null && <Grey>{`${m.rank} of ${m.of}`}</Grey>}
    </MatchupTd>
  )
}

function ownTitle(own, season) {
  const label = season ?? "this season's"
  if (own.reason === null && own.share != null) {
    const v = own.vegas
    const kind = own.baseKind === 'ros' ? 'rest-of-season' : 'season'
    return `Starting QB this week: ${kind} starter rate ${own.base.toFixed(1)} PPG (the season projection assumes he starts ${Math.round(own.share * 100)}% of remaining games) \u00d7 ${v.factor.toFixed(2)} = ${own.value.toFixed(1)}. The factor is half the percentage difference between this week's Vegas implied team total (${v.implied.toFixed(1)}) and his team's average over ${v.baselineWeeks} earlier ${label} games with a line (${v.baseline.toFixed(1)}). A heuristic, not a model.`
  }
  if (own.reason === null) {
    const kind = own.baseKind === 'ros' ? 'Rest-of-season' : 'Season'
    const v = own.vegas
    return `${kind} projection ${own.base.toFixed(1)} PPG \u00d7 ${v.factor.toFixed(2)} = ${own.value.toFixed(1)}. The factor is half the percentage difference between this week's Vegas implied team total (${v.implied.toFixed(1)}) and his team's average over ${v.baselineWeeks} earlier ${label} games with a line (${v.baseline.toFixed(1)}). A heuristic, not a model.`
  }
  if (own.reason === 'qb-backup') return 'Not his team\u2019s starting QB this week (Sleeper depth chart and injury list) \u2014 no number.'
  if (own.reason === 'qb-no-role') return 'No Sleeper depth chart for his team\u2019s QBs \u2014 can\u2019t tell who starts, no number.'
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
function OwnCell({ own, thisSeason, oursPending }) {
  let top
  if (oursPending) {
    top = <span data-testid="ours-pending" className="text-dp-muted">…</span>
  } else if (own?.value != null) {
    top = <span className="text-dp-text-2">{own.value.toFixed(1)}</span>
  } else if (own?.reason === 'out') {
    top = <span className="text-[11px] text-dp-muted">OUT</span>
  } else {
    top = <span className="text-dp-muted">—</span>
  }
  const title = oursPending
    ? 'Season projections not available yet — OURS fills in when they arrive.'
    : own ? ownTitle(own, thisSeason) : undefined
  return (
    <td data-testid="col-ours" className="px-2.5 py-2.5 text-right" title={title}>
      <div className="font-dp-mono text-[13px]">{top}</div>
    </td>
  )
}

function LineupRow({ r, i, flag = null, priorSnapByPlayer, ownByPlayer, matchupCols, oursPending, lastSeason, thisSeason, onOpenPlayerDetail, lens, stripByPlayer, usageTrendByPlayer, percentileBasis }) {
  const own = ownByPlayer?.[r.player_id] ?? null
  const c = matchupCols?.[r.player_id] ?? null
  const t = usageTrendByPlayer?.[r.player_id] ?? null
  const s = stripByPlayer?.[r.player_id]
  const cells = (
    <>
      <td data-testid="col-slot" className={`pl-[18px] pr-1 py-2.5 font-dp-mono text-[10.5px] text-dp-muted ${FROZEN_SLOT_W} ${FROZEN_FIRST} bg-dp-card ${FROZEN_ROW_HOVER}`}>
        <span className={FROZEN_SLOT_INNER} title={r.slot}>{SLOT_LABEL[r.slot] ?? r.slot}</span>
      </td>
      <td data-testid="col-player" className={`px-2.5 py-2.5 ${FROZEN_SECOND} bg-dp-card ${FROZEN_ROW_HOVER} ${FROZEN_EDGE}`}>
        {r.player_id == null ? (
          <span className="text-dp-muted text-[12px]">Empty</span>
        ) : (
          <PlayerCell
            row={{ player_id: r.player_id, full_name: r.name, position: r.position, nfl_team: r.team }}
            showPosition={false}
            photoFromMd
            className="max-w-[168px] md:max-w-none"
            marker={
              <span className="ml-1.5 shrink-0 flex items-center gap-1.5">
                <StatusChip status={r.injuryStatus} bodyPart={r.injuryBodyPart} />
                {/* PROVISIONAL(heuristic): BACKUP chip hidden for a QB starting this week · reads OURS's qbRole (lowest Sleeper depth order not listed out), no game-day confirmation · a confirmed weekly-starter source would make it real */}
                {r.backup && own?.qbRole !== 'starter' && (
                  <span
                    data-testid="backup-flag"
                    title={`Depth chart: ${r.depth.position}${r.depth.order}`}
                    className="font-dp-mono text-[9px] tracking-[0.08em] text-dp-text-4 border border-dp-border-raised rounded px-1"
                  >
                    BACKUP
                  </span>
                )}
              </span>
            }
            sub={
              <span title="Rank by total points in this league's scoring; overall is among QB, RB, WR and TE">
                {rankLine(r, lastSeason, thisSeason)}
              </span>
            }
            footer={flag && (
              <div
                id={`startsit-flag-${flag.slotIndex}`}
                data-testid="startsit-flag"
                title="Comparison by Sleeper's weekly projection (PROJ); OURS shown alongside. Not a recommendation."
                className="text-[10.5px] text-dp-down-text md:whitespace-nowrap"
              >
                {flagText(flag)}
              </div>
            )}
          />
        )}
      </td>
      <td data-testid="col-proj" className="px-3 py-2.5 font-dp-mono text-[16px] font-semibold text-dp-text text-right bg-dp-accent-bg">
        {r.points != null ? r.points.toFixed(1) : '—'}
      </td>
      <OwnCell own={own} thisSeason={thisSeason} oursPending={oursPending && r.player_id != null} />
      <td data-testid="col-vs" className="px-2.5 py-2.5 border-l border-dp-border-row">
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
      <ImpliedCell r={r} c={c} lens={lens} />
      <SpreadCell c={c} lens={lens} />
      <AllowsCell row={r} lens={lens} />
      <YardsCell c={c} lens={lens} />
      <RankedCell testId="col-pace" m={c?.pace} lens={lens} format={v => `${v.toFixed(1)}s`} />
      <RankedCell testId="col-proe" m={c?.proe} lens={lens} format={signedPct} />
      <UsageCell testId="col-rush" count={r.counts?.rush ?? null} share={r.usage?.rush ?? null} trend={t?.shareKind === 'rush' ? t.share : null} lens={lens} />
      <UsageCell testId="col-target" count={r.counts?.target ?? null} share={r.usage?.target ?? null} trend={t?.shareKind === 'target' ? t.share : null} lens={lens} />
      <UsageCell testId="col-touch" count={r.counts?.touch ?? null} share={r.usage?.touch ?? null} lens={lens} />
      <UsageCell testId="col-rzrush" count={r.counts?.rzRush ?? null} share={r.usage?.rzRush ?? null} lens={lens} />
      <UsageCell testId="col-rztgt" count={r.counts?.rzTarget ?? null} share={r.usage?.rzTarget ?? null} lens={lens} />
      <UsageCell
        testId="col-snap"
        count={r.counts?.snap ?? null}
        share={r.usage?.snap ?? null}
        priorShare={priorSnapByPlayer?.[r.player_id] ?? null}
        priorSeason={lastSeason}
        trend={t?.snap ?? null}
        lens={lens}
      />
      <td data-testid="col-weeks" className={`px-2.5 py-2.5 pr-[18px] ${lensHidden('usage', lens)}`}>
        {r.player_id == null ? (
          <span className="text-dp-muted text-[12px]">—</span>
        ) : (
          <WeeklyStrip cells={s?.cells ?? []} position={s?.position ?? r.position} percentileBasis={percentileBasis} />
        )}
      </td>
    </>
  )
  if (r.player_id == null) {
    return <tr key={`${r.slot}-${i}`} className="border-t border-dp-border-row">{cells}</tr>
  }
  return <ClickableRow row={r} onOpen={onOpenPlayerDetail}>{cells}</ClickableRow>
}

export function LineupTable({
  starters = [], bench = [], loading = false, priorSnapByPlayer = {}, ownByPlayer = {}, matchupCols = {},
  oursPending = false, defenceSeason = null,
  onOpenPlayerDetail = () => {}, lastSeason = null, thisSeason = null, startSit = null, legendLead = null,
  stripByPlayer = {}, usageTrendByPlayer = {}, percentileBasis = null,
}) {
  if (loading) {
    return (
      <div className="bg-dp-card border border-dp-border rounded-[12px] py-10 text-center text-dp-muted text-sm">
        Loading this week…
      </div>
    )
  }

  return <LineupTableBody {...{ starters, bench, priorSnapByPlayer, ownByPlayer, matchupCols, oursPending, defenceSeason, onOpenPlayerDetail, lastSeason, thisSeason, startSit, legendLead, stripByPlayer, usageTrendByPlayer, percentileBasis }} />
}

const COLUMN_COUNT = 18

function LineupTableBody({ starters, bench, priorSnapByPlayer, ownByPlayer, matchupCols, oursPending, defenceSeason, onOpenPlayerDetail, lastSeason, thisSeason, startSit, legendLead, stripByPlayer, usageTrendByPlayer, percentileBasis }) {
  const [lens, setLens] = useState('matchup')
  const flagsBySlot = new Map((startSit?.flags ?? []).map(f => [f.slotIndex, f]))
  const rowProps = { priorSnapByPlayer, ownByPlayer, matchupCols, oursPending, lastSeason, thisSeason, onOpenPlayerDetail, lens, stripByPlayer, usageTrendByPlayer, percentileBasis }
  const TH = 'font-dp-mono text-[10px] tracking-[0.08em] font-medium text-dp-muted whitespace-nowrap px-2.5 py-2.5'
  return (
    <div className="bg-dp-card border border-dp-border rounded-[12px] overflow-hidden">
      <div className="flex items-baseline gap-2.5 px-[18px] py-3 border-b border-dp-border-row flex-wrap">
        <span className="text-[13px] font-semibold text-dp-text-strong">The lineup</span>
        <span className="text-[11.5px] text-dp-muted">
          {starters.length} slots as set in Sleeper, then the bench · matchup, usage and form beside each
        </span>
        <div className="ml-auto">
          <LensSwitch lenses={LINEUP_LENSES} value={lens} onChange={setLens} label="Lineup columns" />
        </div>
      </div>
      <FrozenScroll>
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-dp-card-quiet border-b border-dp-border">
              <th className={`${TH} pl-[18px] pr-1 ${FROZEN_SLOT_W} ${FROZEN_FIRST} bg-dp-card-quiet`}></th>
              <th className={`${TH} text-left ${FROZEN_SECOND} bg-dp-card-quiet ${FROZEN_EDGE}`}>PLAYER</th>
              <th className={`${TH} text-right text-dp-text px-3`}>PROJ</th>
              <th
                className={`${TH} text-right`}
                title="Our number: the season projection nudged by this week's Vegas implied team total. A heuristic, not a model. A QB is valued only if he starts this week."
              >
                OURS
              </th>
              <th className={`${TH} text-left`}>VS</th>
              <th
                className={`${TH} text-right ${lensHidden('matchup', lens)}`}
                title="His team's Vegas implied points this week. The one matchup input our backtest found useful (OURS uses it)."
              >
                IMPLIED
              </th>
              <th
                className={`${TH} text-right ${lensHidden('matchup', lens)}`}
                title="His team's point spread this week: negative means favoured (−3.0 = expected to win by 3). Opponent's implied total minus his team's."
              >
                SPREAD
              </th>
              <th
                className={`${TH} text-left ${lensHidden('matchup', lens)}`}
                title="Opponent defence: fantasy points per game it allows to all players at his position combined (every WR, split backfields in full), blended with last season, in this league's scoring. A group total — not comparable to one player's PROJ. Rank 1 is the toughest of 32."
              >
                ALLOWED / G
              </th>
              <th
                className={`${TH} text-right ${lensHidden('matchup', lens)}`}
                title={`Opponent's yards allowed per game for his play type — passing (net of sacks) for QB, WR and TE, rushing for RB — ${thisSeason ?? 'this season'} so far; grey is ${defenceSeason ?? 'last season'}.`}
              >
                YDS ALLOWED
              </th>
              <th
                className={`${TH} text-right ${lensHidden('matchup', lens)}`}
                title={`His team's seconds per play in neutral situations, ${thisSeason ?? 'this season'} so far (nflverse team context). Rank 1 is the fastest.`}
              >
                PACE
              </th>
              <th
                className={`${TH} text-right ${lensHidden('matchup', lens)}`}
                title={`His team's pass rate over expected, ${thisSeason ?? 'this season'} so far. Rank 1 is the most pass-leaning.`}
              >
                PROE
              </th>
              <th className={`${TH} text-right ${lensHidden('usage', lens)}`} title="Carries · share of team rush attempts">RUSH</th>
              <th className={`${TH} text-right ${lensHidden('usage', lens)}`} title="Targets · share of team pass attempts">TARGET</th>
              <th className={`${TH} text-right ${lensHidden('usage', lens)}`} title="Carries + receptions · share of team rush + pass attempts">TOUCH</th>
              <th className={`${TH} text-right ${lensHidden('usage', lens)}`} title="Red-zone carries · share of team red-zone rush attempts">RZ RUSH</th>
              <th className={`${TH} text-right ${lensHidden('usage', lens)}`} title="Red-zone targets · share of team red-zone pass attempts">RZ TGT</th>
              <th className={`${TH} text-right ${lensHidden('usage', lens)}`} title={`Offensive snaps · share of his team's; the grey line is ${lastSeason ?? 'last season'}`}>SNAP</th>
              <th className={`${TH} text-left pr-[18px] ${lensHidden('usage', lens)}`} title="Points in each completed week, coloured by rank among this league's starters at his position (cut-offs in the season grid legend). Ticked: his last three played weeks.">
                {thisSeason != null ? `${thisSeason} WEEKS` : 'WEEKS'}
              </th>
            </tr>
          </thead>
          <tbody>
            {starters.map((r, i) => <LineupRow key={`starter-${r.slot}-${i}`} r={r} i={i} flag={flagsBySlot.get(i) ?? null} {...rowProps} />)}
            {bench.length > 0 && (
              <tr>
                <td colSpan={COLUMN_COUNT} className="px-[18px] py-1.5 border-t border-dp-border-row bg-dp-card-quiet font-dp-mono text-[9px] tracking-[0.1em] text-dp-muted">
                  BENCH · {bench.length}
                </td>
              </tr>
            )}
            {bench.map((r, i) => <LineupRow key={`bench-${r.player_id}-${i}`} r={r} i={i} {...rowProps} />)}
          </tbody>
        </table>
      </FrozenScroll>
      <details data-testid="lineup-legend" className="px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet">
        <summary className="cursor-pointer select-none text-[11.5px] text-dp-text-4 hover:text-dp-text-2 w-fit">How to read these columns</summary>
      {legendLead && <div className="pt-2.5">{legendLead}</div>}
      <div className="flex gap-6 pt-2.5 flex-wrap">
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          ALLOWED / G is the opponent defence&rsquo;s fantasy points per game allowed to all players
          at that position combined &mdash; every WR&rsquo;s points against it that season, divided by
          its games, with split backfields counted in full &mdash; blended with last season, in this
          league&rsquo;s scoring (Sleeper weekly stat lines, scored with your settings). It is a group
          total, not comparable to one player&rsquo;s PROJ. Rank 1 is the toughest of 32; the bar
          beneath is how much of the blend is the current season.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          IMPLIED is his team&rsquo;s Vegas implied points this week, with the difference from his
          team&rsquo;s average implied total in earlier weeks. SPREAD is his team&rsquo;s point spread
          (negative = favoured). YDS ALLOWED is the opponent&rsquo;s passing yards (net of sacks) per
          game for a QB, WR or TE and rushing yards per game for an RB, this season so far, with last
          season in grey. PACE is his team&rsquo;s seconds per play in neutral situations and PROE its
          pass rate over expected, this season, ranked across the league. Only the implied total has
          backtest support here (OURS uses it); scaling by ALLOWED made projections worse. The rest are
          context, untested.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          Each usage cell is a count over the weeks he played, then its share. RUSH is carries ÷ team
          rush attempts, TARGET is targets ÷ team pass attempts, TOUCH is (carries + receptions) ÷
          (team rush + pass attempts) — attempts, not plays: they exclude sacks and include kneels. RZ
          RUSH and RZ TGT are the same inside the opponent&rsquo;s 20: red-zone carries ÷ team red-zone
          rush attempts, red-zone targets ÷ team red-zone pass attempts. SNAP is{' '}
          <span className="font-dp-mono text-dp-text-4">off_snp</span> ÷ that player&rsquo;s own{' '}
          <span className="font-dp-mono text-dp-text-4">tm_off_snp</span>; the grey line beneath is{' '}
          {lastSeason ?? 'last season'}. All live and weekly from the Sleeper stats endpoint. Under
          SNAP, and under TARGET for a WR or TE and RUSH for an RB, a small grey trend shows that
          share week by week on a 0–100% scale; a dashed slot is a week with no observation (did not
          play, bye, or not loaded), a short stub a real zero.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          {thisSeason ?? 'This season'} WEEKS has one bar per completed week: height is his points that
          week, colour is how that week ranked among this league&rsquo;s starters at his position —
          the same scale and cut-offs as the season grid below. Hatched is a bye, a red square at the
          top a week he did not play, a dashed slot a week that did not load. The three ticked bars
          are his last three played weeks.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          Under each name: position rank last season and this season, and overall rank this season
          among QB, RB, WR and TE — all by total points in this league&rsquo;s scoring (the same basis as My
          Team&rsquo;s position ranks). BACKUP marks a player listed second or lower on his
          NFL depth chart (for a QB, unless the one above him is listed out, so he starts this week) &mdash; for WR and TE only while his snap share this season is under 50%,
          since Sleeper lists receivers by side.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          OURS is a stand-in, not a model: our season projection (rest of season once this
          season&rsquo;s games count), moved by half the percentage difference between this
          week&rsquo;s Vegas implied team total and his team&rsquo;s average implied total in earlier
          weeks. In a 2024&ndash;25 backtest (weeks 5&ndash;18) that nudge beat no nudge by under 1%,
          scaling fully by ALLOWED / G made it worse (so ALLOWED / G is shown but not used), and Sleeper&rsquo;s
          PROJ was 2&ndash;4% more accurate. A quarterback counts only if he is his
          team&rsquo;s starter this week &mdash; the top QB on Sleeper&rsquo;s depth chart not listed
          out &mdash; and is then valued at his starter rate rather than his rest-of-season average,
          which assumes he may not start every game. Other QBs are blank. Blank when any input is missing; OUT when Sleeper lists
          him out. The implied total it uses is in the IMPLIED column.
        </span>
        <span className="text-[11px] text-dp-muted leading-relaxed flex-1 min-w-[260px]">
          Lineup flags compare Sleeper&rsquo;s weekly projection (PROJ) only: a flag marks a starter
          when a bench player eligible for that slot projects higher, or when the starter is on a
          bye, listed Doubtful or worse, or has no PROJ while an eligible bench player has one. OURS
          is shown beside it, and whether the two agree. A &ldquo;two moves&rdquo; flag is the same
          comparison when it only works if one starter changes slots first (e.g. a WR in FLEX moves
          to WR so a bench RB can take FLEX); only one such move is checked. A bench player can
          appear in more than one flag. Nothing is swapped, reordered or recommended.
        </span>
      </div>
      </details>
    </div>
  )
}
