import { DefinitionPopover } from './DefinitionPopover'
import { RankPair } from './RankPair'
import { AGE_CAUTION } from '../../utils/twoYearBaseline'

const stop = e => e.stopPropagation()

const TWO_YEAR_GLOSS = 'Rank among veterans at this position over the last two completed seasons, in league scoring: first by total points across both seasons, then (/g) by points per game averaged over the seasons with 8+ games. In the dynasty history tests (S3/S4a, seasons 2015–2022) the dynasty score did not beat the per-game ranking.'

export function TwoYearRankCell({ entry, position }) {
  if (entry == null) {
    return (
      <span data-testid="two-year-rank" onClick={stop} className="text-[11px] text-dp-muted font-dp-mono">
        <DefinitionPopover
          term="2-yr rank"
          gloss="Not ranked: needs a veteran dynasty score and at least one 8-game season in the last two completed seasons."
        >
          —
        </DefinitionPopover>
      </span>
    )
  }
  return (
    <span data-testid="two-year-rank" onClick={stop} className="text-[11px] text-dp-muted font-dp-mono">
      <DefinitionPopover term="2-yr rank" gloss={TWO_YEAR_GLOSS}>
        2-yr <RankPair prefix={position} rank={entry.rank} rankPpg={entry.rankPpg} title={null} rankClassName="text-dp-text-4" />
      </DefinitionPopover>
    </span>
  )
}

export function AgeCautionMarker({ kind, ageSource }) {
  if (kind == null || !AGE_CAUTION[kind]) return null
  const text = AGE_CAUTION[kind].text
  const gloss = `${text} Heuristic, from the dynasty history test (S3, seasons 2015–2022): 31+ over-rated and 24-and-under under-rated at every position.${
    ageSource === 'sleeper' ? ' Age from Sleeper (no birthdate on file).' : ''
  }`
  // PROVISIONAL(heuristic): two-year-average rank and age-band caution · stand-in for a forward-looking dynasty score (S5, off-season) · S3/S4a: the score does not beat the two-year average and leans toward veterans; a score that passes S4a's test replaces this
  return (
    <span onClick={stop} aria-label={text} className="ml-1.5 text-[10px] font-dp-mono text-dp-down-text shrink-0 whitespace-nowrap">
      <DefinitionPopover term="Age caution" gloss={gloss}>
        {kind === 'over' ? '▲ age' : '▼ age'}
      </DefinitionPopover>
    </span>
  )
}
