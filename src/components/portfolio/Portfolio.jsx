import { useCallback, useMemo, useState } from 'react'
import { PlayerCell, ClickableRow, DeltaCell } from '../dp/cells'
import { DefinitionPopover } from '../dp/DefinitionPopover'
import { deriveLiveSeasons, reconstructPickOwnership } from '../../utils/tradedPicks'
import { pickPrice } from '../../utils/ktcPicks'
import {
  buildLeagueLineups, buildPositionLadders, buildSlotMedians, startingBar,
} from '../../utils/lineup'
import { rankPositionSeason } from '../../utils/seasonRanks'
import { buildUsageHistory } from '../../utils/outlookUsage'
import { buildTeamShareTotals, buildPerSeasonTeamShares } from '../../utils/outlookPositionStats'
import { buildAvailabilityGrid, STATUS_LABEL } from '../../utils/availabilityGrid'
import { deriveDataSeason } from '../../utils/environment'

// My Team (src/components/portfolio/Portfolio.jsx) — Portfolio Slice B. The /portfolio screen:
// header (title, meta line, summary sentence, three lineup tiles), Starting ten (this league's
// best-scoring lineup by projected points) and Bench (everyone else, plus draft-pick holdings).
// View-layer only — nothing here feeds `playerRows`, projections or the dynasty score.
//
// Picks (dp-v2 Slice 7 lineage) — reconstructed ownership + KTC pricing, unchanged from the prior
// Portfolio screen. They render as Bench rows (no lineup concept — picks are never starters).

const VS_MEDIAN_FAR_BELOW = -4
const BENCH_COLLAPSED_ROWS = 10
const EMPTY_FACTS = { last: null, posRank: null, weeks: null, played: null, missed: null, share: null, snap: null, role: null, status: null }

const SLOT_LABEL = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', FLEX: 'FLX', SUPER_FLEX: 'SF' }
const slotLabel = s => SLOT_LABEL[s] ?? s

const ABBR = { Questionable: 'Q', Doubtful: 'D', Out: 'OUT', IR: 'IR', PUP: 'PUP', Sus: 'SUS' }

const INJURY_CLAUSES = [
  ['Questionable', n => `${n} questionable now`],
  ['Doubtful', n => `${n} doubtful now`],
  ['Out', n => `${n} out now`],
  ['IR', n => `${n} on IR now`],
  ['PUP', n => `${n} on PUP now`],
  ['Sus', n => `${n} suspended now`],
]

function ordinal(n) {
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  switch (n % 10) {
    case 1: return `${n}st`
    case 2: return `${n}nd`
    case 3: return `${n}rd`
    default: return `${n}th`
  }
}

// Pick holdings (dp-v2 Slice 7 §4/§7) — the ASSET-column analogue of PlayerCell. A pick carries
// no position/age/team, so it gets its own small cell rather than forcing PlayerCell to grow
// optional fields for a shape it was never meant to describe.
function PickCell({ row }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="font-dp-mono text-[10px] w-[26px] text-center py-0.5 rounded bg-dp-chip text-dp-text-3 shrink-0">
        PICK
      </span>
      <div className="min-w-0">
        <div className="font-semibold text-dp-text truncate">{row.season} {ordinal(row.round)}</div>
        <div className="text-[11px] text-dp-muted truncate">
          {row.tradedFromName ? `via ${row.tradedFromName}` : 'own pick'}
        </div>
      </div>
    </div>
  )
}

// The Early–Late range (§7) — three tier prices for ONE asset, not a league percentile
// distribution. Deliberately carried in `gloss`/`field`, never `percentiles` (that prop is
// `{p10,p50,p90,subject}` and DefinitionPopover would render a subject marker that means nothing
// for three tiers of one pick).
function PickValueCell({ row, maxOwnedKtc }) {
  if (row.ktcValue == null) {
    return (
      // PROVISIONAL(no-data): this pick's value · KTC's snapshot has no row for round 5+ ·
      // nothing will — KTC prices rounds 1–4 only.
      <span className="text-dp-muted text-xs block text-right" title="KTC prices rounds 1–4 only">—</span>
    )
  }
  const gloss = `Early ${row.earlyPrice != null ? row.earlyPrice.toLocaleString() : '—'}`
    + ` · Mid ${row.ktcValue.toLocaleString()}`
    + ` · Late ${row.latePrice != null ? row.latePrice.toLocaleString() : '—'}`
    + ' — priced at Mid'
  return (
    <DefinitionPopover
      term={`${row.season} ${ordinal(row.round)}`}
      gloss={gloss}
      field={`KTC "${row.season} Mid ${ordinal(row.round)}" — untraded picks price at Mid`}
    >
      <div className="flex items-center gap-2.5 justify-end">
        <div className="flex-1 h-1.5 rounded-[3px] bg-dp-border-row overflow-hidden">
          <div className="h-1.5 rounded-[3px] bg-dp-up" style={{ width: `${Math.max(0, Math.min(100, (row.ktcValue / maxOwnedKtc) * 100))}%` }} />
        </div>
        <span className="font-dp-mono text-xs text-dp-text w-[46px] text-right">{row.ktcValue.toLocaleString()}</span>
      </div>
    </DefinitionPopover>
  )
}

