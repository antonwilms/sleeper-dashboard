import { useEffect, useMemo } from 'react'
import { DegradedBlock } from '../dp/DegradedBlock'
import {
  UNITS, FANTASY_SLOTS, buildDepthChart, buildOlIdIndex, buildOlSlots, buildOwnerIndex,
} from '../../utils/depthChart'
import { injuryShort } from '../../utils/injuryStatus'

// Team depth chart (`/teams/:abbr?view=depth`) — formation layout. Sleeper's slot code is the slot;
// OL cards come from nflverse/oline (CR-35). Fantasy layer (owner, "yours", injury chip, click →
// pop-up) is keyed on the SLOT code, never on position, and applies to QB/RB/WR/TE/K slots only.
// View-only: nothing here feeds projection/scoring.

const CARD = 'w-[150px] bg-dp-card border border-dp-border rounded-[10px] p-[10px]'
const ROW = 'flex flex-wrap justify-center gap-[10px]'

function Backups({ entries }) {
  if (entries.length <= 1) return null
  return (
    <div className="mt-1 flex flex-col gap-0.5">
      {entries.slice(1).map((e, i) => (
        <div key={e.id} className="text-[11.5px] text-dp-muted">{i + 2}. {e.name}</div>
      ))}
    </div>
  )
}

function FantasyEntry({ entry, owner, myTeamName, onOpen, starter, rank }) {
  const mine = owner != null && owner === myTeamName
  const short = injuryShort(entry.injuryStatus)
  return (
    <div className={`${mine ? 'bg-dp-up/10 rounded' : ''} ${starter ? '' : 'mt-1'}`}>
      {!starter && <span className="text-[11.5px] text-dp-muted">{rank}. </span>}
      <button
        type="button"
        data-testid={`dc-player-${entry.id}`}
        onClick={() => onOpen?.(entry.id)}
        className={`text-left ${starter ? 'text-[13px] font-semibold text-dp-text' : 'text-[11.5px] text-dp-muted'} hover:underline`}
      >
        {entry.name}
      </button>
      {short && (
        <span
          data-testid={`dc-injury-${entry.id}`}
          title={entry.injuryStatus + (entry.injuryBodyPart ? ' · ' + entry.injuryBodyPart : '')}
          className="font-dp-mono text-[10px] text-dp-down-text ml-1"
        >{short}</span>
      )}
      {owner != null && (
        <div className={`text-[10.5px] ${mine ? 'text-dp-up-text' : 'text-dp-muted'}`}>{mine ? 'yours' : owner}</div>
      )}
    </div>
  )
}

function SlotCard({ testId, label, entries, fantasy = false, owners, myTeamName, onOpen }) {
  const starter = entries[0]
  return (
    <div data-testid={testId} className={CARD}>
      <div className="font-dp-mono text-[10px] tracking-[0.08em] uppercase text-dp-muted-2 mb-1">{label}</div>
      {!starter ? (
        <div className="text-[13px] font-semibold text-dp-text">—</div>
      ) : fantasy ? (
        entries.map((e, i) => (
          <FantasyEntry
            key={e.id}
            entry={e}
            owner={owners.get(e.id) ?? null}
            myTeamName={myTeamName}
            onOpen={onOpen}
            starter={i === 0}
            rank={i + 1}
          />
        ))
      ) : (
        <>
          <div className="text-[13px] font-semibold text-dp-text">{starter.name}</div>
          <Backups entries={entries} />
        </>
      )}
    </div>
  )
}

function OlCard({ slot, entries, onOpen }) {
  const starter = entries[0]
  const render = (e, cls) => (e.sleeperId ? (
    <button type="button" data-testid={`dc-ol-${e.sleeperId}`} onClick={() => onOpen?.(e.sleeperId)} className={`text-left hover:underline ${cls}`}>{e.name}</button>
  ) : (
    <span data-testid="dc-ol-unmapped" className={cls}>{e.name}</span>
  ))
  return (
    <div data-testid={`dc-slot-${slot}`} className={CARD}>
      <div className="font-dp-mono text-[10px] tracking-[0.08em] uppercase text-dp-muted-2 mb-1">{slot}</div>
      {starter ? render(starter, 'text-[13px] font-semibold text-dp-text') : <div className="text-[13px] font-semibold text-dp-text">—</div>}
      {entries.slice(1).map((e, i) => (
        <div key={`${e.name}-${i}`} className="text-[11.5px] text-dp-muted mt-0.5">{i + 2}. {render(e, '')}</div>
      ))}
    </div>
  )
}

function SectionHeading({ children }) {
  return <h2 className="text-[13px] font-semibold text-dp-text mt-2">{children}</h2>
}

