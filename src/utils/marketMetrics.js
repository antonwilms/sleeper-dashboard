// View-only, pure. The Market metric registry and within-position ranking over WindowStats
// (see marketWindowStats.js). Never feeds projection/scoring. Header labels and tooltips come from
// metricGlossary.js, keyed by the metric id.
import { headerLabel, glossaryTooltip } from './metricGlossary'

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

const total = (id, positions, value, format) =>
  ({ id, label: headerLabel(id), tooltip: glossaryTooltip(id), positions, kind: 'total', value, format, better: 'high' })
const perGame = (id, positions, value, format, week) =>
  ({ id, label: headerLabel(id), tooltip: glossaryTooltip(id), positions, kind: 'perGame', value, format, better: 'high', week })
const rate = (id, positions, value, format, better, minVolume, basis) => {
  const m = { id, label: headerLabel(id), tooltip: glossaryTooltip(id), positions, kind: 'rate', value, format, better }
  if (minVolume) m.minVolume = minVolume
  if (basis) m.basis = basis
  return m
}
const rt = k => ws => ws.rates[k]
const us = k => ws => ws.usage[k]
// Advanced (play-by-play) metrics read an optional `ws.adv` side-object built only by marketAdvanced.js.
const av = k => ws => ws.adv?.[k] ?? null
// adv rates have no `basis`: rankWindow's games floor uses ws.gp (the source season's games).
const advRate = (id, positions, k, format, minVolume) =>
  ({ id, label: headerLabel(id), tooltip: glossaryTooltip(id), positions, kind: 'rate', value: av(k), format, better: 'high', minVolume, adv: true })

