import { PPG_RANK_MIN_GAMES } from '../../utils/weeklyRanks'

const N = PPG_RANK_MIN_GAMES
export const RANK_PAIR_TITLE =
  `Rank by total points · rank by points per game (min ${N} games; lower until someone at the position has played ${N})`

// The inline total · per-game rank pair. Sets no font or size — it inherits its host's, so every tight cell
// renders it identically within its own context. The /g part is secondary (dp-muted-2); the total rank keeps
// the host colour and stays the visual anchor.
export function RankPair({ prefix = '', rank, rankPpg, title = RANK_PAIR_TITLE }) {
  if (rank == null) return null
  return (
    <span data-testid="rank-pair" title={title} className="whitespace-nowrap">
      <span>{prefix}{rank}</span>
      <span className="text-dp-muted-2"> · {rankPpg != null ? `${prefix}${rankPpg}` : '—'}/g</span>
    </span>
  )
}
