// weekly-decision-2a-lineup-truth.md §5 — renders nothing unless `storeLag?.behind`. Muted copy,
// not an error colour: it is expected to fire for a few hours most Tuesdays, between Sleeper
// advancing the week and the season-totals job landing. Presentational, props-only.

export function StoreLagNotice({ storeLag = null, season = null }) {
  if (!storeLag?.behind) return null

  const { storeThroughWeek, completedWeeks } = storeLag

  return (
    <p className="text-[12px] text-dp-muted">
      {storeThroughWeek === 0
        ? `Points-allowed figures don't include any ${season ?? '—'} games; week ${completedWeeks} hasn't reached the data store yet.`
        : `Points-allowed figures run through week ${storeThroughWeek}; week ${completedWeeks} hasn't reached the data store yet.`}
    </p>
  )
}
