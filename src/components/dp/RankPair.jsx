import { PPG_RANK_MIN_GAMES } from '../../utils/weeklyRanks'
import { ppgRankLabel } from './rankPairText'

const N = PPG_RANK_MIN_GAMES
export const RANK_PAIR_TITLE =
  `Rank by total points · rank by points per game (min ${N} games; lower until someone at the position has played ${N})`

// The inline total · per-game rank pair. Sets no font or size — it inherits its host's, so every tight cell
// renders it identically within its own context. The /g part is secondary (dp-muted by default, ≈5.2:1 on the
// card); the total rank keeps the host colour (or `rankClassName`) and stays the visual anchor. Callers over the
// `PlayerCell` watermark (This Week) pass tones that clear 4.5:1 there — `ppgClassName` must not be dimmer than the host
// text; elsewhere the default dims the /g part.
export function RankPair({ prefix = '', rank, rankPpg, title = RANK_PAIR_TITLE, rankClassName, ppgClassName = 'text-dp-muted' }) {
  if (rank == null) return null
  return (
    <span data-testid="rank-pair" title={title} className="whitespace-nowrap">
      <span className={rankClassName}>{prefix}{rank}</span>
      <span className={ppgClassName}> · {ppgRankLabel(prefix, rankPpg)}/g</span>
    </span>
  )
}
