// View-only. `null` is never `0` — a player with no measurable points stays `null` through every
// sum, rank and median here; callers must not coerce it. `byPosition` attributes a started player's
// points by the PLAYER's own position, not the slot they fill (a FLEX RB counts to RB).
// Leaf module: imports nothing.

export const LINEUP_POSITIONS = ['QB', 'RB', 'WR', 'TE']
const NON_STARTING_SLOTS = new Set(['BN', 'TAXI', 'IR'])
const SLOT_ELIGIBILITY = {
  QB: ['QB'], RB: ['RB'], WR: ['WR'], TE: ['TE'],
  FLEX: ['RB', 'WR', 'TE'],
  SUPER_FLEX: ['QB', 'RB', 'WR', 'TE'],
}
const FLEX_ELIGIBLE = new Set(SLOT_ELIGIBILITY.FLEX)
const SUPER_FLEX_ELIGIBLE = new Set(SLOT_ELIGIBILITY.SUPER_FLEX)

// (rosterPositions ?? []) minus BN/TAXI/IR, order kept.
export function startingSlots(rosterPositions) {
  return (rosterPositions ?? []).filter(s => !NON_STARTING_SLOTS.has(s))
}

function median(values) {
  const finite = values.filter(v => v !== null).sort((a, b) => a - b)
  if (finite.length === 0) return null
  const mid = Math.floor(finite.length / 2)
  return finite.length % 2 === 0 ? (finite[mid - 1] + finite[mid]) / 2 : finite[mid]
}

// Finite points desc, nulls last; ties by player_id ascending (string compare).
function comparePoolEntries(a, b) {
  const aFinite = a.points !== null
  const bFinite = b.points !== null
  if (aFinite && bFinite && a.points !== b.points) return b.points - a.points
  if (aFinite !== bFinite) return aFinite ? -1 : 1
  const aId = String(a.player_id)
  const bId = String(b.player_id)
  return aId < bId ? -1 : aId > bId ? 1 : 0
}

function emptySlot(slot) {
  return { slot, player_id: null, name: null, position: null, points: null }
}

