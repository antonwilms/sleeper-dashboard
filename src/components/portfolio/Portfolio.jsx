import { useEffect, useMemo } from 'react'
import { usePlayersTable } from '../../hooks/usePlayersTable'
import { SortTh, PlayerCell, ClickableRow, CareerBars, DeltaCell } from '../dp/cells'
import { DegradedBlock } from '../dp/DegradedBlock'
import { DefinitionPopover } from '../dp/DefinitionPopover'
import { compareNullsLast } from '../../utils/sortUtils'
import { deriveLiveSeasons, reconstructPickOwnership } from '../../utils/tradedPicks'
import { pickPrice } from '../../utils/ktcPicks'

// Portfolio (1b Slice iv) — the thinned Portfolio screen: header, four metric tiles, a
// value-by-age-band chart, and a holdings table whose rows open the Slice ii pop-up. Everything
// on this screen is scoped to rows the user owns (ownerTeamName === myTeamName), derived once
// (§1) and shared by every section below — do not re-filter per section.
//
// dp-v2 Slice 7 — picks as holdings. Roster value now reads `players X + picks Y` with
// `+ N UNPRICED ASSETS` inline (never a footnote/tooltip); concentration and the league rank are
// pick-inclusive; weighted age stays players-only (picks have no age). Two tiles gained real
// deltas (roster value, concentration — both `players only`, since ktcHistory drops picks the
// same way matchKTCToSleeper does); the other two (weighted age, proj. points) render
// `DegradedBlock` `no-baseline` — no historical aggregate of either is ever stored, a storage
// fact, not a design choice.
//
// Five design elements are cut outright, per master-plan §4a.2 (omit rather than approximate):
// the "needs a decision" alert cards, the Holdings CALL column, the three tile deltas, the
// 30 days/Season/All time segmented control, and the header's "contending window open" clause.
// A sixth — the "· N rookie picks" subline clause — is cut for a data gap, not a §4a.2 call: the
// app never loads Sleeper's traded-picks endpoint, so there is no representation of unused
// future picks as tradeable assets. See the task file §0/"Explicitly NOT this slice".
// dp-v2 Slice 7 resolves that data gap; the subline clause itself remains cut (out of scope).

const DEFAULT_SORT = { column: 'ktcValue', direction: 'desc' }
const SORTABLE_KEYS = new Set(['full_name', 'ktcValue', 'projDelta', 'yearsFromPeak'])

// HORIZON's ± year-from-peak display boundary — the only judgment call in an otherwise fully
// pipeline-computed quantity (§5.1). One named constant so it's trivial to tune.
const HORIZON_THRESHOLD_YEARS = 2

