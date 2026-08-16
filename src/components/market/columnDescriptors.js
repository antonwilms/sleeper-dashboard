// Column descriptor data for Market's Outlook and Production column sets (1b Slice iii), moved
// here from the Explorer's OutlookTab.jsx/NflStatsTab.jsx in 1b Slice viii (the `/players`
// retirement) — those files are deleted, so this is now the single source. Descriptor data with
// formatters (levelFmt/deltaFmt/deltaEps/valence for POSITION_STAT_COLUMNS; key/label/fmt for
// COLUMNS), not logic — kept together and out of Market.jsx, which is already large.
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

// Column descriptor: key = computeSeasonAverages field, fmt ∈ perGame|int|pct|ratio
export const COLUMNS = {
  QB: [
    { key: 'compPct',    label: 'Cmp%',      fmt: 'pct'     },
    { key: 'passYdPerG', label: 'Pass Yd/G',  fmt: 'perGame' },
    { key: 'passTd',     label: 'Pass TD',    fmt: 'int'     },
    { key: 'passInt',    label: 'INT',        fmt: 'int'     },
    { key: 'rushYdPerG', label: 'Rush Yd/G',  fmt: 'perGame' },
    { key: 'rushTd',     label: 'Rush TD',    fmt: 'int'     },
    { key: 'fpPerG',     label: 'FP/G',       fmt: 'perGame' },
  ],
  RB: [
    { key: 'rushAtt',    label: 'Rush Att',   fmt: 'int'     },
    { key: 'rushYdPerG', label: 'Rush Yd/G',  fmt: 'perGame' },
    { key: 'rushTd',     label: 'Rush TD',    fmt: 'int'     },
    { key: 'tgt',        label: 'Tgt',        fmt: 'int'     },
    { key: 'rec',        label: 'Rec',        fmt: 'int'     },
    { key: 'recYdPerG',  label: 'Rec Yd/G',   fmt: 'perGame' },
    { key: 'recTd',      label: 'Rec TD',     fmt: 'int'     },
    { key: 'fpPerG',     label: 'FP/G',       fmt: 'perGame' },
  ],
  WR: [
    { key: 'tgt',        label: 'Tgt',        fmt: 'int'     },
    { key: 'rec',        label: 'Rec',        fmt: 'int'     },
    { key: 'catchPct',   label: 'Catch%',     fmt: 'pct'     },
    { key: 'recYdPerG',  label: 'Rec Yd/G',   fmt: 'perGame' },
    { key: 'ypr',        label: 'Y/R',        fmt: 'ratio'   },
    { key: 'recTd',      label: 'Rec TD',     fmt: 'int'     },
    { key: 'fpPerG',     label: 'FP/G',       fmt: 'perGame' },
  ],
  ALL: [
    { key: 'totalYdPerG', label: 'Yds/G', fmt: 'perGame' },
    { key: 'totalTd',     label: 'TD',    fmt: 'int'     },
    { key: 'fpPerG',      label: 'FP/G',  fmt: 'perGame' },
  ],
}
COLUMNS.TE = COLUMNS.WR