export function buildBestLineup(players, rosterPositions, getPoints) {
  const slotList = startingSlots(rosterPositions)
  const slots = slotList.map(emptySlot)

  const pools = { QB: [], RB: [], WR: [], TE: [] }
  const seen = new Set()
  for (const p of players ?? []) {
    if (!p || !LINEUP_POSITIONS.includes(p.position)) continue
    if (seen.has(p.player_id)) continue
    seen.add(p.player_id)
    const raw = getPoints(p)
    const points = Number.isFinite(raw) ? raw : null
    pools[p.position].push({ player_id: p.player_id, name: p.full_name ?? null, position: p.position, points })
  }
  for (const pos of LINEUP_POSITIONS) pools[pos].sort(comparePoolEntries)

  const slotCounts = {}
  for (const s of slotList) slotCounts[s] = (slotCounts[s] ?? 0) + 1
  const D = { QB: slotCounts.QB ?? 0, RB: slotCounts.RB ?? 0, WR: slotCounts.WR ?? 0, TE: slotCounts.TE ?? 0 }
  const F = slotCounts.FLEX ?? 0
  const S = slotCounts.SUPER_FLEX ?? 0

  const n = { QB: pools.QB.length, RB: pools.RB.length, WR: pools.WR.length, TE: pools.TE.length }
  const s = {
    QB: pools.QB.filter(x => x.points !== null).length,
    RB: pools.RB.filter(x => x.points !== null).length,
    WR: pools.WR.filter(x => x.points !== null).length,
    TE: pools.TE.filter(x => x.points !== null).length,
  }

  const prefix = {}
  for (const pos of LINEUP_POSITIONS) {
    const arr = [0]
    for (const entry of pools[pos]) arr.push(arr[arr.length - 1] + (entry.points ?? 0))
    prefix[pos] = arr
  }

  const upperBound = pos => D[pos] + (FLEX_ELIGIBLE.has(pos) ? F : 0) + (SUPER_FLEX_ELIGIBLE.has(pos) ? S : 0)

  let best = null
  const qbMax = Math.min(n.QB, upperBound('QB'))
  const rbMax = Math.min(n.RB, upperBound('RB'))
  const wrMax = Math.min(n.WR, upperBound('WR'))
  const teMax = Math.min(n.TE, upperBound('TE'))

  for (let kQB = 0; kQB <= qbMax; kQB++) {
    const eQB = Math.max(0, kQB - D.QB)
    if (eQB > S) continue
    for (let kRB = 0; kRB <= rbMax; kRB++) {
      const eRB = Math.max(0, kRB - D.RB)
      for (let kWR = 0; kWR <= wrMax; kWR++) {
        const eWR = Math.max(0, kWR - D.WR)
        for (let kTE = 0; kTE <= teMax; kTE++) {
          const eTE = Math.max(0, kTE - D.TE)
          if (eRB + eWR + eTE > F + S - eQB) continue

          const scoringStarters = Math.min(kQB, s.QB) + Math.min(kRB, s.RB) + Math.min(kWR, s.WR) + Math.min(kTE, s.TE)
          const points = prefix.QB[kQB] + prefix.RB[kRB] + prefix.WR[kWR] + prefix.TE[kTE]
          const starters = kQB + kRB + kWR + kTE

          if (
            best === null ||
            scoringStarters > best.scoringStarters ||
            (scoringStarters === best.scoringStarters && points > best.points) ||
            (scoringStarters === best.scoringStarters && points === best.points && starters > best.starters)
          ) {
            best = { scoringStarters, points, starters, k: { QB: kQB, RB: kRB, WR: kWR, TE: kTE } }
          }
        }
      }
    }
  }

  // Placement (canonical): dedicated slots first (best -> first slot), then QB excess into
  // SUPER_FLEX, then pooled RB/WR/TE excess into FLEX then the remaining SUPER_FLEX slots.
  const indicesOf = slot => slotList.reduce((acc, s2, i) => (s2 === slot ? (acc.push(i), acc) : acc), [])
  const dedicatedIndices = { QB: indicesOf('QB'), RB: indicesOf('RB'), WR: indicesOf('WR'), TE: indicesOf('TE') }
  const flexIndices = indicesOf('FLEX')
  const superFlexIndices = indicesOf('SUPER_FLEX')

  const placeAt = (idx, entry) => {
    slots[idx] = { slot: slotList[idx], player_id: entry.player_id, name: entry.name, position: entry.position, points: entry.points }
  }

  const k = best.k
  for (const pos of LINEUP_POSITIONS) {
    const dedicatedCount = Math.min(k[pos], D[pos])
    for (let i = 0; i < dedicatedCount; i++) placeAt(dedicatedIndices[pos][i], pools[pos][i])
  }

  const qbExcess = pools.QB.slice(D.QB, k.QB)
  for (let i = 0; i < qbExcess.length; i++) placeAt(superFlexIndices[i], qbExcess[i])

  const flexExcess = [
    ...pools.RB.slice(D.RB, k.RB),
    ...pools.WR.slice(D.WR, k.WR),
    ...pools.TE.slice(D.TE, k.TE),
  ].sort(comparePoolEntries)
  for (let i = 0; i < flexExcess.length && i < flexIndices.length; i++) placeAt(flexIndices[i], flexExcess[i])
  const remaining = flexExcess.slice(flexIndices.length)
  for (let i = 0; i < remaining.length; i++) placeAt(superFlexIndices[qbExcess.length + i], remaining[i])

  const byPositionSum = { QB: 0, RB: 0, WR: 0, TE: 0 }
  const byPositionHasFinite = { QB: false, RB: false, WR: false, TE: false }
  const unscored = { QB: 0, RB: 0, WR: 0, TE: 0 }
  let total = 0
  let hasFiniteTotal = false

  for (const slot of slots) {
    if (slot.player_id === null) continue
    if (slot.points !== null) {
      byPositionSum[slot.position] += slot.points
      byPositionHasFinite[slot.position] = true
      total += slot.points
      hasFiniteTotal = true
    } else {
      unscored[slot.position] += 1
    }
  }

  const byPosition = {}
  for (const pos of LINEUP_POSITIONS) byPosition[pos] = byPositionHasFinite[pos] ? byPositionSum[pos] : null

  return { slots, byPosition, unscored, total: hasFiniteTotal ? total : null }
}

export function buildLeagueLineups({ rosterTeams, careerStats, seasonProjections, rosterPositions, season }) {
  if (!rosterTeams || rosterTeams.length === 0) return []

  return rosterTeams.map(team => {
    const pool = [...(team.starters ?? []), ...(team.bench ?? []), ...(team.reserve ?? [])]
      .map(p => ({ player_id: p.id, position: p.position, full_name: p.full_name }))

    const lastPoints = player => {
      const d = careerStats?.[season]?.[player.player_id]
      if (d && d.gamesPlayed > 0 && Number.isFinite(d.fantasyPoints)) return d.fantasyPoints / d.gamesPlayed
      return null
    }
    const projPoints = player => {
      const v = seasonProjections?.[player.player_id]?.projectedPPG
      return Number.isFinite(v) ? v : null
    }

    return {
      rosterId: team.rosterId,
      teamName: team.teamName,
      last: buildBestLineup(pool, rosterPositions, lastPoints),
      proj: buildBestLineup(pool, rosterPositions, projPoints),
    }
  })
}

