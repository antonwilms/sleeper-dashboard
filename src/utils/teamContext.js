// ---------------------------------------------------------------------------
// QB quality by team
// ---------------------------------------------------------------------------

// Scans playerRows for QBs, picks the starter (highest PPG or depth-chart QB1)
// per team, and returns their dynasty quality score (0–100) keyed by NFL team.
// Dynasty score is preferred; falls back to KTC value / 100; neutral 50 if absent.
// includeUnrostered=false (default): rostered-only — legacy behavior, projection Step 7b input.
// includeUnrostered=true: league-wide (F1-A) — dynasty OQ modifier consumer.
export function computeQBQualityByTeam(playerRows, depthMap = null, includeUnrostered = false) {
  const byTeam = {}  // nfl_team → array of { quality, ppg, depthOrder }

  for (const row of playerRows) {
    if (row.position !== 'QB' || !row.nfl_team) continue
    if (includeUnrostered) {
      if (row.nfl_team === 'FA') continue   // free agents have no team offense
    } else {
      if (row.ownerTeamName == null) continue   // legacy rostered-only behavior (projection Step 7b input)
    }

    const quality = row.dynastyScore?.score
      ?? (row.ktcValue != null ? Math.min(row.ktcValue / 100, 100) : null)
      ?? 50

    const depthOrder = depthMap?.[row.player_id]?.depthOrder ?? null
    const team = row.nfl_team
    if (!byTeam[team]) byTeam[team] = []
    byTeam[team].push({ quality, ppg: row.currentSeasonPPG ?? 0, depthOrder })
  }

  const result = {}
  for (const [team, qbs] of Object.entries(byTeam)) {
    const dcQB1 = qbs.find(q => q.depthOrder === 1)
    if (dcQB1) {
      result[team] = dcQB1.quality
    } else {
      const best = qbs.reduce((b, q) => q.ppg > b.ppg ? q : b, qbs[0])
      result[team] = best.quality
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// QB-quality OQ modifier
// ---------------------------------------------------------------------------
// Extracted from App.jsx (playerRowsWithQBMod memo) so the OQ-modifier math can
// be unit-tested independently. Called at the same point in the pipeline — this
// is not a pipeline reorder.

/**
 * Applies the QB-quality modifier to one player row's opportunityQuality
 * component and dynasty score. Pure: returns the SAME row reference when the
 * modifier does not apply (QB rows, missing components, team not in map,
 * non-finite qbScore, non-workhorse RB), otherwise a new row object.
 *
 * @param {Object} row              playerRowsWithKTC row
 * @param {Object} qbQualityByTeam  { [nfl_team]: number 0–100 }
 * @returns {Object} row (unchanged reference) or modified copy
 */
export function applyQBQualityModifier(row, qbQualityByTeam) {
  const pos = row.position
  const ds  = row.dynastyScore
  if (!ds?.components || pos === 'QB') return row

  const qbScore = qbQualityByTeam[row.nfl_team]
  if (qbScore == null || !Number.isFinite(qbScore)) return row

  const oq         = ds.components.opportunityQuality
  const carryShare = ds.signals?.carryShare ?? null

  let modifier = null
  if (pos === 'WR' || pos === 'TE') {
    modifier = 0.85 + (qbScore / 100) * 0.30
  } else if (pos === 'RB' && carryShare != null && carryShare > 0.30) {
    modifier = 1.10 - (qbScore / 100) * 0.15
  }

  if (modifier == null) return row

  const oldOq    = oq.value
  const newOq    = Math.round(Math.max(0, Math.min(100, oldOq * modifier)))
  const newScore = Math.round(Math.max(0, Math.min(100, ds.score + (newOq - oldOq) * 0.15)))
  const modPct   = Math.round((modifier - 1) * 100)

  return {
    ...row,
    dynastyScore: {
      ...ds,
      score: newScore,
      components: {
        ...ds.components,
        opportunityQuality: { ...oq, value: newOq },
      },
      signals: {
        ...ds.signals,
        qbQualityScore:    Math.round(qbScore),
        qbModifierApplied: modPct,
      },
    },
  }
}

// ---------------------------------------------------------------------------
// Team context — carry share, target share, team offensive quality
// ---------------------------------------------------------------------------
// Uses only current-season data to keep the signal timely.
// QBs are skipped: market-share concepts don't apply to passers.

export function computeTeamContext(careerStats, playersMap, currentSeason) {
  const seasonData = careerStats?.[currentSeason]
  if (!seasonData) return { teamOffense: {}, playerShares: {} }

  // ── Step 1: Aggregate per-team totals ────────────────────────────────────
  const teamTotals = {}

  for (const [playerId, data] of Object.entries(seasonData)) {
    if ((data.gamesPlayed ?? 0) < 1) continue
    const player = playersMap[playerId]
    if (!player?.team) continue

    const team = player.team
    if (!teamTotals[team]) teamTotals[team] = { rushAtt: 0, rec: 0, fantasyPts: 0 }

    const s = data.stats ?? {}
    teamTotals[team].rushAtt   += s.rush_att ?? 0
    teamTotals[team].rec       += s.rec      ?? 0
    teamTotals[team].fantasyPts += data.fantasyPoints ?? 0
  }

  // ── Step 3: Rank teams by total fantasy points scored ────────────────────
  const sorted = Object.entries(teamTotals).sort(([, a], [, b]) => b.fantasyPts - a.fantasyPts)

  const teamOffense = {}
  sorted.forEach(([team, totals], i) => {
    teamOffense[team] = {
      rank:      i + 1,
      totalPts:  Math.round(totals.fantasyPts * 10) / 10,
      rushAtt:   totals.rushAtt,
      rec:       totals.rec,
      season:    currentSeason,
    }
  })

  // ── Step 2: Compute player market shares (≥ 4 games) ─────────────────────
  const playerShares = {}

  for (const [playerId, data] of Object.entries(seasonData)) {
    if ((data.gamesPlayed ?? 0) < 4) continue
    const player = playersMap[playerId]
    if (!player?.team || !player.position) continue

    const team   = player.team
    const totals = teamTotals[team]
    if (!totals) continue

    const s   = data.stats ?? {}
    const pos = player.position

    if (pos === 'RB') {
      const carryShare = (s.rush_att ?? 0) / Math.max(totals.rushAtt, 1)
      playerShares[playerId] = {
        carryShare:      Math.round(carryShare * 1000) / 1000,
        targetShare:     null,
        teamOffenseRank: teamOffense[team]?.rank ?? null,
        season:          currentSeason,
      }
    } else if (pos === 'WR' || pos === 'TE') {
      const targetShare = (s.rec ?? 0) / Math.max(totals.rec, 1)
      playerShares[playerId] = {
        carryShare:      null,
        targetShare:     Math.round(targetShare * 1000) / 1000,
        teamOffenseRank: teamOffense[team]?.rank ?? null,
        season:          currentSeason,
      }
    }
    // QBs skipped
  }

  return { teamOffense, playerShares }
}

// ---------------------------------------------------------------------------
// Historical team totals
// ---------------------------------------------------------------------------
// Note: team totals are approximated from the active players currently in
// playersMap only — retired players' contributions are absent from older
// seasons. This is a known limitation; share values for historical seasons
// may undercount the true denominator.
export function computeHistoricalTeamTotals(careerStats, playersMap) {
  const result = {}
  for (const [season, seasonData] of Object.entries(careerStats)) {
    const teamTotals = {}
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 1) continue
      const team = playersMap[playerId]?.team
      if (!team) continue
      if (!teamTotals[team]) teamTotals[team] = { rushAtt: 0, rec: 0, recTgt: 0, rushRz: 0, recRz: 0 }
      const s = data.stats ?? {}
      teamTotals[team].rushAtt += s.rush_att     ?? 0
      teamTotals[team].rec    += s.rec           ?? 0
      teamTotals[team].recTgt += s.rec_tgt       ?? 0
      teamTotals[team].rushRz += s.rush_rz_att   ?? 0
      teamTotals[team].recRz  += s.rec_rz_tgt    ?? 0
    }
    result[season] = teamTotals
  }
  return result
}

// ---------------------------------------------------------------------------
// Historical player shares
// ---------------------------------------------------------------------------
// Returns { [player_id]: [{ season, share, gamesPlayed }] } sorted oldest→newest.
// RBs: share = rush_att / team rushAtt.
// WRs/TEs: share = rec_tgt / team recTgt if available, else rec / team rec.
// Requires gamesPlayed ≥ 8. QBs are skipped.
export function computeHistoricalShares(careerStats, playersMap, historicalTeamTotals) {
  const result = {}
  const allSeasons = Object.keys(careerStats).map(Number).sort()

  for (const season of allSeasons) {
    const seasonData = careerStats[season] ?? {}
    for (const [playerId, data] of Object.entries(seasonData)) {
      if ((data.gamesPlayed ?? 0) < 8) continue
      const player = playersMap[playerId]
      if (!player) continue
      const pos = player.position
      if (!['RB', 'WR', 'TE'].includes(pos)) continue
      const team = player.team
      if (!team) continue
      const teamTotals = historicalTeamTotals[season]?.[team]
      if (!teamTotals) continue

      const s = data.stats ?? {}
      let share = null
      if (pos === 'RB') {
        const rushAtt = s.rush_att ?? 0
        if (rushAtt > 0) share = rushAtt / Math.max(teamTotals.rushAtt, 1)
      } else {
        const recTgt = s.rec_tgt ?? 0
        if (recTgt > 0 && teamTotals.recTgt > 0) {
          share = recTgt / Math.max(teamTotals.recTgt, 1)
        } else {
          const rec = s.rec ?? 0
          if (rec > 0) share = rec / Math.max(teamTotals.rec, 1)
        }
      }
      if (share === null || !isFinite(share)) continue

      if (!result[playerId]) result[playerId] = []
      result[playerId].push({ season, share: Math.round(share * 1000) / 1000, gamesPlayed: data.gamesPlayed })
    }
  }
  return result
}

// ---------------------------------------------------------------------------
// Share trend analysis
// ---------------------------------------------------------------------------
// Returns null when fewer than 2 seasons of share data are available.
export function computeShareTrend(shareHistory) {
  if (!shareHistory || shareHistory.length < 2) return null

  const recentShare = shareHistory[shareHistory.length - 1].share

  // Weighted average of prior seasons — most recent prior = 50%, next = 30%, oldest = 20%
  const prior = shareHistory.slice(0, -1)
  const p1 = prior[prior.length - 1]?.share ?? null
  const p2 = prior[prior.length - 2]?.share ?? null
  const p3 = prior[prior.length - 3]?.share ?? null
  const w1 = p1 != null ? 0.50 : 0
  const w2 = p2 != null ? 0.30 : 0
  const w3 = p3 != null ? 0.20 : 0
  const totalW = w1 + w2 + w3
  const priorShare = ((p1 ?? 0) * w1 + (p2 ?? 0) * w2 + (p3 ?? 0) * w3) / totalW

  const trend = (recentShare - priorShare) / Math.max(priorShare, 0.01)

  let shareTrendLabel
  if      (trend >  0.20) shareTrendLabel = 'growing'
  else if (trend >  0.05) shareTrendLabel = 'expanding'
  else if (trend >= -0.05) shareTrendLabel = 'stable'
  else if (trend >= -0.20) shareTrendLabel = 'shrinking'
  else                     shareTrendLabel = 'declining'

  const shares = shareHistory.map(s => s.share)
  const mean = shares.reduce((a, b) => a + b, 0) / shares.length
  const shareVolatility = Math.sqrt(
    shares.reduce((s, v) => s + (v - mean) ** 2, 0) / (shares.length - 1)
  )
  const volatilityLabel = shareVolatility < 0.05 ? 'entrenched'
    : shareVolatility <= 0.10 ? 'moderate'
    : 'volatile'

  return { recentShare, priorShare, trend, shareTrendLabel, shareVolatility, volatilityLabel }
}


// ---------------------------------------------------------------------------
// Team depth chart builder
// ---------------------------------------------------------------------------

/**
 * Builds a grouped, sorted depth chart for a given NFL team.
 *
 * Uses depth_chart_order from playersMap directly (avoids needing a separate
 * depthMap argument). Falls back to 99 when the field is absent.
 *
 * @param {string} nflTeam    - NFL team abbreviation (e.g. 'BUF')
 * @param {Object} playersMap - { [player_id]: SleeperPlayer }
 * @param {Array}  playerRows - playerRowsWithRanks from the pipeline
 * @returns {{ QB: [], RB: [], WR: [], TE: [] }}
 */
export function buildTeamDepthChart(nflTeam, playersMap, playerRows) {
  if (!nflTeam || !playersMap) return { QB: [], RB: [], WR: [], TE: [] }

  const POSITIONS = ['QB', 'RB', 'WR', 'TE']

  // Build O(1) lookup from playerRows
  const rowById = {}
  for (const row of (playerRows ?? [])) rowById[row.player_id] = row

  const groups = { QB: [], RB: [], WR: [], TE: [] }

  for (const [pid, p] of Object.entries(playersMap)) {
    if (!POSITIONS.includes(p.position)) continue
    if (p.team !== nflTeam) continue
    // Exclude ghost entries: must have age or appear in playerRows
    if (!p.age && !rowById[pid]) continue

    const row = rowById[pid]
    const depthOrder = p.depth_chart_order ?? 99

    groups[p.position].push({
      player_id:       pid,
      full_name:       p.full_name ?? pid,
      age:             p.age ?? null,
      depthOrder,
      dynastyLabel:    row?.dynastyScore?.label ?? null,
      dynastyScore:    row?.dynastyScore?.score ?? null,
      dynastyConf:     row?.dynastyScore?.confidence ?? null,
      ktcValue:        row?.ktcValue ?? null,
      currentSeasonPPG: row?.currentSeasonPPG ?? 0,
    })
  }

  // Sort: depth order asc, PPG desc as tiebreaker
  for (const pos of POSITIONS) {
    groups[pos].sort((a, b) =>
      a.depthOrder !== b.depthOrder
        ? a.depthOrder - b.depthOrder
        : b.currentSeasonPPG - a.currentSeasonPPG
    )
  }

  return groups
}