// §4.4 — shared cell renderers. Each renders "—" for null.
function PpgPairCell({ last, proj, scaleMax }) {
  const barWidth = v => (v == null || v <= 0 ? 0 : Math.min(100, (v / scaleMax) * 100))
  return (
    <div className="w-[130px]">
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1.5 rounded-[3px] bg-dp-border-row overflow-hidden">
          <div className="h-1.5 rounded-[3px] bg-dp-slate" style={{ width: `${barWidth(last)}%` }} />
        </div>
        <span className="font-dp-mono text-[10.5px] text-dp-text-5 w-[30px] text-right">
          {last != null ? last.toFixed(1) : '—'}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <div className="flex-1 h-1.5 rounded-[3px] bg-dp-border-row overflow-hidden">
          <div className="h-1.5 rounded-[3px] bg-dp-up" style={{ width: `${barWidth(proj)}%` }} />
        </div>
        <span className="font-dp-mono text-[10.5px] font-semibold text-dp-text w-[30px] text-right">
          {proj != null ? proj.toFixed(1) : '—'}
        </span>
      </div>
    </div>
  )
}

const WEEK_CELL_CLASS = {
  P: 'bg-dp-up-border',
  D: 'bg-dp-down-bg-strong',
  B: 'border border-dashed border-dp-slate-2',
  X: 'border border-dashed border-dp-slate-2',
}

function GamesStripCell({ weeks, played, missed }) {
  if (weeks === null) return <span className="text-dp-muted">—</span>
  return (
    <div className="flex items-center gap-2">
      <div className="flex" style={{ gap: '1.5px' }}>
        {weeks.map((code, i) => (
          <div
            key={i}
            title={`WK ${i + 1} · ${STATUS_LABEL[code]}`}
            className={`w-[5px] h-[12px] rounded-[1px] ${WEEK_CELL_CLASS[code]}`}
          />
        ))}
      </div>
      <span className="font-dp-mono text-[10.5px] text-dp-text-5">{played}/{played + missed}</span>
    </div>
  )
}

function PctCell({ value }) {
  if (value == null) return <span className="text-dp-muted">—</span>
  return <>{Math.round(value * 100)}%</>
}

function StatusCell({ status }) {
  if (status == null) return <span className="text-dp-muted">—</span>
  const text = (ABBR[status.status] ?? status.status.toUpperCase())
    + (status.bodyPart ? ` · ${status.bodyPart.toUpperCase()}` : '')
  return (
    <span className="font-dp-mono text-[10px] tracking-[0.04em] rounded px-1.5 py-0.5 text-dp-down-text bg-dp-down-bg">
      {text}
    </span>
  )
}

// PROVISIONAL(no-data): GAME SCRIPT · the team-metrics slice (Slice D) has not landed · wire
// computeTeamSeasonMetrics margin + PROE here
function ScriptCell() {
  return <span className="text-dp-muted">—</span>
}

function KtcCell({ value }) {
  if (value == null) return <span className="text-dp-muted text-right block">—</span>
  return <span className="font-dp-mono text-dp-muted text-right block">{value.toLocaleString()}</span>
}

function VsMedianCell({ proj, bar }) {
  if (proj == null || bar == null) return <span className="text-dp-muted">—</span>
  const g = proj - bar.median
  const text = `${g >= 0 ? '+' : '−'}${Math.abs(g).toFixed(1)} vs ${slotLabel(bar.slot)}`
  const cls = g >= 0 ? 'text-dp-up-text' : g <= VS_MEDIAN_FAR_BELOW ? 'text-dp-down-text' : 'text-dp-muted'
  return <span className={cls}>{text}</span>
}

// §4.4 header cell classes, shared by both tables.
const TH_CLASS = 'px-[10px] py-2 first:pl-[18px] last:pr-[18px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-dp-muted-2 whitespace-nowrap'
const DIVIDER = 'border-l border-dp-border-row'

function formatScoring(rec) {
  if (rec === 1) return 'PPR'
  if (rec === 0.5) return 'half-PPR'
  if (rec === 0) return 'standard'
  if (Number.isFinite(rec)) return `${rec}-PPR`
  return null
}