function sortByValueDesc(list) {
  return [...list].sort((a, b) => {
    const aFinite = a.value !== null
    const bFinite = b.value !== null
    if (aFinite && bFinite && a.value !== b.value) return b.value - a.value
    if (aFinite !== bFinite) return aFinite ? -1 : 1
    return a.rosterId < b.rosterId ? -1 : a.rosterId > b.rosterId ? 1 : 0
  })
}

// Competition ranking over finite values, descending, on an already value-sorted array
// (sortByValueDesc's output): equal values share a rank and the next distinct value's rank skips
// ahead to its 1-indexed position (e.g. 1, 2, 2, 4). A null value gets a null rank.
function rankMap(sortedAll) {
  const map = new Map()
  let rank = 0
  let seenCount = 0
  let prevValue
  let prevIsFinite = false
  for (const entry of sortedAll) {
    seenCount++
    if (entry.value === null) {
      map.set(entry.rosterId, null)
      continue
    }
    if (!prevIsFinite || entry.value !== prevValue) {
      rank = seenCount
      prevValue = entry.value
      prevIsFinite = true
    }
    map.set(entry.rosterId, rank)
  }
  return map
}

function slotsLabel(pos, slots) {
  const types = slots.map(s => s.slot)
  const count = t => types.filter(x => x === t).length
  if (pos === 'Lineup') {
    const n = types.length
    return `${n} slot${n === 1 ? '' : 's'}`
  }
  const dCount = count(pos)
  const fCount = count('FLEX')
  const sCount = count('SUPER_FLEX')
  let label = `${dCount} slot${dCount === 1 ? '' : 's'}`
  if (pos !== 'QB' && fCount > 0) label += ` + ${fCount} flex`
  if (sCount > 0) label += ` + ${sCount} superflex`
  return label
}

// `move` = projRank - lastRank. Positive means the rank NUMBER rose, i.e. the team fell in the
// standings for this position/lineup — positive is worse, negative is better.
export function buildPositionLadders(leagueLineups, myRosterId) {
  if (!leagueLineups || leagueLineups.length === 0) return []

  const positions = ['QB', 'RB', 'WR', 'TE', 'Lineup']
  const myIndex = leagueLineups.findIndex(l => l.rosterId === myRosterId)
  const found = myIndex !== -1

  return positions.map(pos => {
    const valueOf = (lineup, side) => (pos === 'Lineup' ? lineup[side].total : lineup[side].byPosition[pos])

    const lastValues = leagueLineups.map(l => ({ rosterId: l.rosterId, teamName: l.teamName, value: valueOf(l, 'last') }))
    const projValues = leagueLineups.map(l => ({ rosterId: l.rosterId, teamName: l.teamName, value: valueOf(l, 'proj') }))

    const lastAll = sortByValueDesc(lastValues)
    const projAll = sortByValueDesc(projValues)
    const lastRanks = rankMap(lastAll)
    const projRanks = rankMap(projAll)

    const lastMedian = median(lastValues.map(v => v.value))
    const projMedian = median(projValues.map(v => v.value))

    const lastMine = found ? lastValues[myIndex].value : null
    const projMine = found ? projValues[myIndex].value : null
    const lastRank = found ? lastRanks.get(myRosterId) : null
    const projRank = found ? projRanks.get(myRosterId) : null
    const move = lastRank !== null && lastRank !== undefined && projRank !== null && projRank !== undefined
      ? projRank - lastRank
      : null

    return {
      pos,
      slotsLabel: slotsLabel(pos, leagueLineups[0].last.slots),
      lastMine, lastRank, lastMedian, lastAll,
      projMine, projRank, projMedian, projAll,
      move,
    }
  })
}

export function buildWeakestSlots(leagueLineups, myRosterId) {
  const mine = leagueLineups.find(l => l.rosterId === myRosterId)?.proj.slots
  if (!mine) return []

  const others = leagueLineups.filter(l => l.rosterId !== myRosterId)
  const results = []

  for (let i = 0; i < mine.length; i++) {
    if (mine[i].points === null) continue
    const otherValues = others.map(l => l.proj.slots[i]?.points ?? null)
    const med = median(otherValues)
    if (med === null) continue
    const loss = med - mine[i].points
    if (loss > 0) {
      results.push({
        slot: mine[i].slot, slotIndex: i, player_id: mine[i].player_id, name: mine[i].name,
        mine: mine[i].points, median: med, loss,
      })
    }
  }

  results.sort((a, b) => b.loss - a.loss || a.slotIndex - b.slotIndex)
  return results
}
