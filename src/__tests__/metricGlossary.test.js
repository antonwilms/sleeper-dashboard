import { describe, it, expect } from 'vitest'
import { GLOSSARY, headerLabel, glossaryTooltip, TILE_GLOSSARY_IDS } from '../utils/metricGlossary'
import { MARKET_METRICS, METRIC_BY_ID } from '../utils/marketMetrics'
import { FACT_VIEWS, factColumns } from '../components/market/factViews'
import { METRIC_META } from '../utils/usageEfficiency'
import { SERIES_METRICS } from '../utils/environment'
import { GAME_LOG_COLUMNS } from '../utils/gameLog'
import { LIVE_GAME_LOG_COLUMNS } from '../utils/liveSeasonLog'

const VIEWS = [...FACT_VIEWS, 'model']
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'ALL']
const STATS_MODES = ['totals', 'perGame']
const WINDOW_KINDS = [null, 'season', 'live', 'last3', 'career']
function* grid(windowKinds = WINDOW_KINDS) {
  for (const view of VIEWS) for (const pos of POSITIONS) for (const statsMode of STATS_MODES)
    for (const ros of [false, true]) for (const windowKind of windowKinds)
      yield { view, pos, opts: { statsMode, ros, windowKind } }
}

// Captured from HEAD (before the glossary migration) by running the then-current code.
const C0 = ["G","FP","FP/G","Prev rk","Owner","KTC","Dynasty"]
const C1 = ["G","FP","FP/G","Prev rk","Snap%","Owner","KTC","Dynasty"]
const C2 = ["Pass Yd","Pass TD","Cmp%","Sacks","Sack%","Car","Rush Yd","Rush TD","FP"]
const C3 = ["Pass Yd/G","Pass TD/G","Cmp%","Sacks/G","Sack%","Car/G","Rush Yd/G","Rush TD/G","FP/G"]
const C4 = ["Car","Rush Yd","Y/C","Rush TD","YBC/Att","YACo/Att","Brk Tkl","Tgt","Rec","Rec Yd","Y/Tgt","Rec TD","Scrim Yd","1st Dn","FP"]
const C5 = ["Car/G","Rush Yd/G","Y/C","Rush TD/G","YBC/Att","YACo/Att","Brk Tkl/G","Tgt/G","Rec/G","Rec Yd/G","Y/Tgt","Rec TD/G","Scrim Yd/G","1st Dn/G","FP/G"]
const C6 = ["Tgt","Rec","Catch%","Drop%","Rec Yd","Y/R","aDOT","Rec TD","Rush Yd","1st Dn","FP"]
const C7 = ["Tgt/G","Rec/G","Catch%","Drop%","Rec Yd/G","Y/R","aDOT","Rec TD/G","Rush Yd/G","1st Dn/G","FP/G"]
const C8 = ["FP","Pass Yd","Rush Yd","Rec Yd","TD"]
const C9 = ["FP/G","Pass Yd/G","Rush Yd/G","Rec Yd/G","TD/G"]
const C10 = ["G","GS","Looks/G","Pass Att/G","Cmp/G","Carry Share","RZ Car Share","FP Share","TD Share"]
const C11 = ["G","GS","Snap%","Looks/G","Carry Share","Tgt Share","RZ Car Share","RZ Tgt Share","FP Share","TD Share","Scrim Yd Share"]
const C12 = ["G","GS","Snap%","Looks/G","Tgt/G","Tgt Share","AY Share","RZ Tgt Share","FP Share","TD Share","Scrim Yd Share"]
const C13 = ["G","GS","Snap%","Looks/G","FP Share"]
const C14 = ["G","Y/A","TD%","INT%","Rating","aDOT","Y/C","EPA/att","CPOE","Rush EPA"]
const C15 = ["G","Brk Tkl%","Catch%","Y/R","Drop%","Rush EPA/att"]
const C16 = ["G","Y/Tgt","EPA/tgt","RACR"]
const C17 = ["G","FP/G","Looks/G","Scrim Yd/G"]
const C18 = ["Dynasty score","Vs market","KTC","KTC trend","Next","Δ preseason","Opp shift","Signals","Owner"]
const C19 = ["Dynasty score","Vs market","KTC","KTC trend","ROS","Δ preseason","Opp shift","Signals","Owner"]
const COL_PINS = {
  'overview|QB|totals|false': C0,
  'overview|QB|totals|true': C0,
  'overview|QB|perGame|false': C0,
  'overview|QB|perGame|true': C0,
  'overview|RB|totals|false': C1,
  'overview|RB|totals|true': C1,
  'overview|RB|perGame|false': C1,
  'overview|RB|perGame|true': C1,
  'overview|WR|totals|false': C1,
  'overview|WR|totals|true': C1,
  'overview|WR|perGame|false': C1,
  'overview|WR|perGame|true': C1,
  'overview|TE|totals|false': C1,
  'overview|TE|totals|true': C1,
  'overview|TE|perGame|false': C1,
  'overview|TE|perGame|true': C1,
  'overview|ALL|totals|false': C1,
  'overview|ALL|totals|true': C1,
  'overview|ALL|perGame|false': C1,
  'overview|ALL|perGame|true': C1,
  'stats|QB|totals|false': C2,
  'stats|QB|totals|true': C2,
  'stats|QB|perGame|false': C3,
  'stats|QB|perGame|true': C3,
  'stats|RB|totals|false': C4,
  'stats|RB|totals|true': C4,
  'stats|RB|perGame|false': C5,
  'stats|RB|perGame|true': C5,
  'stats|WR|totals|false': C6,
  'stats|WR|totals|true': C6,
  'stats|WR|perGame|false': C7,
  'stats|WR|perGame|true': C7,
  'stats|TE|totals|false': C6,
  'stats|TE|totals|true': C6,
  'stats|TE|perGame|false': C7,
  'stats|TE|perGame|true': C7,
  'stats|ALL|totals|false': C8,
  'stats|ALL|totals|true': C8,
  'stats|ALL|perGame|false': C9,
  'stats|ALL|perGame|true': C9,
  'usage|QB|totals|false': C10,
  'usage|QB|totals|true': C10,
  'usage|QB|perGame|false': C10,
  'usage|QB|perGame|true': C10,
  'usage|RB|totals|false': C11,
  'usage|RB|totals|true': C11,
  'usage|RB|perGame|false': C11,
  'usage|RB|perGame|true': C11,
  'usage|WR|totals|false': C12,
  'usage|WR|totals|true': C12,
  'usage|WR|perGame|false': C12,
  'usage|WR|perGame|true': C12,
  'usage|TE|totals|false': C12,
  'usage|TE|totals|true': C12,
  'usage|TE|perGame|false': C12,
  'usage|TE|perGame|true': C12,
  'usage|ALL|totals|false': C13,
  'usage|ALL|totals|true': C13,
  'usage|ALL|perGame|false': C13,
  'usage|ALL|perGame|true': C13,
  'efficiency|QB|totals|false': C14,
  'efficiency|QB|totals|true': C14,
  'efficiency|QB|perGame|false': C14,
  'efficiency|QB|perGame|true': C14,
  'efficiency|RB|totals|false': C15,
  'efficiency|RB|totals|true': C15,
  'efficiency|RB|perGame|false': C15,
  'efficiency|RB|perGame|true': C15,
  'efficiency|WR|totals|false': C16,
  'efficiency|WR|totals|true': C16,
  'efficiency|WR|perGame|false': C16,
  'efficiency|WR|perGame|true': C16,
  'efficiency|TE|totals|false': C16,
  'efficiency|TE|totals|true': C16,
  'efficiency|TE|perGame|false': C16,
  'efficiency|TE|perGame|true': C16,
  'efficiency|ALL|totals|false': C17,
  'efficiency|ALL|totals|true': C17,
  'efficiency|ALL|perGame|false': C17,
  'efficiency|ALL|perGame|true': C17,
  'model|QB|totals|false': C18,
  'model|QB|totals|true': C19,
  'model|QB|perGame|false': C18,
  'model|QB|perGame|true': C19,
  'model|RB|totals|false': C18,
  'model|RB|totals|true': C19,
  'model|RB|perGame|false': C18,
  'model|RB|perGame|true': C19,
  'model|WR|totals|false': C18,
  'model|WR|totals|true': C19,
  'model|WR|perGame|false': C18,
  'model|WR|perGame|true': C19,
  'model|TE|totals|false': C18,
  'model|TE|totals|true': C19,
  'model|TE|perGame|false': C18,
  'model|TE|perGame|true': C19,
  'model|ALL|totals|false': C18,
  'model|ALL|totals|true': C19,
  'model|ALL|perGame|false': C18,
  'model|ALL|perGame|true': C19,
}
const METRIC_LABEL_PINS = [["fp","FP"],["fpPerG","FP/G"],["passYd","Pass Yd"],["passYdPerG","Pass Yd/G"],["passTd","Pass TD"],["passTdPerG","Pass TD/G"],["cmpPct","Cmp%"],["ypa","Y/A"],["passTdRate","TD%"],["intRate","INT%"],["sackRate","Sack%"],["passerRating","Rating"],["passAdot","aDOT"],["passAttPerG","Pass Att/G"],["passCmpPerG","Cmp/G"],["sacks","Sacks"],["sacksPerG","Sacks/G"],["rushAtt","Car"],["rushAttPerG","Car/G"],["rushYd","Rush Yd"],["rushYdPerG","Rush Yd/G"],["rushTd","Rush TD"],["rushTdPerG","Rush TD/G"],["ypc","Y/C"],["yacoPerAtt","YACo/Att"],["ybcPerAtt","YBC/Att"],["btkl","Brk Tkl"],["btklPerG","Brk Tkl/G"],["btklRate","Brk Tkl%"],["tgt","Tgt"],["tgtPerG","Tgt/G"],["rec","Rec"],["recPerG","Rec/G"],["recYd","Rec Yd"],["recYdPerG","Rec Yd/G"],["recTd","Rec TD"],["recTdPerG","Rec TD/G"],["catchPct","Catch%"],["ypr","Y/R"],["ypt","Y/Tgt"],["aDOT","aDOT"],["dropRate","Drop%"],["scrimYd","Scrim Yd"],["scrimYdPerG","Scrim Yd/G"],["totalTd","TD"],["totalTdPerG","TD/G"],["firstDowns","1st Dn"],["firstDownsPerG","1st Dn/G"],["looksPerG","Looks/G"],["fpShare","FP Share"],["tdShare","TD Share"],["scrimYdShare","Scrim Yd Share"],["snapPct","Snap%"],["tgtShare","Tgt Share"],["carryShare","Carry Share"],["aySh","AY Share"],["rzTgtShare","RZ Tgt Share"],["rzRushShare","RZ Car Share"],["epaPerAtt","EPA/att"],["cpoe","CPOE"],["rushEpaTotal","Rush EPA"],["rushEpaPerAtt","Rush EPA/att"],["epaPerTgt","EPA/tgt"],["racr","RACR"]]
const POPUP_LABEL_PINS = {"cmpPct":"Completion %","passerRating":"Passer rating","sacks":"Sacks taken","rushShare":"Rush share","rbTargetShare":"Target share","yardsPerCarry":"Yards / carry","targetShare":"Target share","airYardsShare":"Air yards share","aDOT":"aDOT","snapShare":"Snap share","rushRzShare":"Red-zone share","recRzShare":"Red-zone share"}
const ENV_LABEL_PINS = {proe:'PROE',pace:'Pace',successRate:'Success rate',rzTdRate:'Red-zone TD rate'}
const GAME_LOG_LABEL_PINS = {"QB":["CMP/ATT","YDS","TD","INT","EPA/ATT"],"RB":["CAR","YDS","TD","TGT","REC","EPA/CAR"],"WR":["TGT","REC","YDS","TD","aDOT","EPA/TGT"],"TE":["TGT","REC","YDS","TD","aDOT","EPA/TGT"]}