export function Portfolio({
  playerRows = [], loaded = false, rosterTeams = [], seasonProjections = null,
  myTeamName = null, onOpenPlayerDetail = () => {},
  tradedPicks = null, ktcPickTable = null, firstLiveDraftSeason = null, draftRounds = null,
  careerStats = null, playerMap = null,
  rosterPositions = [], scoringSettings = null, leagueName = null,
}) {
  // §1 — ownership is the whole screen's filter, derived once.
  const ownedRows = useMemo(
    () => (myTeamName == null ? [] : (playerRows ?? []).filter(r => r.ownerTeamName === myTeamName)),
    [playerRows, myTeamName]
  )

  // ── Pick ownership, league-wide (every roster, not just mine) ────────────────────────────
  const liveSeasons = useMemo(
    () => deriveLiveSeasons(firstLiveDraftSeason, ktcPickTable),
    [firstLiveDraftSeason, ktcPickTable]
  )
  const allPickOwnership = useMemo(
    () => reconstructPickOwnership({ rosterTeams, tradedPicks, liveSeasons, draftRounds }),
    [rosterTeams, tradedPicks, liveSeasons, draftRounds]
  )
  const rosterNameById = useMemo(
    () => new Map(rosterTeams.map(t => [t.rosterId, t.teamName])),
    [rosterTeams]
  )
  const myRosterId = useMemo(
    () => rosterTeams.find(t => t.teamName === myTeamName)?.rosterId ?? null,
    [rosterTeams, myTeamName]
  )
  const myPickRows = useMemo(() => {
    if (myRosterId == null) return []
    return allPickOwnership
      .filter(p => p.ownerRosterId === myRosterId)
      .map(p => {
        const tradedFromName = p.originalRosterId !== p.ownerRosterId
          ? (rosterNameById.get(p.originalRosterId) ?? null)
          : null
        return {
          kind: 'pick',
          // originalRosterId, not just (season, round) — a roster can own more than one pick in
          // the same round (e.g. two acquired 2nd-rounders), and (season, round) alone would
          // collide both a React key and this row's own data-testid.
          id: `pick-${p.season}-${p.round}-${p.originalRosterId}`,
          season: p.season,
          round: p.round,
          tradedFromName,
          full_name: `${p.season} ${ordinal(p.round)}`,
          ktcValue: pickPrice(ktcPickTable, p.season, p.round, 'Mid'),
          earlyPrice: pickPrice(ktcPickTable, p.season, p.round, 'Early'),
          latePrice: pickPrice(ktcPickTable, p.season, p.round, 'Late'),
          age: null,
        }
      })
  }, [allPickOwnership, myRosterId, rosterNameById, ktcPickTable])

  const myPricedPickRows = useMemo(() => myPickRows.filter(p => p.ktcValue != null), [myPickRows])

  // ── §4.2 — derived data ───────────────────────────────────────────────────────────────────
  const dataSeason = useMemo(() => deriveDataSeason(careerStats), [careerStats])
  const projSeason = dataSeason != null ? dataSeason + 1 : null

  const leagueLineups = useMemo(
    () => buildLeagueLineups({ rosterTeams, careerStats, seasonProjections, rosterPositions, season: dataSeason }),
    [rosterTeams, careerStats, seasonProjections, rosterPositions, dataSeason]
  )
  const ladders = useMemo(() => buildPositionLadders(leagueLineups, myRosterId), [leagueLineups, myRosterId])
  const ladderBy = useMemo(() => Object.fromEntries(ladders.map(l => [l.pos, l])), [ladders])
  const teamCount = leagueLineups.length

  const slotMedians = useMemo(() => buildSlotMedians(leagueLineups, 'proj'), [leagueLineups])
  const myLineup = useMemo(
    () => leagueLineups.find(l => l.rosterId === myRosterId)?.proj ?? null,
    [leagueLineups, myRosterId]
  )

  const rowById = useMemo(() => new Map(ownedRows.map(r => [r.player_id, r])), [ownedRows])

  const rankByPos = useMemo(() => {
    if (careerStats == null || playerMap == null || dataSeason == null) return {}
    const seasonData = careerStats[dataSeason]
    if (seasonData == null) return {}
    const out = {}
    for (const pos of ['QB', 'RB', 'WR', 'TE']) out[pos] = rankPositionSeason(seasonData, playerMap, pos)
    return out
  }, [careerStats, playerMap, dataSeason])

  const teamShareTotals = useMemo(
    () => buildTeamShareTotals(careerStats ?? {}, playerMap ?? {}),
    [careerStats, playerMap]
  )
  const perSeasonTeamShares = useMemo(
    () => buildPerSeasonTeamShares(careerStats ?? {}, teamShareTotals, playerMap ?? {}),
    [careerStats, teamShareTotals, playerMap]
  )

  const playerFactsById = useMemo(() => {
    const ids = new Set()
    if (myLineup) for (const s of myLineup.slots) { if (s.player_id != null) ids.add(s.player_id) }
    for (const r of ownedRows) ids.add(r.player_id)

    const map = new Map()
    for (const id of ids) {
      const row = rowById.get(id)
      const position = row?.position ?? myLineup?.slots.find(s => s.player_id === id)?.position ?? null

      const last = rankByPos[position]?.get(id)?.ppg ?? null
      const rankEntry = rankByPos[position]?.get(id)
      const posRank = rankEntry ? `${position}${rankEntry.rank}` : null

      let weeks = null, played = null, missed = null
      if (careerStats?.[dataSeason]?.[id] !== undefined && dataSeason != null) {
        weeks = buildAvailabilityGrid(careerStats, id, [dataSeason]).rows[0].weeks
        played = weeks.filter(w => w === 'P').length
        missed = weeks.filter(w => w === 'D').length
      }

      const usage = buildUsageHistory(id, position, careerStats, perSeasonTeamShares).find(e => e.season === dataSeason)
      const share = usage?.share ?? null
      const snap = usage?.snapPct ?? null

      const p = playerMap?.[id]
      const role = p?.depth_chart_position && p?.depth_chart_order != null
        ? `${p.depth_chart_position}${p.depth_chart_order}`
        : null
      const status = p?.injury_status ? { status: p.injury_status, bodyPart: p.injury_body_part ?? null } : null

      map.set(id, { last, posRank, weeks, played, missed, share, snap, role, status })
    }
    return map
  }, [myLineup, ownedRows, rowById, rankByPos, careerStats, dataSeason, perSeasonTeamShares, playerMap])

  const factsFor = useCallback(id => playerFactsById.get(id) ?? EMPTY_FACTS, [playerFactsById])

  // ── §4.3 header ────────────────────────────────────────────────────────────────────────────
  const metaParts = useMemo(() => {
    const parts = []
    if (myTeamName != null) parts.push(myTeamName)
    if (leagueName != null) parts.push(leagueName)
    if (teamCount > 0) {
      const qbFormat = (rosterPositions ?? []).includes('SUPER_FLEX')
        ? 'superflex'
        : (rosterPositions ?? []).filter(s => s === 'QB').length >= 2
          ? '2QB'
          : '1QB'
      parts.push(`${teamCount}-team ${qbFormat}`)
    }
    const scoringPart = formatScoring(scoringSettings?.rec)
    if (scoringPart != null) parts.push(scoringPart)
    return parts
  }, [myTeamName, leagueName, teamCount, rosterPositions, scoringSettings])

  const f1 = v => v.toFixed(1)

  const summarySentence = useMemo(() => {
    const L = ladderBy.Lineup
    if (!L) return null
    const s1Ready = L.lastMine != null && L.lastRank != null
    const s2Ready = L.projMine != null && L.projRank != null
    if (!s1Ready && !s2Ready) return null

    // Every literal text fragment below is a plain JS string, never bare JSX text — JSX collapses
    // and trims whitespace around line breaks, which would silently eat the spaces this sentence
    // depends on for an exact-text assertion.
    const parts = []
    if (s1Ready) {
      parts.push('Your starting ten scored ')
      parts.push(<span key="lastMine" className="font-dp-mono font-semibold text-dp-text">{f1(L.lastMine)}</span>)
      parts.push(` points a week last season, ${ordinal(L.lastRank)} of ${teamCount}.`)
    }
    if (s2Ready) {
      parts.push(s1Ready ? ' ' : '')
      parts.push(s1Ready ? 'Projected ' : 'Your starting ten is projected ')
      parts.push(<span key="projMine" className="font-dp-mono font-semibold text-dp-up-text">{f1(L.projMine)}</span>)
      parts.push(s1Ready
        ? ` for ${projSeason}, ${ordinal(L.projRank)}.`
        : ` for ${projSeason}, ${ordinal(L.projRank)} of ${teamCount}.`)
    }

    let s3 = null
    if (s2Ready) {
      const third = Math.ceil(teamCount / 3)
      const groups = ['QB', 'RB', 'WR', 'TE'].filter(g => ladderBy[g]?.projRank != null)
      const CARRY = {
        QB: 'The quarterbacks carry it', RB: 'The backfield carries it',
        WR: 'The wide receivers carry it', TE: 'The tight end carries it',
      }
      const DRAG_TOP = {
        QB: 'the quarterbacks are what keep it out of the top half', RB: 'the backfield is what keeps it out of the top half',
        WR: 'the wide receivers are what keep it out of the top half', TE: 'the tight end is what keeps it out of the top half',
      }
      const DRAG_WEAK = {
        QB: 'the quarterbacks are the weak spot', RB: 'the backfield is the weak spot',
        WR: 'the wide receivers are the weak spot', TE: 'the tight end is the weak spot',
      }

      let carryGroup = null
      const minRank = Math.min(...groups.map(g => ladderBy[g].projRank))
      const minGroups = groups.filter(g => ladderBy[g].projRank === minRank)
      if (minGroups.length === 1 && minRank <= third) carryGroup = minGroups[0]

      let dragGroup = null
      const maxRank = Math.max(...groups.map(g => ladderBy[g].projRank))
      const maxGroups = groups.filter(g => ladderBy[g].projRank === maxRank)
      if (maxGroups.length === 1 && maxRank > teamCount - third && maxGroups[0] !== carryGroup) dragGroup = maxGroups[0]

      const topHalfForm = L.projRank > teamCount / 2

      if (carryGroup && dragGroup) {
        const dragText = topHalfForm ? DRAG_TOP[dragGroup] : DRAG_WEAK[dragGroup]
        s3 = ` ${CARRY[carryGroup]}; ${dragText}.`
      } else if (carryGroup) {
        s3 = ` ${CARRY[carryGroup]}.`
      } else if (dragGroup) {
        const dragText = topHalfForm ? DRAG_TOP[dragGroup] : DRAG_WEAK[dragGroup]
        s3 = ` ${dragText.charAt(0).toUpperCase()}${dragText.slice(1)}.`
      }
    }

    return (
      <>
        {parts}
        {s3}
      </>
    )
  }, [ladderBy, teamCount, projSeason])

  const thirdForTiles = Math.ceil(teamCount / 3)
  const rankClass = r => (r <= thirdForTiles ? 'text-dp-up-text' : r > teamCount - thirdForTiles ? 'text-dp-down-text' : 'text-dp-text-5')

  const gamesMissedTile = useMemo(() => {
    const L = ladderBy.Lineup
    const starterIds = (myLineup?.slots ?? []).filter(s => s.player_id != null).map(s => s.player_id)
    let missedSum = 0, totalSum = 0, any = false
    for (const id of starterIds) {
      const f = factsFor(id)
      if (f.weeks === null) continue
      any = true
      missedSum += f.missed
      totalSum += f.played + f.missed
    }
    const injuryCounts = new Map()
    if (playerMap != null) {
      for (const id of starterIds) {
        const status = factsFor(id).status
        if (status == null) continue
        injuryCounts.set(status.status, (injuryCounts.get(status.status) ?? 0) + 1)
      }
    }
    const injuryClause = INJURY_CLAUSES
      .filter(([key]) => (injuryCounts.get(key) ?? 0) > 0)
      .map(([key, text]) => ` · ${text(injuryCounts.get(key))}`)
      .join('')
    return { value: any ? missedSum : null, of: any ? totalSum : null, injuryClause, L }
  }, [ladderBy, myLineup, factsFor, playerMap])

  // ── §4.5 Starting ten scale ────────────────────────────────────────────────────────────────
  const scaleMaxStarters = useMemo(() => {
    if (!myLineup) return 1
    const vals = []
    for (const s of myLineup.slots) {
      if (s.player_id == null) continue
      const f = factsFor(s.player_id)
      if (Number.isFinite(f.last)) vals.push(f.last)
      if (Number.isFinite(s.points)) vals.push(s.points)
    }
    return Math.max(1, ...vals)
  }, [myLineup, factsFor])

  const rookieNames = useMemo(() => {
    if (!myLineup) return []
    const names = []
    for (const s of myLineup.slots) {
      if (s.player_id == null) continue
      const row = rowById.get(s.player_id)
      const f = factsFor(s.player_id)
      if (row?.years_exp === 0 && f.last == null) names.push(row.full_name)
    }
    return names
  }, [myLineup, rowById, factsFor])

  // ── §4.6 Bench ─────────────────────────────────────────────────────────────────────────────
  const [benchExpanded, setBenchExpanded] = useState(false)

  const starterIdSet = useMemo(
    () => new Set((myLineup?.slots ?? []).filter(s => s.player_id != null).map(s => s.player_id)),
    [myLineup]
  )

  const benchPlayerRows = useMemo(() => {
    return ownedRows
      .filter(r => !starterIdSet.has(r.player_id))
      .map(r => ({
        kind: 'player',
        row: r,
        proj: Number.isFinite(r.projectedPPG) ? r.projectedPPG : null,
        bar: startingBar(slotMedians, r.position),
      }))
  }, [ownedRows, starterIdSet, slotMedians])

  const benchRows = useMemo(() => {
    const players = [...benchPlayerRows]
    const withProj = players.filter(p => p.proj != null).sort((a, b) => b.proj - a.proj || a.row.full_name.localeCompare(b.row.full_name))
    const withoutProj = players.filter(p => p.proj == null).sort((a, b) => {
      const av = a.row.ktcValue, bv = b.row.ktcValue
      if (av == null && bv == null) return a.row.full_name.localeCompare(b.row.full_name)
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av || a.row.full_name.localeCompare(b.row.full_name)
    })
    const picks = [...myPickRows].sort((a, b) => {
      const av = a.ktcValue, bv = b.ktcValue
      if (av == null && bv == null) return a.full_name.localeCompare(b.full_name)
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av || a.full_name.localeCompare(b.full_name)
    }).map(p => ({ kind: 'pick', row: p }))
    return [...withProj, ...withoutProj, ...picks]
  }, [benchPlayerRows, myPickRows])

  const benchScaleMax = useMemo(() => {
    const vals = []
    for (const b of benchPlayerRows) {
      const f = factsFor(b.row.player_id)
      if (Number.isFinite(f.last)) vals.push(f.last)
      if (Number.isFinite(b.proj)) vals.push(b.proj)
    }
    return Math.max(1, ...vals)
  }, [benchPlayerRows, factsFor])

  const visibleBenchRows = benchExpanded || benchRows.length <= BENCH_COLLAPSED_ROWS ? benchRows : benchRows.slice(0, BENCH_COLLAPSED_ROWS)

  const maxOwnedKtc = Math.max(1, ...ownedRows.map(r => r.ktcValue ?? 0), ...myPricedPickRows.map(r => r.ktcValue))

  if (myTeamName == null) {
    return (
      <div className="bg-dp-canvas rounded-lg py-12 text-center">
        <h1 className="text-xl font-semibold text-dp-text mb-3">My Team</h1>
        <p className="text-dp-muted text-sm max-w-sm mx-auto">
          No roster found for your account in this league.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-dp-canvas flex flex-col gap-[18px]">
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row lg:items-end gap-4 lg:gap-7">
        <div className="flex-1 min-w-0">
          <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">My Team</h1>
          <p className="text-[13px] text-dp-muted mt-1">{metaParts.join(' · ')}</p>
          {summarySentence && (
            <p
              data-testid="summary-sentence"
              className="text-[15px] text-dp-text-3 leading-normal max-w-[760px] mt-2"
            >
              {summarySentence}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 lg:shrink-0">
          {(() => {
            const L = ladderBy.Lineup
            return (
              <>
                <div data-testid="tile-lineup-last" className="bg-dp-card border border-dp-border rounded-[10px] px-4 py-3 min-w-[150px]">
                  <div className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">
                    LINEUP PPG · {dataSeason ?? '—'}
                  </div>
                  {L?.lastMine != null ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span data-testid="tile-lineup-last-value" className="font-dp-mono text-2xl font-semibold tracking-[-0.02em] text-dp-text">
                          {f1(L.lastMine)}
                        </span>
                        {L.lastRank != null && (
                          <span className={`font-dp-mono text-xs ${rankClass(L.lastRank)}`}>{ordinal(L.lastRank)}</span>
                        )}
                      </div>
                      {L.lastMedian != null && (
                        <div className="text-[11px] text-dp-muted mt-[3px]">league median {f1(L.lastMedian)}</div>
                      )}
                    </>
                  ) : (
                    <span className="font-dp-mono text-2xl font-semibold tracking-[-0.02em] text-dp-muted">—</span>
                  )}
                </div>
                <div data-testid="tile-lineup-proj" className="bg-dp-card border border-dp-border rounded-[10px] px-4 py-3 min-w-[150px]">
                  <div className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">
                    PROJECTED · {projSeason ?? '—'}
                  </div>
                  {L?.projMine != null ? (
                    <>
                      <div className="flex items-baseline gap-2">
                        <span data-testid="tile-lineup-proj-value" className="font-dp-mono text-2xl font-semibold tracking-[-0.02em] text-dp-up-text">
                          {f1(L.projMine)}
                        </span>
                        {L.projRank != null && (
                          <span className={`font-dp-mono text-xs ${rankClass(L.projRank)}`}>{ordinal(L.projRank)}</span>
                        )}
                      </div>
                      {L.projMedian != null && (
                        <div className="text-[11px] text-dp-muted mt-[3px]">
                          league median {f1(L.projMedian)}
                          {L.lastMine != null && (
                            <>
                              {' · '}
                              {L.projMine - L.lastMine >= 0 ? '+' : '−'}
                              {f1(Math.abs(L.projMine - L.lastMine))} on last year
                            </>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <span className="font-dp-mono text-2xl font-semibold tracking-[-0.02em] text-dp-muted">—</span>
                  )}
                </div>
                <div data-testid="tile-games-missed" className="bg-dp-card border border-dp-border rounded-[10px] px-4 py-3 min-w-[150px]">
                  <div className="font-dp-mono text-[9.5px] tracking-[0.08em] text-dp-muted">
                    GAMES MISSED · {dataSeason ?? '—'}
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span data-testid="tile-games-missed-value" className="font-dp-mono text-2xl font-semibold tracking-[-0.02em] text-dp-text">
                      {gamesMissedTile.value != null ? gamesMissedTile.value : <span className="text-dp-muted">—</span>}
                    </span>
                    {gamesMissedTile.of != null && (
                      <span className="font-dp-mono text-xs text-dp-text-5">of {gamesMissedTile.of}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-dp-muted mt-[3px]">
                    by your ten starters{gamesMissedTile.injuryClause}
                  </div>
                </div>
              </>
            )
          })()}
        </div>
      </div>

      {/* ── Starting ten ── */}
      <div data-testid="starting-ten" className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
        <div className="flex flex-wrap items-baseline gap-2.5 px-[18px] pt-3.5 pb-3 border-b border-dp-border-row">
          <div>
            <div className="text-[13px] font-semibold text-dp-text-strong">Starting ten</div>
            <div className="text-[11.5px] text-dp-muted">best lineup by projected points · last season beside next</div>
          </div>
          <div className="ml-auto flex flex-wrap gap-3.5 text-[11px] text-dp-text-5">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-dp-slate" /> {dataSeason} PPG</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-dp-up" /> {projSeason} projected</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-dp-up-border" /> played</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-dp-down-bg-strong" /> missed</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm border border-dashed border-dp-slate-2" /> bye or no game</span>
          </div>
        </div>
        {!loaded && (
          <p className="text-sm text-dp-muted italic px-[18px] py-3">Player data loading in background…</p>
        )}
        {!myLineup || myLineup.slots.length === 0 ? (
          <p className="text-sm text-dp-muted px-[18px] py-6">No starting lineup — league slots or roster not loaded.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="bg-dp-row-head">
                  <tr>
                    <th className={TH_CLASS}></th>
                    <th className={TH_CLASS}>PLAYER</th>
                    <th className={`${TH_CLASS} ${DIVIDER} text-dp-text`}>{dataSeason ?? '—'} → {projSeason ?? '—'} PPG</th>
                    <th className={TH_CLASS}>Δ</th>
                    <th className={TH_CLASS}>POS RANK</th>
                    <th className={`${TH_CLASS} ${DIVIDER}`}>GAMES {dataSeason}</th>
                    <th className={TH_CLASS}>SHARE</th>
                    <th className={TH_CLASS}>SNAP</th>
                    <th className={`${TH_CLASS} ${DIVIDER}`}>
                      <DefinitionPopover
                        term="Game script"
                        gloss="The offence's scoring margin and pass rate over expected, blue when it suits this player's position and amber when it works against it. Not built yet — arrives with the team-metrics slice."
                      >
                        GAME SCRIPT
                      </DefinitionPopover>
                    </th>
                    <th className={`${TH_CLASS} ${DIVIDER}`}>ROLE</th>
                    <th className={TH_CLASS}>STATUS</th>
                    <th className={`${TH_CLASS} ${DIVIDER}`}>KTC</th>
                  </tr>
                </thead>
                <tbody>
                  {myLineup.slots.map((slot, i) => {
                    if (slot.player_id === null) {
                      return (
                        <tr key={i} data-testid={`starter-${i}`} className="border-t border-dp-border-row">
                          <td data-testid="col-slot" className="px-[10px] py-2 first:pl-[18px] font-dp-mono text-[10.5px] text-dp-muted">{slotLabel(slot.slot)}</td>
                          <td data-testid="col-player" className="px-[10px] py-2 text-dp-muted italic">empty</td>
                          <td data-testid="col-ppg" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-delta" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-posrank" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-games" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-share" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-snap" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-script" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-role" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-status" className="px-[10px] py-2 text-dp-muted">—</td>
                          <td data-testid="col-ktc" className="px-[10px] py-2 last:pr-[18px] text-dp-muted">—</td>
                        </tr>
                      )
                    }
                    const row = rowById.get(slot.player_id) ?? {
                      player_id: slot.player_id, full_name: slot.name, position: slot.position,
                      nfl_team: null, age: null, years_exp: null, ktcValue: null,
                    }
                    const f = factsFor(slot.player_id)
                    return (
                      <ClickableRow key={slot.player_id} row={row} onOpen={onOpenPlayerDetail}>
                        <td data-testid="col-slot" className="px-[10px] py-2 first:pl-[18px] font-dp-mono text-[10.5px] text-dp-muted">{slotLabel(slot.slot)}</td>
                        <td data-testid="col-player" className="px-[10px] py-2"><PlayerCell row={row} /></td>
                        <td data-testid="col-ppg" className="px-[10px] py-2"><PpgPairCell last={f.last} proj={slot.points} scaleMax={scaleMaxStarters} /></td>
                        <td data-testid="col-delta" className="px-[10px] py-2"><DeltaCell delta={f.last != null && slot.points != null ? slot.points - f.last : null} /></td>
                        <td data-testid="col-posrank" className="px-[10px] py-2 font-dp-mono text-dp-text-5 text-right">{f.posRank ?? <span className="text-dp-muted">—</span>}</td>
                        <td data-testid="col-games" className="px-[10px] py-2"><GamesStripCell weeks={f.weeks} played={f.played} missed={f.missed} /></td>
                        <td data-testid="col-share" className="px-[10px] py-2"><PctCell value={f.share} /></td>
                        <td data-testid="col-snap" className="px-[10px] py-2"><PctCell value={f.snap} /></td>
                        <td data-testid="col-script" className="px-[10px] py-2"><ScriptCell /></td>
                        <td data-testid="col-role" className="px-[10px] py-2 font-dp-mono text-[10px] text-dp-text-2">{f.role ?? <span className="text-dp-muted">—</span>}</td>
                        <td data-testid="col-status" className="px-[10px] py-2"><StatusCell status={f.status} /></td>
                        <td data-testid="col-ktc" className="px-[10px] py-2 last:pr-[18px]"><KtcCell value={row.ktcValue} /></td>
                      </ClickableRow>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-3.5 px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11.5px]">
              <span className="text-dp-muted">
                POS RANK is last-season PPG among all players at the position in this league&apos;s scoring. SHARE is
                target share for pass-catchers and carry share for backs, from seasons with 8+ games. SNAP is
                offensive snap share; not tracked for quarterbacks. Dashed week is a bye or a week with no game
                recorded.
              </span>
              {rookieNames.length > 0 && (
                <span className="ml-auto text-dp-muted-2">
                  {rookieNames.length === 1
                    ? `${rookieNames[0]} is a rookie: no ${dataSeason} line, projection from draft capital and college profile.`
                    : `${rookieNames.join(', ')} are rookies: no ${dataSeason} line, projections from draft capital and college profile.`}
                </span>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Bench ── */}
      <div data-testid="bench" className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
        <div className="flex flex-wrap items-baseline gap-2.5 px-[18px] pt-3.5 pb-3 border-b border-dp-border-row">
          <div>
            <div className="text-[13px] font-semibold text-dp-text-strong">
              Bench · {benchPlayerRows.length} player{benchPlayerRows.length === 1 ? '' : 's'} and {myPickRows.length} pick{myPickRows.length === 1 ? '' : 's'}
            </div>
            <div className="text-[11.5px] text-dp-muted">same columns, sorted by projected points · the top of this list is who steps in</div>
          </div>
          {benchRows.length > BENCH_COLLAPSED_ROWS && (
            <button
              type="button"
              data-testid="bench-toggle"
              className="ml-auto text-[11.5px] text-dp-up-text"
              onClick={() => setBenchExpanded(v => !v)}
            >
              {benchExpanded ? 'show fewer' : `show all ${benchRows.length} →`}
            </button>
          )}
        </div>
        {!loaded && (
          <p className="text-sm text-dp-muted italic px-[18px] py-3">Player data loading in background…</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead className="bg-dp-row-head">
              <tr>
                <th className={TH_CLASS}>PLAYER</th>
                <th className={`${TH_CLASS} ${DIVIDER} text-dp-text`}>{dataSeason ?? '—'} → {projSeason ?? '—'} PPG</th>
                <th className={TH_CLASS}>Δ</th>
                <th className={TH_CLASS}>VS MEDIAN STARTER</th>
                <th className={TH_CLASS}>POS RANK</th>
                <th className={`${TH_CLASS} ${DIVIDER}`}>GAMES {dataSeason}</th>
                <th className={TH_CLASS}>SHARE</th>
                <th className={TH_CLASS}>SNAP</th>
                <th className={`${TH_CLASS} ${DIVIDER}`}>
                  <DefinitionPopover
                    term="Game script"
                    gloss="The offence's scoring margin and pass rate over expected, blue when it suits this player's position and amber when it works against it. Not built yet — arrives with the team-metrics slice."
                  >
                    GAME SCRIPT
                  </DefinitionPopover>
                </th>
                <th className={`${TH_CLASS} ${DIVIDER}`}>ROLE</th>
                <th className={TH_CLASS}>STATUS</th>
                <th className={`${TH_CLASS} ${DIVIDER}`}>KTC</th>
              </tr>
            </thead>
            <tbody>
              {visibleBenchRows.map(entry => {
                if (entry.kind === 'pick') {
                  const row = entry.row
                  return (
                    <tr key={row.id} data-testid={`bench-${row.id}`} className="border-t border-dp-border-row">
                      <td className="px-[10px] py-2 first:pl-[18px]"><PickCell row={row} /></td>
                      <td data-testid="col-ppg" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-delta" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-vsmedian" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-posrank" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-games" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-share" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-snap" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-script" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-role" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-status" className="px-[10px] py-2 text-dp-muted">—</td>
                      <td data-testid="col-ktc" className="px-[10px] py-2 last:pr-[18px]"><PickValueCell row={row} maxOwnedKtc={maxOwnedKtc} /></td>
                    </tr>
                  )
                }
                const row = entry.row
                const f = factsFor(row.player_id)
                return (
                  <ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>
                    <td data-testid="col-player" className="px-[10px] py-2 first:pl-[18px]"><PlayerCell row={row} /></td>
                    <td data-testid="col-ppg" className="px-[10px] py-2"><PpgPairCell last={f.last} proj={entry.proj} scaleMax={benchScaleMax} /></td>
                    <td data-testid="col-delta" className="px-[10px] py-2"><DeltaCell delta={f.last != null && entry.proj != null ? entry.proj - f.last : null} /></td>
                    <td data-testid="col-vsmedian" className="px-[10px] py-2"><VsMedianCell proj={entry.proj} bar={entry.bar} /></td>
                    <td data-testid="col-posrank" className="px-[10px] py-2 font-dp-mono text-dp-text-5 text-right">{f.posRank ?? <span className="text-dp-muted">—</span>}</td>
                    <td data-testid="col-games" className="px-[10px] py-2"><GamesStripCell weeks={f.weeks} played={f.played} missed={f.missed} /></td>
                    <td data-testid="col-share" className="px-[10px] py-2"><PctCell value={f.share} /></td>
                    <td data-testid="col-snap" className="px-[10px] py-2"><PctCell value={f.snap} /></td>
                    <td data-testid="col-script" className="px-[10px] py-2"><ScriptCell /></td>
                    <td data-testid="col-role" className="px-[10px] py-2 font-dp-mono text-[10px] text-dp-text-2">{f.role ?? <span className="text-dp-muted">—</span>}</td>
                    <td data-testid="col-status" className="px-[10px] py-2"><StatusCell status={f.status} /></td>
                    <td data-testid="col-ktc" className="px-[10px] py-2 last:pr-[18px]"><KtcCell value={row.ktcValue} /></td>
                  </ClickableRow>
                )
              })}
              {benchRows.length === 0 && (
                <tr>
                  <td colSpan={12} className="py-10 text-center text-dp-muted">
                    {loaded ? 'No bench players or picks.' : 'Loading player data…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap gap-3.5 px-[18px] py-2.5 border-t border-dp-border-row bg-dp-card-quiet text-[11.5px] text-dp-muted">
          VS MEDIAN STARTER is the gap to the league&apos;s median projected starter at the weakest slot this player
          could fill — positive means he would start on a typical team.
        </div>
      </div>
    </div>
  )
}
