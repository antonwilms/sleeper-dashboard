// Column descriptor data for Market's Outlook and Efficiency column sets (1b Slice iii), moved
// here from the Explorer's OutlookTab.jsx in 1b Slice viii (the `/players` retirement) — that file
// is deleted, so this is now the single source. Descriptor data with formatters
// (levelFmt/deltaFmt/deltaEps/valence for POSITION_STAT_COLUMNS; key/metricId for
// EFFICIENCY_COLUMNS), not logic — kept together and out of Market.jsx, which is already large. The
// fact views' descriptors live in factViews.js.
//
// No React — pure data, testable/importable without mounting anything.

const pctShareFmt = {
  levelFmt: v => `${(v * 100).toFixed(1)}%`,
  deltaFmt: d => `${d > 0 ? '+' : ''}${(d * 100).toFixed(1)}`,
  deltaEps: 0.01,
}
const oneDecimalFmt = (eps) => ({
  levelFmt: v => v.toFixed(1),
  deltaFmt: d => `${d > 0 ? '+' : ''}${d.toFixed(1)}`,
  deltaEps: eps,
})

export const POSITION_STAT_COLUMNS = {
  QB: [
    { id: 'cmpPct',       label: 'Cmp%',       tooltip: 'Completion % (pass_cmp/pass_att), recomputed from season-total counting stats — never the stored cmp_pct. Trend = latest vs prior qualifying season (gp≥8); level below.',
      levelFmt: v => `${v.toFixed(1)}%`, deltaFmt: d => `${d > 0 ? '+' : ''}${d.toFixed(1)}`, deltaEps: 0.5 },
    { id: 'passerRating', label: 'Passer rtg', tooltip: 'NFL passer rating from season-total components (efficiencyMetrics.passerRating) — never the stored pass_rtg.',
      ...oneDecimalFmt(1.0) },
    { id: 'sacks',        label: 'Sacks',       tooltip: 'Sacks taken (pass_sack), season total. Trend is raw Δ (more sacks shows ↑); display-only, not a value judgment.',
      levelFmt: v => `${Math.round(v)}`, deltaFmt: d => `${d > 0 ? '+' : ''}${Math.round(d)}`, deltaEps: 0.5, valence: 'none' },
  ],
  RB: [
    { id: 'rushShare',     label: 'Rush share',   tooltip: 'rush_att / team rush_att, attributed by per-season team (careerStats[season].team) — same series as the ALL-view Opp trend. gp≥8.', ...pctShareFmt },
    { id: 'rbTargetShare', label: 'Target share', tooltip: 'rec_tgt / team rec_tgt (view-only per-season-team denominator). gp≥8.', ...pctShareFmt },
    { id: 'yardsPerCarry', label: 'Y/C',          tooltip: 'Yards per carry (rush_yd/rush_att), recomputed from counting stats — never the stored rush_ypa.', ...oneDecimalFmt(0.1) },
  ],
  WR: [
    { id: 'targetShare',  label: 'Target share', tooltip: 'rec_tgt / team rec_tgt, attributed by per-season team (careerStats[season].team) — same series as the ALL-view Opp trend. gp≥8.', ...pctShareFmt },
    { id: 'airYardsShare', label: 'AY share',    tooltip: 'rec_air_yd / team rec_air_yd (view-only per-season-team denominator). gp≥8.', ...pctShareFmt },
    { id: 'aDOT',         label: 'aDOT',         tooltip: 'Average depth of target (rec_air_yd/rec_tgt), recomputed from counting stats.', ...oneDecimalFmt(0.5) },
  ],
}
POSITION_STAT_COLUMNS.TE = POSITION_STAT_COLUMNS.WR

// Efficiency column descriptors (dp-v2 Slice 5b) — per-position, single-season (pinned to
// dataSeason, never user-selectable — market/Market.jsx's Efficiency header states this). `key` is
// what Market stores each row's computed value under (`row._eff[key]`); `metricId` looks up
// label/format/field/note in usageEfficiency.js's METRIC_META — the single metadata source,
// extended additively there rather than duplicated here (a second metadata map is exactly the
// duplication this program keeps refusing). `ALL` reuses WR/TE's list — the largest, most
// data-rich position group — rather than inventing a fourth cross-position shape; QB/RB rows
// render "—" in those columns under the ALL pill, the same tolerance Outlook's own ALL view
// already has for QB's Snap/Opp trend and Role.
export const EFFICIENCY_COLUMNS = {
  QB: [
    { key: 'epaPerAtt',     metricId: 'epaPerAtt' },
    { key: 'cpoe',          metricId: 'cpoe' },
    { key: 'sackPct',       metricId: 'sackPct' },
    { key: 'ayPerAtt',      metricId: 'ayPerAtt' },
    { key: 'rushEpaTotal',  metricId: 'rushEpaTotal' },
  ],
  RB: [
    { key: 'carrySh',       metricId: 'carrySh' },
    { key: 'tgtSh',         metricId: 'rbTargetShare' },
    { key: 'rushEpaPerAtt', metricId: 'rushEpaPerAtt' },
    { key: 'yac',           metricId: 'yac' },
    { key: 'btkl',          metricId: 'btkl' },
  ],
  WR: [
    { key: 'tgtSh',      metricId: 'targetShare' },
    { key: 'aySh',       metricId: 'airYardsShare' },
    { key: 'aDOT',       metricId: 'aDOT' },
    { key: 'epaPerTgt',  metricId: 'epaPerTgt' },
    { key: 'racr',       metricId: 'racr' },
    { key: 'racrLive',   metricId: 'racrLive' },
    { key: 'rzSh',       metricId: 'recRzShare' },
    { key: 'snapPct',    metricId: 'snapShare' },
    { key: 'drops',      metricId: 'drops' },
  ],
}
EFFICIENCY_COLUMNS.TE = EFFICIENCY_COLUMNS.WR
EFFICIENCY_COLUMNS.ALL = EFFICIENCY_COLUMNS.WR
