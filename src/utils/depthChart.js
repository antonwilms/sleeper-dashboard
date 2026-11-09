// Team depth chart (view-only). Sleeper's `depth_chart_position` code IS the slot; `position` is not
// consulted for placement except to route an unknown code (D4). Sleeper's generic `OL` code is not
// rendered — OL slots come only from nflverse/oline (D2). A null code means "not on the depth chart"
// (D3). Unknown codes are never dropped. Never imported by projection/scoring.
//
// Deliberately NOT `buildTeamDepthChart` (src/utils/teamContext.js — a PIPELINE module used by
// usePlayerProfile and projectionSnapshot): that groups by POSITION, sends a null order to 99 and
// breaks ties by PPG. This module groups by Sleeper SLOT code, sorts null order last, breaks ties by
// name, and uses no PPG — so "starter" means entries[0] of a slot here, a different notion. Do not
// import, reuse or unify them.

import { normalizeTeamForSchedule } from './nflStats'
import { surnameAgrees } from './playerIdCrosswalk'
import { rosteredPlayers } from './rosterSlots'

// Display order inside each unit is left → right on the formation.
export const UNITS = [
  { id: 'WR', side: 'offence', slots: ['LWR', 'SWR', 'RWR'] },
  { id: 'TE', side: 'offence', slots: ['TE'] },
  { id: 'OL', side: 'offence', slots: ['LT', 'LG', 'C', 'RG', 'RT'] }, // oline-sourced (§3b)
  { id: 'QB', side: 'offence', slots: ['QB'] },
  { id: 'RB', side: 'offence', slots: ['RB'] },
  { id: 'DL', side: 'defence', slots: ['LDE', 'LDT', 'NT', 'RDT', 'RDE'], optional: ['NT'], generic: 'DL' },
  { id: 'LB', side: 'defence', slots: ['LOLB', 'WLB', 'LILB', 'MLB', 'RILB', 'SLB', 'ROLB'], optional: ['WLB', 'LILB', 'RILB', 'SLB'], generic: 'LB' },
  { id: 'DB', side: 'defence', slots: ['LCB', 'NB', 'SS', 'FS', 'RCB'], generic: 'DB' },
  { id: 'ST', side: 'special', slots: ['K', 'P', 'LS'] },
]
export const SLEEPER_OL_CODE = 'OL'
export const FANTASY_SLOTS = new Set(['QB', 'RB', 'LWR', 'SWR', 'RWR', 'TE', 'K'])

const OL_SLOTS = UNITS.find(u => u.id === 'OL').slots

// Derived from UNITS: every non-OL slot code → its unit id; each unit's `generic` code → that unit.
export const SLOT_UNIT = (() => {
  const m = {}
  for (const u of UNITS) {
    if (u.id === 'OL') continue
    for (const s of u.slots) m[s] = u.id
    if (u.generic) m[u.generic] = u.id
  }
  return m
})()

export const POSITION_UNIT = {
  QB: 'QB', RB: 'RB', FB: 'RB', WR: 'WR', TE: 'TE', DE: 'DL', DT: 'DL', NT: 'DL', DL: 'DL',
  LB: 'LB', ILB: 'LB', OLB: 'LB', CB: 'DB', S: 'DB', SS: 'DB', FS: 'DB', DB: 'DB', K: 'ST', P: 'ST', LS: 'ST',
}

const GENERIC_UNIT = Object.fromEntries(UNITS.filter(u => u.generic).map(u => [u.generic, u.id]))
const SLOT_KEYS = UNITS.filter(u => u.id !== 'OL').flatMap(u => u.slots)

function entryName(p, sid) {
  return p.full_name ?? ([p.first_name, p.last_name].filter(Boolean).join(' ') || sid)
}

function compareEntries(a, b) {
  const ao = a.order, bo = b.order
  if (ao !== bo) {
    if (ao == null) return 1
    if (bo == null) return -1
    return ao - bo
  }
  const n = a.name.localeCompare(b.name)
  if (n !== 0) return n
  return String(a.id).localeCompare(String(b.id))
}