describe('metricGlossary', () => {
  it('1. every rendered metric has a glossary entry with a non-empty label and a one-sentence definition', () => {
    const ids = new Set()
    for (const { view, pos, opts } of grid()) {
      for (const c of factColumns(view, pos, opts)) {
        expect(c.glossaryId, `${view}/${pos}/${c.id}`).toBeTruthy()
        ids.add(c.glossaryId)
      }
    }
    for (const m of MARKET_METRICS) ids.add(m.id)
    for (const meta of Object.values(METRIC_META)) ids.add(meta.glossaryId)
    for (const id of SERIES_METRICS) ids.add(id)
    for (const cols of Object.values(GAME_LOG_COLUMNS)) for (const c of cols) ids.add(c.glossaryId)
    for (const id of Object.values(TILE_GLOSSARY_IDS)) ids.add(id)
    for (const id of ids) {
      const e = GLOSSARY[id]
      expect(e, `glossary entry for ${id}`).toBeTruthy()
      expect(typeof e.label === 'string' && e.label.length > 0, `${id} label`).toBe(true)
      expect(typeof e.definition === 'string' && e.definition.length > 0, `${id} definition`).toBe(true)
    }
    for (const [id, e] of Object.entries(GLOSSARY)) {
      expect(e.definition.endsWith('.'), `${id} ends with a full stop`).toBe(true)
      expect(e.definition.includes('. '), `${id} is one sentence`).toBe(false)
    }
  })

  it('2. no header, label or short form reads aDOT', () => {
    const strings = []
    for (const m of MARKET_METRICS) strings.push(m.label)
    for (const { view, pos, opts } of grid()) for (const c of factColumns(view, pos, opts)) strings.push(c.label)
    for (const meta of Object.values(METRIC_META)) strings.push(meta.label)
    for (const cols of [...Object.values(GAME_LOG_COLUMNS), ...Object.values(LIVE_GAME_LOG_COLUMNS)]) for (const c of cols) strings.push(c.label)
    for (const e of Object.values(GLOSSARY)) strings.push(e.label, e.short ?? '')
    for (const s of strings) expect(s).not.toMatch(/adot/i)
  })

  it('3. the Market tooltip and the pop-up row read one definition for the same quantity', () => {
    for (const [key, meta] of Object.entries(METRIC_META)) {
      if (!METRIC_BY_ID[meta.glossaryId]) continue
      expect(METRIC_BY_ID[meta.glossaryId].tooltip, key).toBe(`${meta.label}: ${meta.note}`)
    }
    expect(METRIC_META.aDOT.note).toBe(GLOSSARY.aDOT.definition)
  })

  describe('4. labels unchanged except aDOT', () => {
    const swap = to => arr => arr.map(x => (x === 'aDOT' ? to : x))
    it('MARKET_METRICS labels', () => {
      expect(MARKET_METRICS.map(m => [m.id, m.label])).toEqual(
        METRIC_LABEL_PINS.map(([id, label]) => [id, label === 'aDOT' ? 'Avg Dp' : label])
      )
    })
    it('factColumns labels, every view × position × stats mode × ros (season window)', () => {
      for (const view of VIEWS) for (const pos of POSITIONS) for (const statsMode of STATS_MODES) for (const ros of [false, true]) {
        const key = `${view}|${pos}|${statsMode}|${ros}`
        expect(factColumns(view, pos, { windowKind: 'season', statsMode, ros }).map(c => c.label), key)
          .toEqual(swap('Avg Dp')(COL_PINS[key]))
      }
    })
    it('pop-up Usage row labels and Environment labels', () => {
      for (const [k, label] of Object.entries(POPUP_LABEL_PINS)) {
        expect(METRIC_META[k].label, k).toBe(label === 'aDOT' ? 'Avg depth' : label)
      }
      for (const [k, label] of Object.entries(ENV_LABEL_PINS)) expect(GLOSSARY[k].label, k).toBe(label)
    })
    it('game-log headers', () => {
      for (const [pos, labels] of Object.entries(GAME_LOG_LABEL_PINS)) {
        expect(GAME_LOG_COLUMNS[pos].map(c => c.label), pos).toEqual(swap('AVG DP')(labels))
      }
    })
  })

  it('8. headerLabel and glossaryTooltip throw on an unknown id', () => {
    expect(() => headerLabel('nope')).toThrow(/unknown id/)
    expect(() => glossaryTooltip('nope')).toThrow(/unknown id/)
    expect(headerLabel('fp')).toBe('FP')
    expect(glossaryTooltip('fp')).toBe('Fantasy points: Fantasy points scored in the window.')
  })
})
