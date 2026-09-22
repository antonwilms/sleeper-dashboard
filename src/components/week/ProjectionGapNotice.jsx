// weekly-decision-2-panels.md §4b — why a PROJ cell is blank. Renders nothing when `reason` is
// null. Presentational, props-only. No comment here may predict when Sleeper publishes — the two
// "yet"/"didn't" phrasings are runtime branches on observed state, same as StoreLagNotice.

const COPY = {
  scoring: () => `PROJ is blank: this league's scoring settings didn't load.`,
  unpublished: week => `PROJ is blank: Sleeper hasn't published week ${week} projections yet.`,
  player: week => `A blank PROJ means Sleeper has no week ${week} projection for that player.`,
}

export function ProjectionGapNotice({ reason = null, week = null }) {
  if (reason == null) return null
  const text = COPY[reason]?.(week)
  if (text == null) return null

  return <p className="text-[12px] text-dp-muted">{text}</p>
}
