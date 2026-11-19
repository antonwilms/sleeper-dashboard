// week-w-matchup-flags-visuals.md §2a — start/sit flags for `/week`'s lineup. Compares Sleeper's
// weekly projection (PROJ) only, with OURS shown alongside; no combined score, no swap, no
// recommendation, nothing reordered. Dynasty score, KTC and ROS are never read. View-only.

import { SLOT_ELIGIBILITY } from './lineup'

const finite = v => typeof v === 'number' && Number.isFinite(v)

export function buildStartSitFlags({ starters, bench, ownByPlayer, unavailableStatuses }) {
  const unavailable = new Set(unavailableStatuses ?? [])
  const st = starters ?? []
  const bn = bench ?? []
  // PROVISIONAL(heuristic): OURS agree/disagree in a lineup flag · compares weeklyOwnProjection.js's heuristic values, not a model verdict · a fitted, graded weekly model would make it real
  const oursOf = id => (finite(ownByPlayer?.[id]?.value) ? ownByPlayer[id].value : null)
  const available = row => row.player_id != null && !row.bye && !unavailable.has(row.injuryStatus)

  const basisAvailable = [...st, ...bn].some(r => r.player_id != null && r.points != null)
  const flags = []
  const uncheckedSlots = []

  const causeOf = s => {
    if (s.bye) return 'bye'
    if (unavailable.has(s.injuryStatus)) return 'status'
    if (s.points == null) return 'no-proj'
    return null
  }

  const makeFlag = (s, i, cause, kind, z, via) => {
    let ours = null
    if (kind === 'higher') {
      const bo = oursOf(z.player_id)
      const so = oursOf(s.player_id)
      if (bo != null && so != null) ours = bo > so ? 'agree' : bo < so ? 'disagree' : 'level'
    }
    return {
      slotIndex: i, slot: s.slot, starterId: s.player_id, starterName: s.name, kind, cause,
      status: cause === 'status' ? s.injuryStatus : null,
      starterProj: s.points ?? null, starterOurs: oursOf(s.player_id),
      bench: { id: z.player_id, name: z.name, proj: z.points, ours: oursOf(z.player_id) },
      ours, via,
    }
  }

  st.forEach((s, i) => {
    if (s.player_id == null) return
    const eligible = SLOT_ELIGIBILITY[s.slot]
    if (!eligible) {
      if (!uncheckedSlots.includes(s.slot)) uncheckedSlots.push(s.slot)
      return
    }
    const cause = causeOf(s)

    // Rule 2 — direct check.
    let best = null
    for (const b of bn) {
      if (!available(b) || !eligible.includes(b.position) || b.points == null) continue
      if (best == null || b.points > best.points) best = b
    }
    if (best) {
      if (cause) { flags.push(makeFlag(s, i, cause, 'unavailable', best, null)); return }
      if (best.points > s.points) { flags.push(makeFlag(s, i, null, 'higher', best, null)); return }
    }

    // Rule 3 — one-swap check.
    let swap = null
    st.forEach((x, j) => {
      if (j === i || !available(x)) return
      const A = x.slot
      if (!SLOT_ELIGIBILITY[A] || !eligible.includes(x.position)) return
      for (const z of bn) {
        if (!available(z) || z.points == null) continue
        if (!SLOT_ELIGIBILITY[A].includes(z.position) || eligible.includes(z.position)) continue
        if (!cause && !(z.points > s.points)) continue
        if (swap == null || z.points > swap.z.points || (z.points === swap.z.points && j < swap.j)) swap = { x, j, z }
      }
    })
    if (swap) {
      const via = {
        moveId: swap.x.player_id, moveName: swap.x.name, moveProj: swap.x.points ?? null,
        fromSlot: swap.x.slot, fromSlotIndex: swap.j, toSlot: s.slot,
      }
      flags.push(makeFlag(s, i, cause, cause ? 'unavailable' : 'higher', swap.z, via))
    }
  })

  return { flags, uncheckedSlots, basisAvailable }
}