export function buildDepthChart({ playersMap, abbr }) {
  const slots = {}
  for (const s of SLOT_KEYS) slots[s] = []
  const generic = { DL: [], LB: [], DB: [] }
  const other = {}
  const unplaced = []

  if (playersMap) {
    for (const [sid, p] of Object.entries(playersMap)) {
      if (!p || normalizeTeamForSchedule(p.team) !== abbr) continue
      const code = p.depth_chart_position
      if (typeof code !== 'string' || code === '' || code === SLEEPER_OL_CODE) continue
      const entry = {
        id: sid,
        name: entryName(p, sid),
        position: p.position ?? null,
        code,
        order: typeof p.depth_chart_order === 'number' ? p.depth_chart_order : null,
        injuryStatus: p.injury_status || null,
        injuryBodyPart: p.injury_body_part || null,
      }
      if (Object.prototype.hasOwnProperty.call(slots, code)) slots[code].push(entry)
      else if (Object.prototype.hasOwnProperty.call(GENERIC_UNIT, code)) generic[GENERIC_UNIT[code]].push(entry)
      else {
        const unit = POSITION_UNIT[p.position]
        if (unit) (other[unit] ??= []).push(entry)
        else unplaced.push(entry)
      }
    }
  }

  for (const list of Object.values(slots)) list.sort(compareEntries)
  for (const list of Object.values(generic)) list.sort(compareEntries)
  for (const list of Object.values(other)) list.sort(compareEntries)
  unplaced.sort(compareEntries)
  return { slots, generic, other, unplaced }
}

// ---- OL (nflverse/oline) ----

function stateTime(s) {
  const t = Date.parse(s?.dt)
  return Number.isNaN(t) ? Date.parse(s?.date) : t
}

// Per team, the state with the max timestamp (not by array position).
export function selectLatestOlineStates(teams) {
  const out = {}
  if (!teams || typeof teams !== 'object') return out
  for (const [abbr, t] of Object.entries(teams)) {
    const states = t?.states
    if (!Array.isArray(states) || states.length === 0) continue
    let best = null, bestT = -Infinity
    for (const s of states) {
      const ts = stateTime(s)
      const cmp = Number.isNaN(ts) ? -Infinity : ts
      if (best == null || cmp > bestT) { best = s; bestT = cmp }
    }
    out[abbr] = { dt: best.dt, date: best.date, ol: best.ol }
  }
  return out
}

function idKey(v) {
  if (v == null) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

// Sleeper's own gsis_id / espn_id fields are the crosswalk (D1). A key held by 2+ sids is removed.
export function buildOlIdIndex(playersMap) {
  const byGsis = new Map(), byEspn = new Map()
  const dupG = new Set(), dupE = new Set()
  const add = (map, dup, key, sid) => {
    if (key == null) return
    if (map.has(key)) { dup.add(key); return }
    map.set(key, sid)
  }
  for (const [sid, p] of Object.entries(playersMap ?? {})) {
    if (!p) continue
    add(byGsis, dupG, idKey(p.gsis_id), sid)
    add(byEspn, dupE, idKey(p.espn_id), sid)
  }
  for (const k of dupG) byGsis.delete(k)
  for (const k of dupE) byEspn.delete(k)
  return { byGsis, byEspn }
}

// Id-only join; surnameAgrees is a guard on an id hit, never a match by itself.
export function resolveOlSleeperId(entry, index, playersMap) {
  const gk = idKey(entry?.gsisId), ek = idKey(entry?.espnId)
  const g = gk != null ? index.byGsis.get(gk) : undefined
  const e = ek != null ? index.byEspn.get(ek) : undefined
  if (g && e && g !== e) return null
  const sid = g ?? e ?? null
  if (!sid) return null
  if (!surnameAgrees(entry.name, playersMap?.[sid]?.full_name)) return null
  return sid
}

export function buildOlSlots(state, index, playersMap) {
  const slots = {}
  for (const s of OL_SLOTS) slots[s] = []
  const other = []
  for (const e of state?.ol ?? []) {
    const oe = { name: e.name, rank: e.rank, slot: e.slot, sleeperId: resolveOlSleeperId(e, index, playersMap) }
    if (Object.prototype.hasOwnProperty.call(slots, e.slot)) slots[e.slot].push(oe)
    else other.push(oe)
  }
  const byRank = (a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity)
  for (const l of Object.values(slots)) l.sort(byRank)
  other.sort(byRank)
  return { slots, other }
}

export function buildOwnerIndex(rosterTeams) {
  const m = new Map()
  for (const team of rosterTeams ?? []) {
    for (const p of rosteredPlayers(team)) m.set(p.id, team.teamName)
  }
  return m
}
