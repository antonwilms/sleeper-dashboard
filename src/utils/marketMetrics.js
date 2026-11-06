// View-only, pure. The Market metric registry and within-position ranking over WindowStats
// (see marketWindowStats.js). Never feeds projection/scoring.

const ALL = ['QB', 'RB', 'WR', 'TE']
const NA = '—'
const fin = v => typeof v === 'number' && Number.isFinite(v)
const int = v => (fin(v) ? String(Math.round(v)) : NA)
const dec1 = v => (fin(v) ? v.toFixed(1) : NA)
const dec2 = v => (fin(v) ? v.toFixed(2) : NA)
const pct1 = v => (fin(v) ? `${(v * 100).toFixed(1)}%` : NA)
const rating = dec1
const signed1 = v => (fin(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(1)}` : NA)

const PASS = { stat: 'pass_att', perGame: 14 }
const RUSH = { stat: 'rush_att', perGame: 6 }
const TGT = { stat: 'rec_tgt', perGame: 3 }

const tot = k => ws => ws.totals[k]
// null only when every addend is null; a null addend otherwise counts 0.
const sumTot = (...ks) => ws => {
  const v = ks.map(k => ws.totals[k])
  return v.every(x => x == null) ? null : v.reduce((a, x) => a + (x ?? 0), 0)
}
const perG = f => ws => {
  const t = f(ws)
  return t == null ? null : t / ws.gp
}

const total = (id, label, positions, value, format) => ({ id, label, positions, kind: 'total', value, format, better: 'high' })
const perGame = (id, label, positions, value, format, week) => ({ id, label, positions, kind: 'perGame', value, format, better: 'high', week })
const rate = (id, label, positions, value, format, better, minVolume, basis) => {
  const m = { id, label, positions, kind: 'rate', value, format, better }
  if (minVolume) m.minVolume = minVolume
  if (basis) m.basis = basis
  return m
}
const rt = k => ws => ws.rates[k]
const us = k => ws => ws.usage[k]
// Advanced (play-by-play) metrics read an optional `ws.adv` side-object built only by marketAdvanced.js.
const av = k => ws => ws.adv?.[k] ?? null
// adv rates have no `basis`: rankWindow's games floor uses ws.gp (the source season's games).
const advRate = (id, label, positions, k, format, minVolume) =>
  ({ id, label, positions, kind: 'rate', value: av(k), format, better: 'high', minVolume, adv: true })

export const MARKET_METRICS = [
  total('fp', 'FP', ALL, ws => ws.fp, dec1),
  perGame('fpPerG', 'FP/G', ALL, ws => ws.fpPerG, dec1, 'fp'),
  total('passYd', 'Pass Yd', ['QB'], tot('pass_yd'), int),
  perGame('passYdPerG', 'Pass Yd/G', ['QB'], perG(tot('pass_yd')), dec1, ['pass_yd']),
  total('passTd', 'Pass TD', ['QB'], tot('pass_td'), int),
  perGame('passTdPerG', 'Pass TD/G', ['QB'], perG(tot('pass_td')), dec2, ['pass_td']),
  rate('cmpPct', 'Cmp%', ['QB'], rt('cmpPct'), pct1, 'high', PASS, 'cmpPct'),
  rate('ypa', 'Y/A', ['QB'], rt('ypa'), dec1, 'high', PASS, 'ypa'),
  rate('passTdRate', 'TD%', ['QB'], rt('passTdRate'), pct1, 'high', PASS, 'passTdRate'),
  rate('intRate', 'INT%', ['QB'], rt('intRate'), pct1, 'low', PASS, 'intRate'),
  rate('sackRate', 'Sack%', ['QB'], rt('sackRate'), pct1, 'low', PASS, 'sackRate'),
  rate('passerRating', 'Rating', ['QB'], rt('passerRating'), rating, 'high', PASS, 'passerRating'),
  rate('passAdot', 'aDOT', ['QB'], rt('passAdot'), dec1, 'high', PASS, 'passAdot'),
  perGame('passAttPerG', 'Pass Att/G', ['QB'], perG(tot('pass_att')), dec1, ['pass_att']),
  perGame('passCmpPerG', 'Cmp/G', ['QB'], perG(tot('pass_cmp')), dec1, ['pass_cmp']),
  { ...total('sacks', 'Sacks', ['QB'], tot('pass_sack'), int), rank: false },
  { ...perGame('sacksPerG', 'Sacks/G', ['QB'], perG(tot('pass_sack')), dec1, ['pass_sack']), rank: false },
  total('rushAtt', 'Car', ['QB', 'RB'], tot('rush_att'), int),
  perGame('rushAttPerG', 'Car/G', ['QB', 'RB'], perG(tot('rush_att')), dec1, ['rush_att']),
  total('rushYd', 'Rush Yd', ['QB', 'RB', 'WR', 'TE'], tot('rush_yd'), int),
  perGame('rushYdPerG', 'Rush Yd/G', ['QB', 'RB', 'WR', 'TE'], perG(tot('rush_yd')), dec1, ['rush_yd']),
  total('rushTd', 'Rush TD', ['QB', 'RB'], tot('rush_td'), int),
  perGame('rushTdPerG', 'Rush TD/G', ['QB', 'RB'], perG(tot('rush_td')), dec2, ['rush_td']),
  rate('ypc', 'Y/C', ['QB', 'RB'], rt('ypc'), dec1, 'high', RUSH, 'ypc'),
  rate('yacoPerAtt', 'YACo/Att', ['RB'], rt('yacoPerAtt'), dec2, 'high', RUSH, 'yacoPerAtt'),
  rate('ybcPerAtt', 'YBC/Att', ['RB'], rt('ybcPerAtt'), dec2, 'high', RUSH, 'ybcPerAtt'),
  total('btkl', 'Brk Tkl', ['RB'], tot('rush_btkl'), int),
  perGame('btklPerG', 'Brk Tkl/G', ['RB'], perG(tot('rush_btkl')), dec1, ['rush_btkl']),
  rate('btklRate', 'Brk Tkl%', ['RB'], rt('btklRate'), pct1, 'high', RUSH, 'btklRate'),
  total('tgt', 'Tgt', ['RB', 'WR', 'TE'], tot('rec_tgt'), int),
  perGame('tgtPerG', 'Tgt/G', ['RB', 'WR', 'TE'], perG(tot('rec_tgt')), dec1, ['rec_tgt']),
  total('rec', 'Rec', ['RB', 'WR', 'TE'], tot('rec'), int),
  perGame('recPerG', 'Rec/G', ['RB', 'WR', 'TE'], perG(tot('rec')), dec1, ['rec']),
  total('recYd', 'Rec Yd', ['RB', 'WR', 'TE'], tot('rec_yd'), int),
  perGame('recYdPerG', 'Rec Yd/G', ['RB', 'WR', 'TE'], perG(tot('rec_yd')), dec1, ['rec_yd']),
  total('recTd', 'Rec TD', ['RB', 'WR', 'TE'], tot('rec_td'), int),
  perGame('recTdPerG', 'Rec TD/G', ['RB', 'WR', 'TE'], perG(tot('rec_td')), dec2, ['rec_td']),
  rate('catchPct', 'Catch%', ['RB', 'WR', 'TE'], rt('catchPct'), pct1, 'high', TGT, 'catchPct'),
  rate('ypr', 'Y/R', ['RB', 'WR', 'TE'], rt('ypr'), dec1, 'high', TGT, 'ypr'),
  rate('ypt', 'Y/Tgt', ['RB', 'WR', 'TE'], rt('ypt'), dec1, 'high', TGT, 'ypt'),
  rate('aDOT', 'aDOT', ['WR', 'TE'], rt('aDOT'), dec1, 'high', TGT, 'aDOT'),
  rate('dropRate', 'Drop%', ['RB', 'WR', 'TE'], rt('dropRate'), pct1, 'low', TGT, 'dropRate'),
  total('scrimYd', 'Scrim Yd', ALL, sumTot('rush_yd', 'rec_yd'), int),
  perGame('scrimYdPerG', 'Scrim Yd/G', ALL, perG(sumTot('rush_yd', 'rec_yd')), dec1, ['rush_yd', 'rec_yd']),
  total('totalTd', 'TD', ALL, sumTot('pass_td', 'rush_td', 'rec_td'), int),
  perGame('totalTdPerG', 'TD/G', ALL, perG(sumTot('pass_td', 'rush_td', 'rec_td')), dec2, ['pass_td', 'rush_td', 'rec_td']),
  total('firstDowns', '1st Dn', ['RB', 'WR', 'TE'], sumTot('rush_fd', 'rec_fd'), int),
  perGame('firstDownsPerG', '1st Dn/G', ['RB', 'WR', 'TE'], perG(sumTot('rush_fd', 'rec_fd')), dec1, ['rush_fd', 'rec_fd']),
  { ...perGame('looksPerG', 'Looks/G', ALL, us('looksPerG'), dec1, ['pass_att', 'rush_att', 'rec_tgt']), tooltip: 'pass attempts + carries + targets per game' },
  { ...rate('fpShare', 'FP Share', ALL, us('fpShare'), pct1, 'high', null, 'fpShare'),
    tooltip: "Share of the fantasy points scored by the team's offence (every player with a pass, carry or target), in the games the player played." },
  { ...rate('tdShare', 'TD Share', ALL, us('tdShare'), pct1, 'high', null, 'tdShare'),
    tooltip: "Share of the team's rushing + receiving TDs in the games the player played. A QB counts his passing + rushing TDs, so QB shares overlap his receivers'." },
  rate('scrimYdShare', 'Scrim Yd Share', ['RB', 'WR', 'TE'], us('scrimYdShare'), pct1, 'high', null, 'scrimYdShare'),
  rate('snapPct', 'Snap%', ['RB', 'WR', 'TE'], us('snapPct'), pct1, 'high', null, 'snapPct'),
  rate('tgtShare', 'Tgt Share', ['RB', 'WR', 'TE'], us('tgtShare'), pct1, 'high', null, 'tgtShare'),
  rate('carryShare', 'Carry Share', ['QB', 'RB'], us('carryShare'), pct1, 'high', null, 'carryShare'),
  rate('aySh', 'AY Share', ['WR', 'TE'], us('aySh'), pct1, 'high', null, 'aySh'),
  rate('rzTgtShare', 'RZ Tgt Share', ['RB', 'WR', 'TE'], us('rzTgtShare'), pct1, 'high', null, 'rzTgtShare'),
  rate('rzRushShare', 'RZ Car Share', ['QB', 'RB'], us('rzRushShare'), pct1, 'high', null, 'rzRushShare'),
  advRate('epaPerAtt', 'EPA/att', ['QB'], 'epaPerAtt', dec2, PASS),
  advRate('cpoe', 'CPOE', ['QB'], 'cpoe', signed1, PASS),
  { id: 'rushEpaTotal', label: 'Rush EPA', positions: ['QB'], kind: 'total', value: av('rushEpaTotal'), format: dec1, better: 'high', adv: true },
  advRate('rushEpaPerAtt', 'Rush EPA/att', ['RB'], 'rushEpaPerAtt', dec2, RUSH),
  advRate('epaPerTgt', 'EPA/tgt', ['WR', 'TE'], 'epaPerTgt', dec2, TGT),
  advRate('racr', 'RACR', ['WR', 'TE'], 'racr', dec2, TGT),
]

export const PER_GAME_TWIN = {
  fp: 'fpPerG', passYd: 'passYdPerG', passTd: 'passTdPerG', rushAtt: 'rushAttPerG', rushYd: 'rushYdPerG',
  rushTd: 'rushTdPerG', tgt: 'tgtPerG', rec: 'recPerG', recYd: 'recYdPerG', recTd: 'recTdPerG',
  scrimYd: 'scrimYdPerG', totalTd: 'totalTdPerG', firstDowns: 'firstDownsPerG',
  sacks: 'sacksPerG', btkl: 'btklPerG',
}
export const METRIC_BY_ID = Object.fromEntries(MARKET_METRICS.map(m => [m.id, m]))

export function rankWindow(statsById, metrics = MARKET_METRICS, { minGames } = {}) {
  const all = statsById instanceof Map ? [...statsById.entries()] : Object.entries(statsById ?? {})
  const maxGp = all.reduce((m, [, ws]) => Math.max(m, ws.gp ?? 0), 0)
  const gpFloor = Number.isFinite(minGames) ? minGames : Math.ceil(0.5 * maxGp)
  const out = {}
  for (const [pid] of all) {
    out[pid] = {}
    for (const m of metrics) out[pid][m.id] = null
  }
  for (const m of metrics) {
    if (m.rank === false) continue
    for (const pos of m.positions) {
      const eligible = []
      for (const [pid, ws] of all) {
        if (ws.position !== pos) continue
        const v = m.value(ws)
        if (!fin(v)) continue
        if (m.kind !== 'total') {
          const g = m.basis ? (ws.basisGp?.[m.basis] ?? 0) : ws.gp
          if (g < gpFloor) continue
        }
        if (m.minVolume && (ws.totals[m.minVolume.stat] ?? 0) / ws.gp < m.minVolume.perGame) continue
        eligible.push([pid, v])
      }
      for (const [pid, v] of eligible) {
        let better = 0
        for (const [, w] of eligible) if (m.better === 'high' ? w > v : w < v) better++
        out[pid][m.id] = { rank: 1 + better, of: eligible.length }
      }
    }
  }
  return out
}
