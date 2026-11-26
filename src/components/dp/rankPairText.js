// '—' when the per-game rank is null (under the games floor).
export const ppgRankLabel = (prefix, rankPpg) => (rankPpg != null ? `${prefix}${rankPpg}` : '—')

// The pair as plain text, for title attributes: `QB3 · QB1/g`, `QB3 · —/g`.
export function rankPairText(prefix, rank, rankPpg) {
  return `${prefix}${rank} · ${ppgRankLabel(prefix, rankPpg)}/g`
}