export const MARKET_METRICS = [
  total('fp', ALL, ws => ws.fp, dec1),
  perGame('fpPerG', ALL, ws => ws.fpPerG, dec1, 'fp'),
  total('passYd', ['QB'], tot('pass_yd'), int),
  perGame('passYdPerG', ['QB'], perG(tot('pass_yd')), dec1, ['pass_yd']),
  total('passTd', ['QB'], tot('pass_td'), int),
  perGame('passTdPerG', ['QB'], perG(tot('pass_td')), dec2, ['pass_td']),
  rate('cmpPct', ['QB'], rt('cmpPct'), pct1, 'high', PASS, 'cmpPct'),
  rate('ypa', ['QB'], rt('ypa'), dec1, 'high', PASS, 'ypa'),
  rate('passTdRate', ['QB'], rt('passTdRate'), pct1, 'high', PASS, 'passTdRate'),
  rate('intRate', ['QB'], rt('intRate'), pct1, 'low', PASS, 'intRate'),
  rate('sackRate', ['QB'], rt('sackRate'), pct1, 'low', PASS, 'sackRate'),
  rate('passerRating', ['QB'], rt('passerRating'), rating, 'high', PASS, 'passerRating'),
  rate('passAdot', ['QB'], rt('passAdot'), dec1, 'high', PASS, 'passAdot'),
  perGame('passAttPerG', ['QB'], perG(tot('pass_att')), dec1, ['pass_att']),
  perGame('passCmpPerG', ['QB'], perG(tot('pass_cmp')), dec1, ['pass_cmp']),
  { ...total('sacks', ['QB'], tot('pass_sack'), int), rank: false },
  { ...perGame('sacksPerG', ['QB'], perG(tot('pass_sack')), dec1, ['pass_sack']), rank: false },
  total('rushAtt', ['QB', 'RB'], tot('rush_att'), int),
  perGame('rushAttPerG', ['QB', 'RB'], perG(tot('rush_att')), dec1, ['rush_att']),
  total('rushYd', ['QB', 'RB', 'WR', 'TE'], tot('rush_yd'), int),
  perGame('rushYdPerG', ['QB', 'RB', 'WR', 'TE'], perG(tot('rush_yd')), dec1, ['rush_yd']),
  total('rushTd', ['QB', 'RB'], tot('rush_td'), int),
  perGame('rushTdPerG', ['QB', 'RB'], perG(tot('rush_td')), dec2, ['rush_td']),
  rate('ypc', ['QB', 'RB'], rt('ypc'), dec1, 'high', RUSH, 'ypc'),
  rate('yacoPerAtt', ['RB'], rt('yacoPerAtt'), dec2, 'high', RUSH, 'yacoPerAtt'),
  rate('ybcPerAtt', ['RB'], rt('ybcPerAtt'), dec2, 'high', RUSH, 'ybcPerAtt'),
  total('btkl', ['RB'], tot('rush_btkl'), int),
  perGame('btklPerG', ['RB'], perG(tot('rush_btkl')), dec1, ['rush_btkl']),
  rate('btklRate', ['RB'], rt('btklRate'), pct1, 'high', RUSH, 'btklRate'),
  total('tgt', ['RB', 'WR', 'TE'], tot('rec_tgt'), int),
  perGame('tgtPerG', ['RB', 'WR', 'TE'], perG(tot('rec_tgt')), dec1, ['rec_tgt']),
  total('rec', ['RB', 'WR', 'TE'], tot('rec'), int),
  perGame('recPerG', ['RB', 'WR', 'TE'], perG(tot('rec')), dec1, ['rec']),
  total('recYd', ['RB', 'WR', 'TE'], tot('rec_yd'), int),
  perGame('recYdPerG', ['RB', 'WR', 'TE'], perG(tot('rec_yd')), dec1, ['rec_yd']),
  total('recTd', ['RB', 'WR', 'TE'], tot('rec_td'), int),
  perGame('recTdPerG', ['RB', 'WR', 'TE'], perG(tot('rec_td')), dec2, ['rec_td']),
  rate('catchPct', ['RB', 'WR', 'TE'], rt('catchPct'), pct1, 'high', TGT, 'catchPct'),
  rate('ypr', ['RB', 'WR', 'TE'], rt('ypr'), dec1, 'high', TGT, 'ypr'),
  rate('ypt', ['RB', 'WR', 'TE'], rt('ypt'), dec1, 'high', TGT, 'ypt'),
  rate('aDOT', ['WR', 'TE'], rt('aDOT'), dec1, 'high', TGT, 'aDOT'),
  rate('dropRate', ['RB', 'WR', 'TE'], rt('dropRate'), pct1, 'low', TGT, 'dropRate'),
  total('scrimYd', ALL, sumTot('rush_yd', 'rec_yd'), int),
  perGame('scrimYdPerG', ALL, perG(sumTot('rush_yd', 'rec_yd')), dec1, ['rush_yd', 'rec_yd']),
  total('totalTd', ALL, sumTot('pass_td', 'rush_td', 'rec_td'), int),
  perGame('totalTdPerG', ALL, perG(sumTot('pass_td', 'rush_td', 'rec_td')), dec2, ['pass_td', 'rush_td', 'rec_td']),
  total('firstDowns', ['RB', 'WR', 'TE'], sumTot('rush_fd', 'rec_fd'), int),
  perGame('firstDownsPerG', ['RB', 'WR', 'TE'], perG(sumTot('rush_fd', 'rec_fd')), dec1, ['rush_fd', 'rec_fd']),
  perGame('looksPerG', ALL, us('looksPerG'), dec1, ['pass_att', 'rush_att', 'rec_tgt']),
  rate('fpShare', ALL, us('fpShare'), pct1, 'high', null, 'fpShare'),
  rate('tdShare', ALL, us('tdShare'), pct1, 'high', null, 'tdShare'),
  rate('scrimYdShare', ['RB', 'WR', 'TE'], us('scrimYdShare'), pct1, 'high', null, 'scrimYdShare'),
  rate('snapPct', ['RB', 'WR', 'TE'], us('snapPct'), pct1, 'high', null, 'snapPct'),
  rate('tgtShare', ['RB', 'WR', 'TE'], us('tgtShare'), pct1, 'high', null, 'tgtShare'),
  rate('carryShare', ['QB', 'RB'], us('carryShare'), pct1, 'high', null, 'carryShare'),
  rate('aySh', ['WR', 'TE'], us('aySh'), pct1, 'high', null, 'aySh'),
  rate('rzTgtShare', ['RB', 'WR', 'TE'], us('rzTgtShare'), pct1, 'high', null, 'rzTgtShare'),
  rate('rzRushShare', ['QB', 'RB'], us('rzRushShare'), pct1, 'high', null, 'rzRushShare'),
  advRate('epaPerAtt', ['QB'], 'epaPerAtt', dec2, PASS),
  advRate('cpoe', ['QB'], 'cpoe', signed1, PASS),
  { id: 'rushEpaTotal', label: headerLabel('rushEpaTotal'), tooltip: glossaryTooltip('rushEpaTotal'), positions: ['QB'], kind: 'total', value: av('rushEpaTotal'), format: dec1, better: 'high', adv: true },
  advRate('rushEpaPerAtt', ['RB'], 'rushEpaPerAtt', dec2, RUSH),
  advRate('epaPerTgt', ['WR', 'TE'], 'epaPerTgt', dec2, TGT),
  advRate('racr', ['WR', 'TE'], 'racr', dec2, TGT),
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
