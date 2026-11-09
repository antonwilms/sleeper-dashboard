// View-only copy, pure, no imports. The single source of plain-language metric names and
// definitions for Market (MARKET_METRICS headers + tooltips, factViews value columns, the `?` legend),
// the player pop-up (usageEfficiency / EnvironmentSection METRIC_META, overview tiles) and the game-log
// header titles. Never imported by projection/scoring. Add an id here in the same change as any new
// rendered column — metricGlossary.test.js fails otherwise.
//
// Entry: { label, short?, definition }. `label` is the full name; `short` the compact header when it
// differs; `definition` is one sentence ending in '.'. Compact headers render headerLabel(id); pop-up
// rows render `label` + `definition`; tooltips render glossaryTooltip(id).

export const GLOSSARY = {
  fp: { label: 'Fantasy points', short: 'FP', definition: 'Fantasy points scored in the window.' },
  fpPerG: { label: 'Fantasy points per game', short: 'FP/G', definition: 'Fantasy points per game played.' },
  passYd: { label: 'Passing yards', short: 'Pass Yd', definition: 'Yards gained on his completed passes.' },
  passYdPerG: { label: 'Passing yards per game', short: 'Pass Yd/G', definition: 'Passing yards per game played.' },
  passTd: { label: 'Passing touchdowns', short: 'Pass TD', definition: 'Touchdown passes thrown.' },
  passTdPerG: { label: 'Passing touchdowns per game', short: 'Pass TD/G', definition: 'Touchdown passes per game played.' },
  cmpPct: { label: 'Completion %', short: 'Cmp%', definition: 'Share of his pass attempts that were caught.' },
  ypa: { label: 'Yards per attempt', short: 'Y/A', definition: 'Passing yards per pass attempt.' },
  passTdRate: { label: 'Touchdown rate', short: 'TD%', definition: 'Share of his pass attempts that went for a touchdown.' },
  intRate: { label: 'Interception rate', short: 'INT%', definition: 'Share of his pass attempts that were intercepted.' },
  sackRate: { label: 'Sack rate', short: 'Sack%', definition: 'Share of his dropbacks (pass attempts plus sacks) that ended in a sack.' },
  passerRating: { label: 'Passer rating', short: 'Rating', definition: 'The NFL passer rating formula, built from completions, yards, touchdowns and interceptions per attempt.' },
  passAdot: { label: 'Avg depth', short: 'Avg Dp', definition: 'Average depth of his throws, in yards past the line of scrimmage.' },
  passAttPerG: { label: 'Pass attempts per game', short: 'Pass Att/G', definition: 'Passes thrown per game played.' },
  passCmpPerG: { label: 'Completions per game', short: 'Cmp/G', definition: 'Completed passes per game played.' },
  sacks: { label: 'Sacks taken', short: 'Sacks', definition: 'Times he was sacked.' },
  sacksPerG: { label: 'Sacks taken per game', short: 'Sacks/G', definition: 'Times he was sacked per game played.' },
  rushAtt: { label: 'Carries', short: 'Car', definition: 'Rushing attempts.' },
  rushAttPerG: { label: 'Carries per game', short: 'Car/G', definition: 'Rushing attempts per game played.' },
  rushYd: { label: 'Rushing yards', short: 'Rush Yd', definition: 'Yards gained on his carries.' },
  rushYdPerG: { label: 'Rushing yards per game', short: 'Rush Yd/G', definition: 'Rushing yards per game played.' },
  rushTd: { label: 'Rushing touchdowns', short: 'Rush TD', definition: 'Touchdowns scored on his carries.' },
  rushTdPerG: { label: 'Rushing touchdowns per game', short: 'Rush TD/G', definition: 'Rushing touchdowns per game played.' },
  ypc: { label: 'Yards / carry', short: 'Y/C', definition: 'Rushing yards per carry.' },
  yacoPerAtt: { label: 'Yards after contact per carry', short: 'YACo/Att', definition: 'Yards he gained after the first defender made contact, per carry.' },
  ybcPerAtt: { label: 'Yards before contact per carry', short: 'YBC/Att', definition: 'Yards he gained before a defender made contact, per carry, which mostly reflects his blocking.' },
  btkl: { label: 'Broken tackles', short: 'Brk Tkl', definition: 'Tackles he broke or evaded on his carries.' },
  btklPerG: { label: 'Broken tackles per game', short: 'Brk Tkl/G', definition: 'Broken tackles on carries per game played.' },
  btklRate: { label: 'Broken tackle rate', short: 'Brk Tkl%', definition: 'Broken tackles as a share of his carries.' },
  tgt: { label: 'Targets', short: 'Tgt', definition: 'Passes thrown his way.' },
  tgtPerG: { label: 'Targets per game', short: 'Tgt/G', definition: 'Passes thrown his way per game played.' },
  rec: { label: 'Receptions', short: 'Rec', definition: 'Passes he caught.' },
  recPerG: { label: 'Receptions per game', short: 'Rec/G', definition: 'Catches per game played.' },
  recYd: { label: 'Receiving yards', short: 'Rec Yd', definition: 'Yards gained on his catches.' },
  recYdPerG: { label: 'Receiving yards per game', short: 'Rec Yd/G', definition: 'Receiving yards per game played.' },
  recTd: { label: 'Receiving touchdowns', short: 'Rec TD', definition: 'Touchdown catches.' },
  recTdPerG: { label: 'Receiving touchdowns per game', short: 'Rec TD/G', definition: 'Touchdown catches per game played.' },
  catchPct: { label: 'Catch rate', short: 'Catch%', definition: 'Share of his targets he caught.' },
  ypr: { label: 'Yards per reception', short: 'Y/R', definition: 'Receiving yards per catch.' },
  ypt: { label: 'Yards per target', short: 'Y/Tgt', definition: 'Receiving yards per pass thrown his way.' },
  aDOT: { label: 'Avg depth', short: 'Avg Dp', definition: 'Average yards past the line of scrimmage of his targets.' },
  dropRate: { label: 'Drop rate', short: 'Drop%', definition: 'Share of his targets he dropped.' },
  scrimYd: { label: 'Scrimmage yards', short: 'Scrim Yd', definition: 'Rushing plus receiving yards.' },
  scrimYdPerG: { label: 'Scrimmage yards per game', short: 'Scrim Yd/G', definition: 'Rushing plus receiving yards per game played.' },
  totalTd: { label: 'Touchdowns', short: 'TD', definition: 'Passing, rushing and receiving touchdowns combined.' },
  totalTdPerG: { label: 'Touchdowns per game', short: 'TD/G', definition: 'All touchdowns per game played.' },
  firstDowns: { label: 'First downs', short: '1st Dn', definition: 'Carries and catches that gained a first down.' },
  firstDownsPerG: { label: 'First downs per game', short: '1st Dn/G', definition: 'First downs on carries and catches per game played.' },
  looksPerG: { label: 'Looks per game', short: 'Looks/G', definition: 'Pass attempts plus carries plus targets per game played: every chance he had to touch the ball.' },
  fpShare: { label: 'Fantasy point share', short: 'FP Share', definition: 'His share of his team\'s offensive fantasy points, in the games he played.' },
  tdShare: { label: 'Touchdown share', short: 'TD Share', definition: 'His share of his team\'s rushing and receiving touchdowns in the games he played (a QB counts his passing and rushing touchdowns, so his share overlaps his receivers\').' },
  scrimYdShare: { label: 'Scrimmage yards share', short: 'Scrim Yd Share', definition: 'His share of his team\'s rushing plus receiving yards, in the games he played.' },
  snapPct: { label: 'Snap share', short: 'Snap%', definition: 'Share of his team\'s offensive snaps he was on the field for.' },
  tgtShare: { label: 'Target share', short: 'Tgt Share', definition: 'His share of his team\'s targets, in the games he played.' },
  carryShare: { label: 'Carry share', short: 'Carry Share', definition: 'His share of his team\'s carries, in the games he played.' },
  aySh: { label: 'Air yards share', short: 'AY Share', definition: 'His share of the yards his team\'s passes travelled in the air, in the games he played.' },
  rzTgtShare: { label: 'Red-zone target share', short: 'RZ Tgt Share', definition: 'His share of his team\'s targets inside the opponent\'s 20-yard line, in the games he played.' },
  rzRushShare: { label: 'Red-zone carry share', short: 'RZ Car Share', definition: 'His share of his team\'s carries inside the opponent\'s 20-yard line, in the games he played.' },
  epaPerAtt: { label: 'EPA per attempt', short: 'EPA/att', definition: 'Expected points added per pass attempt: how much each throw raised or lowered his team\'s expected score, on average.' },
  cpoe: { label: 'Completion % over expected', short: 'CPOE', definition: 'How much more often he completes passes than the difficulty of his throws predicts, in percentage points.' },
  rushEpaTotal: { label: 'Rushing EPA', short: 'Rush EPA', definition: 'Total expected points added on his runs.' },
  rushEpaPerAtt: { label: 'Rushing EPA per carry', short: 'Rush EPA/att', definition: 'Expected points added per carry: how much each run raised or lowered his team\'s expected score, on average.' },
  epaPerTgt: { label: 'EPA per target', short: 'EPA/tgt', definition: 'Expected points added per target: how much each pass thrown his way raised or lowered his team\'s expected score, on average.' },
  racr: { label: 'Air yards conversion', short: 'RACR', definition: 'Receiving yards per air yard he was targeted with; above 1 means he gains more than the depth of his targets.' },
  gp: { label: 'Games', short: 'G', definition: 'Games he played in the window.' },
  gs: { label: 'Games started', short: 'GS', definition: 'Games he started in the window.' },
  prevFpPerGRank: { label: 'Previous rank', short: 'Prev rk', definition: 'His fantasy-points-per-game rank at his position in the prior season.' },
  ownerTeamName: { label: 'Owner', definition: 'The team in this league that rosters him.' },
  ktcValue: { label: 'KTC value', short: 'KTC', definition: 'KeepTradeCut dynasty value, crowd-sourced from dynasty managers, on a 0–10000 scale.' },
  dynastyScore: { label: 'Dynasty score', short: 'Dynasty', definition: 'This app\'s dynasty value, built from age, trajectory, current level, opportunity and reliability.' },
  divergencePct: { label: 'Vs market', definition: 'How far his dynasty-score rank sits from his KTC rank, as a percentage of rank depth (not a price difference).' },
  ktcTrend: { label: 'KTC trend', definition: 'KeepTradeCut value trend over the captured snapshot window (view only; never moves the projection).' },
  projectedPPG: { label: 'Projection', short: 'Next', definition: 'This app\'s projected fantasy points per game.' },
  projectedPPGRos: { label: 'Rest of season', short: 'ROS', definition: 'Rest-of-season rate: the preseason projection updated with this season\'s games.' },
  rosDelta: { label: 'Δ preseason', definition: 'Rest-of-season estimate minus the preseason projection (hover a value for both).' },
  oppShift: { label: 'Opp shift', definition: 'This season\'s evidence-weighted carries plus targets per game (QB: pass attempts plus carries) against his baseline, as a percentage, unlike Looks/G, which counts pass attempts, carries and targets for every position.' },
  signals: { label: 'Signals', definition: 'Number of dynasty signal badges this player carries.' },
  rushShare: { label: 'Rush share', definition: 'His share of his team\'s carries over the season.' },
  seasonTgtShare: { label: 'Target share', definition: 'His share of his team\'s targets over the season.' },
  seasonAySh: { label: 'Air yards share', definition: 'His share of the yards his team\'s passes travelled in the air over the season.' },
  rushRzShare: { label: 'Red-zone share', definition: 'His share of his team\'s carries inside the opponent\'s 20-yard line over the season.' },
  recRzShare: { label: 'Red-zone share', definition: 'His share of his team\'s targets inside the opponent\'s 20-yard line over the season.' },
  ayPerAtt: { label: 'Air yards per attempt', short: 'AY/att', definition: 'Yards his passes travelled in the air, per attempt.' },
  gamelogCarryShare: { label: 'Carry share', definition: 'His share of all his team\'s runs over the season, quarterback scrambles and sneaks included.' },
  yaco: { label: 'Yards after contact', short: 'YAC', definition: 'Rushing yards he gained after the first defender made contact.' },
  drops: { label: 'Drops', definition: 'Catchable passes he dropped.' },
  proe: { label: 'PROE', definition: 'Pass rate over expected: how much more often his team passes than the score, down and distance predict (positive means pass-heavy).' },
  pace: { label: 'Pace', definition: 'Seconds per play in neutral game situations (lower is faster).' },
  successRate: { label: 'Success rate', definition: 'Share of his team\'s offensive plays graded successful.' },
  rzTdRate: { label: 'Red-zone TD rate', definition: 'Share of his team\'s red-zone trips that ended in a touchdown.' },
  soFarPpg: { label: 'So far', definition: 'Fantasy points per game in the live season so far.' },
  floorRisk: { label: 'Floor risk', definition: 'Standard deviation of his per-game fantasy points; higher means more boom-and-bust weeks.' },
  cmpAtt: { label: 'Completions / attempts', short: 'CMP/ATT', definition: 'Completed passes out of passes thrown.' },
  passInt: { label: 'Interceptions', short: 'INT', definition: 'Passes he threw that were intercepted.' },
}

function entry(id) {
  const e = GLOSSARY[id]
  if (!e) throw new Error(`metricGlossary: unknown id "${id}"`)
  return e
}

export function headerLabel(id) {
  const e = entry(id)
  return e.short ?? e.label
}

export function glossaryTooltip(id) {
  const e = entry(id)
  return `${e.label}: ${e.definition}`
}

export const TILE_GLOSSARY_IDS = {
  dynasty: 'dynastyScore', market: 'ktcValue', sofar: 'soFarPpg',
  next: 'projectedPPG', nextRos: 'projectedPPGRos', floor: 'floorRisk',
}