const AGE_BANDS = [
  // Lower-open first band: a 21-and-under rookie must land somewhere, or it vanishes from the
  // chart while still counting in the Roster value tile — the bars would stop summing to the tile.
  { key: 'b1', label: '≤23',  min: -Infinity, max: 23,       colorClass: 'bg-dp-up' },
  { key: 'b2', label: '24–25', min: 24,        max: 25,       colorClass: 'bg-dp-up' },
  { key: 'b3', label: '26–28', min: 26,        max: 28,       colorClass: 'bg-dp-neutral' },
  { key: 'b4', label: '29–30', min: 29,        max: 30,       colorClass: 'bg-dp-down' },
  { key: 'b5', label: '31+',   min: 31,        max: Infinity, colorClass: 'bg-dp-down' },
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

function median(values) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

// HORIZON pill — read row.dynastyScore.signals.yearsFromPeak, never re-derived (§5.1). The
// pipeline already computes this from the same per-position empirical peak-age map the chart's
// fixed bands intentionally do NOT use — see the chart-vs-pill note below §4's markup. signals is
// null on the non-scored path (dynastyScore.js), and yearsFromPeak is itself null when peakAge or
// age is missing; both collapse to "—" here.
function horizonInfo(yfp) {
  if (yfp == null) return null
  if (yfp <= -HORIZON_THRESHOLD_YEARS) return { label: 'Appreciating', cls: 'border-dp-up-border text-dp-up-text' }
  if (yfp >= HORIZON_THRESHOLD_YEARS) return { label: 'Depreciating', cls: 'border-dp-down-border text-dp-down-text' }
  return { label: 'Peak', cls: 'border-dp-slate-2 text-dp-text-3' }
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

// Roster-value / concentration tile deltas (dp-v2 Slice 7 §5) — a CONSTANT-PORTFOLIO measure by
// design: it holds the holding set fixed at TODAY's and varies only price across the ktcHistory
// window, so it reports market movement ("is what I hold gaining value"), not the effect of
// trades. A later reader "fixing" this into a trade-aware delta would answer a different
// question than the tile asks. Justified, not assumed, that picks are safe to omit: pick prices
// moved a median of 1.3% across the whole 8-snapshot window and not one of the 36 rows moved
// >10% (task file §5) — near-static, so a players-only delta still answers "is my roster gaining
// value." Do not back-fill history by holding today's pick price constant across the window —
// that fabricates data this repo's rules forbid; and do not widen loadKtcHistory to carry picks
// here — it is a shared, cached loader, and reshaping it in the program's last slice buys ~1%
// accuracy for a real cost. A player with no entry at a given date is omitted from that date's
// sum, never zeroed; if the first/last dates cover different holding subsets, only the
// intersection (players present at BOTH ends) is compared, so the delta never compares two
// different holding sets against each other.
function seriesValueAt(playerIds, seriesById, date) {
  let sum = 0
  let any = false
  for (const id of playerIds) {
    const entry = seriesById[id]?.find(e => e.date === date)
    if (entry) { sum += entry.value; any = true }
  }
  return any ? sum : null
}

function computeRosterValueDelta(ktcHistory, ownedPlayerIds) {
  const dates = ktcHistory?.snapshotDates
  if (!dates?.length || dates.length < 2 || ownedPlayerIds.length === 0) return null
  const series = ktcHistory.series ?? {}
  const firstDate = dates[0], lastDate = dates[dates.length - 1]
  const intersectionIds = ownedPlayerIds.filter(id => {
    const s = series[id]
    return s?.some(e => e.date === firstDate) && s?.some(e => e.date === lastDate)
  })
  if (intersectionIds.length === 0) return null
  const firstSum = seriesValueAt(intersectionIds, series, firstDate)
  const lastSum = seriesValueAt(intersectionIds, series, lastDate)
  return (firstSum != null && lastSum != null) ? lastSum - firstSum : null
}

function computeConcentrationDelta(ktcHistory, top4PlayerIds, allOwnedPlayerIds) {
  const dates = ktcHistory?.snapshotDates
  if (!dates?.length || dates.length < 2 || top4PlayerIds.length === 0) return null
  const series = ktcHistory.series ?? {}
  const firstDate = dates[0], lastDate = dates[dates.length - 1]
  const pctAt = date => {
    const top4Sum = seriesValueAt(top4PlayerIds, series, date)
    const totalSum = seriesValueAt(allOwnedPlayerIds, series, date)
    return (top4Sum != null && totalSum > 0) ? (top4Sum / totalSum) * 100 : null
  }
  const firstPct = pctAt(firstDate)
  const lastPct = pctAt(lastDate)
  return (firstPct != null && lastPct != null) ? lastPct - firstPct : null
}

// Renders a tile's delta slot: a real ± value ("players only"), a quiet "—" when the delta isn't
// computable yet (ktcHistory still loading, or no overlapping window), or DegradedBlock
// `no-baseline` for the two tiles with no historical aggregate stored at all — a storage fact,
// not a design choice, so the copy says so plainly rather than hedging.
function TileDelta({ noBaseline, noBaselineText, delta, format }) {
  if (noBaseline) {
    return (
      <div className="mt-2">
        <DegradedBlock kind="no-baseline">{noBaselineText}</DegradedBlock>
      </div>
    )
  }
  if (delta == null) {
    return <div className="text-xs text-dp-muted mt-1">—</div>
  }
  return (
    <div className="text-xs mt-1">
      <span className={delta >= 0 ? 'text-dp-up-text' : 'text-dp-down-text'}>
        {delta >= 0 ? '+' : ''}{format(delta)}
      </span>
      <span className="text-dp-muted ml-1">· players only</span>
    </div>
  )
}

export function Portfolio({
  playerRows = [], loaded = false, rosterTeams = [], seasonProjections = null,
  myTeamName = null, onOpenPlayerDetail = () => {},
  tradedPicks = null, ktcPickTable = null, firstLiveDraftSeason = null, draftRounds = null,
  ktcHistory = null,
}) {
  // §1 — ownership is the whole screen's filter, derived once.
  const ownedRows = useMemo(
    () => (myTeamName == null ? [] : (playerRows ?? []).filter(r => r.ownerTeamName === myTeamName)),
    [playerRows, myTeamName]
  )

  // ── §3.1 / §3.2 — league-wide per-team aggregates (all playerRows, not just owned) ──────
  const { M, teamValueTotals, leagueMedianWeightedAge } = useMemo(() => {
    const teamNames = new Set()
    for (const r of (playerRows ?? [])) { if (r.ownerTeamName != null) teamNames.add(r.ownerTeamName) }

    const valueTotals = new Map()
    for (const name of teamNames) valueTotals.set(name, 0)
    const ageSums = new Map()   // name -> { sum, denom }
    for (const r of (playerRows ?? [])) {
      if (r.ownerTeamName == null || r.ktcValue == null) continue
      valueTotals.set(r.ownerTeamName, (valueTotals.get(r.ownerTeamName) ?? 0) + r.ktcValue)
      if (r.age != null) {
        const cur = ageSums.get(r.ownerTeamName) ?? { sum: 0, denom: 0 }
        cur.sum += r.age * r.ktcValue
        cur.denom += r.ktcValue
        ageSums.set(r.ownerTeamName, cur)
      }
    }
    const perTeamAges = []
    for (const { sum, denom } of ageSums.values()) {
      if (denom > 0) perTeamAges.push(sum / denom)
    }

    return { M: teamNames.size, teamValueTotals: valueTotals, leagueMedianWeightedAge: median(perTeamAges) }
  }, [playerRows])

  // ── dp-v2 Slice 7 §2/§3 — pick ownership, league-wide (every roster, not just mine) ──────
  // Live seasons: the intersection of "KTC prices this season" and "≥ first-live" — never
  // hard-coded, never taken from traded_picks alone (it still carries 15 rows for season 2026,
  // whose draft is COMPLETE) or from KTC alone (its snapshot still prices "2026 …" rows too).
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
  // Every roster's pick value (priced rounds only) — needed so the league rank below is
  // pick-inclusive for ALL 12 teams, not just mine; a total that includes picks ranked against
  // totals that don't would simply be wrong.
  const pickValueByRoster = useMemo(() => {
    const m = new Map()
    for (const p of allPickOwnership) {
      const price = pickPrice(ktcPickTable, p.season, p.round, 'Mid')
      if (price == null) continue
      m.set(p.ownerRosterId, (m.get(p.ownerRosterId) ?? 0) + price)
    }
    return m
  }, [allPickOwnership, ktcPickTable])
  const teamValueTotalsWithPicks = useMemo(() => {
    const combined = new Map(teamValueTotals)
    for (const team of rosterTeams) {
      const pickVal = pickValueByRoster.get(team.rosterId) ?? 0
      combined.set(team.teamName, (combined.get(team.teamName) ?? 0) + pickVal)
    }
    return combined
  }, [teamValueTotals, rosterTeams, pickValueByRoster])

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
          projDelta: null,
          yearsFromPeak: null,
        }
      })
  }, [allPickOwnership, myRosterId, rosterNameById, ktcPickTable])

  const myPricedPickRows = useMemo(() => myPickRows.filter(p => p.ktcValue != null), [myPickRows])
  const unpricedPickCount = myPickRows.length - myPricedPickRows.length

  // ── §3 — the four tiles ───────────────────────────────────────────────────────────────────
  const tiles = useMemo(() => {
    const valuedOwnedRows = ownedRows.filter(r => r.ktcValue != null)

    // 3.1 Roster value — dp-v2 Slice 7: players + picks, stated inline, pick-inclusive rank.
    const playersValue = valuedOwnedRows.reduce((s, r) => s + r.ktcValue, 0)
    const picksValue = myPricedPickRows.reduce((s, r) => s + r.ktcValue, 0)
    const hasAnyValue = valuedOwnedRows.length > 0 || myPricedPickRows.length > 0
    const rosterValueRank = (() => {
      if (myTeamName == null || !teamValueTotalsWithPicks.has(myTeamName)) return null
      const sorted = [...teamValueTotalsWithPicks.entries()].sort((a, b) => b[1] - a[1])
      const idx = sorted.findIndex(([name]) => name === myTeamName)
      return idx === -1 ? null : idx + 1
    })()
    const ownedPlayerIds = ownedRows.map(r => r.player_id)
    const rosterValueDelta = computeRosterValueDelta(ktcHistory, ownedPlayerIds)

    // 3.2 Weighted age — picks have no age; the existing age != null filter already excludes
    // them, restated in the note now that roster value and weighted age cover different assets.
    const ageValuedRows = ownedRows.filter(r => r.age != null && r.ktcValue != null)
    const ageDenom = ageValuedRows.reduce((s, r) => s + r.ktcValue, 0)
    const weightedAge = ageDenom > 0
      ? ageValuedRows.reduce((s, r) => s + r.age * r.ktcValue, 0) / ageDenom
      : null

    // 3.3 Concentration — top 4 owned assets by ktcValue, now including priced picks (a
    // 1st-rounder belongs in a concentration measure; correct and intended that this may change
    // once picks enter it).
    const concentrationAssets = [...valuedOwnedRows, ...myPricedPickRows]
    const byValueDesc = [...concentrationAssets].sort((a, b) => b.ktcValue - a.ktcValue)
    const top4 = byValueDesc.slice(0, 4)
    const top4Sum = top4.reduce((s, r) => s + r.ktcValue, 0)
    const concentrationTotal = playersValue + picksValue
    const concentrationPct = byValueDesc.length >= 4 && concentrationTotal > 0
      ? Math.round((top4Sum / concentrationTotal) * 100)
      : null
    const top4PlayerIds = top4.filter(r => r.kind !== 'pick').map(r => r.player_id)
    const concentrationDelta = computeConcentrationDelta(ktcHistory, top4PlayerIds, ownedPlayerIds)

    // 3.4 Projected points — starters only (NOT a picks concept — picks are never starters).
    const myRosterTeam = rosterTeams.find(t => t.teamName === myTeamName)
    const starters = myRosterTeam?.starters ?? []
    let projectedPoints = null
    if (starters.length > 0 && seasonProjections != null) {
      let sum = 0
      let contributing = 0
      for (const s of starters) {
        const proj = seasonProjections[s.id]
        if (proj?.projectedTotalPts != null) {
          sum += proj.projectedTotalPts
          contributing++
        }
      }
      if (contributing > 0) projectedPoints = Math.round(sum)
    }

    return [
      {
        key: 'value', label: 'ROSTER VALUE',
        value: hasAnyValue ? (
          <>
            {playersValue.toLocaleString()} players + {picksValue.toLocaleString()} picks
            {unpricedPickCount > 0 && (
              <span className="text-dp-muted text-sm font-normal ml-2">+ {unpricedPickCount} UNPRICED ASSETS</span>
            )}
          </>
        ) : '—',
        note: rosterValueRank != null ? `${ordinal(rosterValueRank)} of ${M}` : null,
        delta: rosterValueDelta, deltaFormat: v => Math.round(v).toLocaleString(), noBaseline: false,
      },
      {
        key: 'age', label: 'WEIGHTED AGE',
        value: weightedAge != null ? weightedAge.toFixed(1) : '—',
        note: leagueMedianWeightedAge != null ? `League median ${leagueMedianWeightedAge.toFixed(1)} (players only)` : null,
        noBaseline: true, noBaselineText: 'No historical weighted-age aggregate is stored.',
      },
      {
        key: 'conc', label: 'CONCENTRATION',
        value: concentrationPct != null ? `${concentrationPct}%` : '—',
        note: `Top 4 of ${concentrationAssets.length} assets by value`,
        delta: concentrationDelta, deltaFormat: v => `${v.toFixed(1)}pp`, noBaseline: false,
      },
      {
        key: 'proj', label: 'PROJ. POINTS',
        value: projectedPoints != null ? projectedPoints.toLocaleString() : '—',
        note: 'Next season, starters only',
        noBaseline: true, noBaselineText: 'No historical projections are stored.',
      },
    ]
  }, [ownedRows, myTeamName, teamValueTotalsWithPicks, M, leagueMedianWeightedAge, rosterTeams, seasonProjections, myPricedPickRows, unpricedPickCount, ktcHistory])

  // ── §4 — value by age band (players only — picks have no age) ────────────────────────────
  const ageBandValues = useMemo(() => {
    const totals = AGE_BANDS.map(() => 0)
    for (const r of ownedRows) {
      // Null-age rows are excluded from every band, not bucketed into 31+.
      if (r.age == null || r.ktcValue == null) continue
      const idx = AGE_BANDS.findIndex(b => r.age >= b.min && r.age <= b.max)
      if (idx !== -1) totals[idx] += r.ktcValue
    }
    return totals
  }, [ownedRows])
  const maxBandValue = Math.max(1, ...ageBandValues)

  // ── §5 — holdings table: players + picks, one sortable list ──────────────────────────────
  const holdingsRows = useMemo(() => [
    ...ownedRows.map(r => ({
      ...r,
      kind: 'player',
      // currentSeasonPPG is 0, never null — guard with > 0, not a null check, or a player with no
      // prior season renders projectedPPG - 0: a fabricated full-projection gain (§5).
      projDelta: (r.currentSeasonPPG > 0 && r.projectedPPG != null) ? r.projectedPPG - r.currentSeasonPPG : null,
      yearsFromPeak: r.dynastyScore?.signals?.yearsFromPeak ?? null,
    })),
    ...myPickRows,
  ], [ownedRows, myPickRows])

  const { sortState, sortProps, setSortState } = usePlayersTable({ storageKey: 'portfolio-sort', defaultSort: DEFAULT_SORT })

  // Restored-key validation (Market.jsx's pattern) — Portfolio has one column set, so the
  // set-switch machinery doesn't apply, but a stale/foreign sort value restored from
  // `localStorage` still needs a fallback rather than sorting by a key this table has no column for.
  useEffect(() => {
    if (!SORTABLE_KEYS.has(sortState.column)) {
      setSortState(DEFAULT_SORT)
    }
  }, [sortState.column, setSortState])

  const displayRows = useMemo(() => {
    const dir = sortState.direction === 'asc' ? 1 : -1
    return [...holdingsRows].sort((a, b) => compareNullsLast(a[sortState.column], b[sortState.column], dir))
  }, [holdingsRows, sortState])

  const maxOwnedKtc = Math.max(1, ...ownedRows.map(r => r.ktcValue ?? 0), ...myPricedPickRows.map(r => r.ktcValue))

  if (myTeamName == null) {
    return (
      <div className="bg-dp-canvas rounded-lg py-12 text-center">
        <h1 className="text-xl font-semibold text-dp-text mb-3">Portfolio</h1>
        <p className="text-dp-muted text-sm max-w-sm mx-auto">
          No roster found for your account in this league.
        </p>
      </div>
    )
  }

  return (
    // bg-dp-canvas is required, not decorative — Slice i §1.1.
    <div className="bg-dp-canvas flex flex-col gap-[22px]">
      {/* Header — the posture clause and rookie-pick clause are both cut; nothing occupies the
          header's right side in v1 (the horizon segmented control is cut too). */}
      <div>
        <h1 className="text-[22px] font-bold tracking-[-0.02em] text-dp-text">Portfolio</h1>
        {/* playerRows holds only QB/RB/WR/TE, so this count never matches a full Sleeper
            roster (K/DEF etc. are absent) — worded as "skill players", not "assets". */}
        <p className="text-[13px] text-dp-muted mt-1">{ownedRows.length} skill players</p>
      </div>

      {/* Four metric tiles */}
      <div className="grid grid-cols-4 gap-[14px]">
        {tiles.map(t => (
          <div key={t.key} data-testid={`tile-${t.key}`} className="bg-dp-card rounded-[10px] p-[14px_16px]">
            <div className="font-dp-mono text-[11px] uppercase text-dp-muted">{t.label}</div>
            <div className="font-dp-mono text-2xl font-semibold tracking-[-0.02em] text-dp-text mt-1">{t.value}</div>
            {t.note && <div className="text-xs text-dp-muted mt-1">{t.note}</div>}
            <TileDelta
              noBaseline={t.noBaseline} noBaselineText={t.noBaselineText}
              delta={t.delta} format={t.deltaFormat}
            />
          </div>
        ))}
      </div>

      {/* Value by age band */}
      <div className="bg-dp-card rounded-[10px] p-[16px_18px]">
        <div className="text-[13px] font-semibold text-dp-text">Value by age band</div>
        <p className="text-xs text-dp-muted mt-0.5">where your capital sits on the age curve</p>
        <div className="flex items-end gap-[14px] h-[190px] mt-4">
          {AGE_BANDS.map((band, i) => {
            const v = ageBandValues[i]
            const h = v > 0 ? Math.max(4, Math.round((v / maxBandValue) * 190)) : 0
            return (
              <div key={band.key} data-testid={`ageband-${band.key}`} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                <span className="font-dp-mono text-[11px] text-dp-text-4">{v.toLocaleString()}</span>
                <div className={`w-full rounded-t-[5px] rounded-b-[2px] ${band.colorClass}`} style={{ height: h }} />
                <span className="text-[11px] text-dp-muted">{band.label}</span>
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 mt-4">
          <span className="flex items-center gap-1.5 text-xs text-dp-muted">
            <span className="w-2 h-2 rounded-sm bg-dp-up" /> Appreciating (≤25)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-dp-muted">
            <span className="w-2 h-2 rounded-sm bg-dp-neutral" /> Peak (26–28)
          </span>
          <span className="flex items-center gap-1.5 text-xs text-dp-muted">
            <span className="w-2 h-2 rounded-sm bg-dp-down" /> Depreciating (29+)
          </span>
        </div>
      </div>

      {/* Holdings table — players + picks (dp-v2 Slice 7). No 30D (same broken ktcHist series
          Market cut), no CALL (§4a.2 cut) */}
      <div className="bg-dp-card border border-dp-border rounded-[10px] overflow-hidden">
        <div className="px-[18px] py-[14px] text-[13px] font-semibold text-dp-text">Holdings</div>
        {!loaded && (
          <p className="text-sm text-dp-muted italic px-[18px] pb-3">Player data loading in background…</p>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="bg-dp-row-head">
                <SortTh label="Asset" col="full_name" {...sortProps} />
                <SortTh label="Value" col="ktcValue" {...sortProps} align="right" />
                <th className="px-3 py-[9px] font-dp-mono text-[10px] tracking-[0.08em] font-medium uppercase text-left text-dp-muted whitespace-nowrap">
                  5-YR PPG
                </th>
                <SortTh label="Proj Δ" col="projDelta" {...sortProps} align="right" />
                <SortTh label="Horizon" col="yearsFromPeak" {...sortProps} />
              </tr>
            </thead>
            <tbody>
              {displayRows.map(row => row.kind === 'pick' ? (
                <tr key={row.id} data-testid={`holding-${row.id}`} className="border-t border-dp-border-row">
                  <td className="px-[18px] py-3"><PickCell row={row} /></td>
                  <td className="px-3 py-3 w-[190px]"><PickValueCell row={row} maxOwnedKtc={maxOwnedKtc} /></td>
                  <td className="px-3 py-3"><span className="text-dp-muted text-xs">—</span></td>
                  <td className="px-3 py-3 text-right"><DeltaCell delta={null} /></td>
                  <td className="px-3 py-3"><span className="text-dp-muted text-xs">—</span></td>
                </tr>
              ) : (
                <ClickableRow key={row.player_id} row={row} onOpen={onOpenPlayerDetail}>
                  <td className="px-[18px] py-3"><PlayerCell row={row} /></td>
                  <td className="px-3 py-3 w-[190px]">
                    {row.ktcValue != null ? (
                      <div className="flex items-center gap-2.5 justify-end">
                        <div className="flex-1 h-1.5 rounded-[3px] bg-dp-border-row overflow-hidden">
                          <div className="h-1.5 rounded-[3px] bg-dp-up" style={{ width: `${Math.max(0, Math.min(100, (row.ktcValue / maxOwnedKtc) * 100))}%` }} />
                        </div>
                        <span className="font-dp-mono text-xs text-dp-text w-[46px] text-right">{row.ktcValue.toLocaleString()}</span>
                      </div>
                    ) : <span className="text-dp-muted text-xs block text-right">—</span>}
                  </td>
                  <td className="px-3 py-3"><CareerBars values={row.careerSparkline} /></td>
                  <td data-testid={`projdelta-${row.player_id}`} className="px-3 py-3 text-right"><DeltaCell delta={row.projDelta} /></td>
                  <td data-testid={`horizon-${row.player_id}`} className="px-3 py-3">
                    {(() => {
                      const h = horizonInfo(row.yearsFromPeak)
                      return h ? (
                        <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full border ${h.cls}`}>{h.label}</span>
                      ) : <span className="text-dp-muted text-xs">—</span>
                    })()}
                  </td>
                </ClickableRow>
              ))}
              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-dp-muted">
                    {loaded ? 'No holdings to show.' : 'Loading player data…'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
