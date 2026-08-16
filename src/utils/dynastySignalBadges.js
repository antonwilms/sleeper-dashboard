// Pure leaf module — derives the dynasty-score signal badge list from dynastyScore.signals.
// Originally extracted from the Explorer's PlayersTab.jsx inline badge block so 1b content (the
// player detail pop-up's SIGNALS rail) could reuse the same predicates and copy without a second,
// drifting copy. `PlayersTab.jsx` itself was deleted in 1b Slice viii (the `/players` retirement)
// rather than ever converging on this module, so this is now the single source. Do not add new
// signal copy here — this is a straight extraction, not a new feature.
//
// tone is semantic ('positive' | 'caution' | 'neutral'), not a Tailwind class, so each consumer
// can map it to its own token family — the pop-up maps tone -> --color-dp-* locally; Market's
// Outlook column set (its second consumer, since 1b Slice iii) does the same.

export function computeDynastySignalBadges(signals, player = {}) {
  if (!signals) return []

  const badges = []

  if (signals.isBreakout) {
    badges.push({
      key: 'breakout',
      label: '⚡ Breakout',
      body: 'Performing 30%+ above age-curve expectation — outperforming peers at this age',
      tone: 'positive',
    })
  }
  if (signals.isBounceBack) {
    badges.push({
      key: 'bounceback',
      label: '↩ Bounce-back',
      body: 'Strong return after injury-shortened season',
      tone: 'positive',
    })
  }
  if (signals.momentumLabel === 'accelerating') {
    badges.push({
      key: 'accel',
      label: '↑↑ Accelerating',
      body: 'Production significantly higher in last 2 seasons vs prior 2',
      tone: 'positive',
    })
  }
  if (signals.momentumLabel === 'decelerating') {
    badges.push({
      key: 'decel',
      label: '↓↓ Decelerating',
      body: 'Production significantly lower in last 2 seasons vs prior 2',
      tone: 'caution',
    })
  }
  if (signals.isTdReliant) {
    badges.push({
      key: 'td',
      label: '⚠ TD-reliant',
      body: `${Math.round((signals.tdDependency ?? 0) * 100)}% of points from touchdowns — production may be volatile if red zone usage changes`,
      tone: 'caution',
    })
  }
  if ((signals.injurySeasonCount ?? 0) >= 2) {
    badges.push({
      key: 'injury',
      label: '⚠ Injury risk',
      body: `${signals.injurySeasonCount} seasons with fewer than 10 games played — durability concern`,
      tone: 'caution',
    })
  }
  if (signals.ageCurveFactor != null) {
    const above = signals.ageCurveFactor >= 1
    badges.push({
      key: 'agecurve',
      label: `Age curve ×${signals.ageCurveFactor}`,
      body: `Performing ${above ? 'above' : 'below'} expected level for a ${player.position ?? '?'} aged ${player.age ?? '?'}`,
      tone: 'neutral',
    })
  }

  return badges
}