export function DepthChart({
  abbr, playersMap, rosterTeams, myTeamName = null, oline = null, onNeedOline, onOpenPlayerDetail, liveSeason = null,
}) {
  useEffect(() => { onNeedOline?.() }, [onNeedOline])

  const chart = useMemo(() => buildDepthChart({ playersMap, abbr }), [playersMap, abbr])
  const olIndex = useMemo(() => buildOlIdIndex(playersMap), [playersMap])
  const owners = useMemo(() => buildOwnerIndex(rosterTeams), [rosterTeams])
  const olState = oline?.complete ? (oline.latestByTeam?.[abbr] ?? null) : null
  const ol = useMemo(() => buildOlSlots(olState, olIndex, playersMap), [olState, olIndex, playersMap])

  const caption = olState
    ? `Current depth chart (Sleeper; OL from ESPN via nflverse, as of ${olState.date})`
    : 'Current depth chart (Sleeper)'

  const slotCard = (code) => (
    <SlotCard
      key={code}
      testId={`dc-slot-${code}`}
      label={code}
      entries={chart.slots[code] ?? []}
      fantasy={FANTASY_SLOTS.has(code)}
      owners={owners}
      myTeamName={myTeamName}
      onOpen={onOpenPlayerDetail}
    />
  )
  const plainCard = (testId, label, entries) => (
    <SlotCard key={testId} testId={testId} label={label} entries={entries} owners={owners} myTeamName={myTeamName} />
  )
  const otherCard = (unit) => chart.other[unit]?.length
    ? plainCard(`dc-other-${unit}`, `${unit} · other`, chart.other[unit]) : null

  const olSlots = UNITS.find(u => u.id === 'OL').slots
  // OL unit: five cards in the formation row when a state is available; otherwise one status block
  // under the row (loading / not-yet-accruing / no-baseline).
  let olCards = null
  let olStatus = null
  if (oline == null) {
    olStatus = <p className="text-sm text-dp-muted italic">Loading offensive line…</p>
  } else if (oline.complete === false) {
    olStatus = (
      <DegradedBlock kind="not-yet-accruing">
        No offensive-line depth chart loaded for {liveSeason ?? 'this season'}.
      </DegradedBlock>
    )
  } else if (olState == null) {
    olStatus = (
      <DegradedBlock kind="no-baseline">
        No offensive-line depth chart for {abbr}.
      </DegradedBlock>
    )
  } else {
    olCards = olSlots.map(s => <OlCard key={s} slot={s} entries={ol.slots[s]} onOpen={onOpenPlayerDetail} />)
  }

  const wrOrder = ['LWR', 'SWR']
  const defenceRows = UNITS.filter(u => u.side === 'defence').map(u => {
    const cards = u.slots
      .filter(s => !(u.optional ?? []).includes(s) || (chart.slots[s]?.length ?? 0) > 0)
      .map(slotCard)
    if (chart.generic[u.generic]?.length) cards.push(plainCard(`dc-generic-${u.id}`, u.generic, chart.generic[u.generic]))
    const oc = otherCard(u.id)
    if (oc) cards.push(oc)
    return <div key={u.id} className={ROW}>{cards}</div>
  })

  const offenceOther = ['WR', 'TE', 'QB', 'RB'].map(otherCard).filter(Boolean)
  const olOther = ol.other.length ? [<OlOtherCard key="ol-other" entries={ol.other} />] : []
  const stOther = otherCard('ST')

  return (
    <div className="flex flex-col gap-3">
      <p data-testid="depth-caption" className="text-[11px] text-dp-muted">{caption}</p>

      <SectionHeading>Offence</SectionHeading>
      <div className={ROW}>
        {wrOrder.map(slotCard)}
        {olCards}
        {slotCard('TE')}
        {slotCard('RWR')}
      </div>
      {olStatus}
      <div className={ROW}>{slotCard('QB')}</div>
      <div className={ROW}>{slotCard('RB')}</div>
      {(offenceOther.length > 0 || olOther.length > 0) && <div className={ROW}>{offenceOther}{olOther}</div>}

      <SectionHeading>Defence</SectionHeading>
      {defenceRows}

      <SectionHeading>Special teams</SectionHeading>
      <div className={ROW}>
        {['K', 'P', 'LS'].map(slotCard)}
        {stOther}
      </div>

      {chart.unplaced.length > 0 && (
        <div className={ROW}>{plainCard('dc-unplaced', 'Unplaced', chart.unplaced)}</div>
      )}
    </div>
  )
}

function OlOtherCard({ entries }) {
  return (
    <div data-testid="dc-other-OL" className={CARD}>
      <div className="font-dp-mono text-[10px] tracking-[0.08em] uppercase text-dp-muted-2 mb-1">OL · other</div>
      {entries.map((e, i) => <div key={`${e.name}-${i}`} className="text-[11.5px] text-dp-muted">{e.name}</div>)}
    </div>
  )
}
