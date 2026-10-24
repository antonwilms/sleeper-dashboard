// Dynasty label rules for components-path (Paths B/C) scores — the single source of truth.
// Called by computeDynastyScore (initial label) and applyQBQualityModifier (re-pick after the
// post-score QB-quality modifier moves the score). Prospect / Limited Data labels are not here.
// Pure leaf module — no imports (computeDynastyScore already imports teamContext.js, which
// imports this, so it must not import back from either).

// Depth 3+ label gate: deep backups can't justify labels above "Solid Floor"
const LABELS_ABOVE_FLOOR = new Set(['Elite', 'Ascending Star', 'Peak Window', 'Developing', 'Rising', 'Breakout', 'Bounce-back'])

export function pickDynastyLabel({ score, isLateCareer, isBreakout, isBounceBack, slope, age, depthOrder }) {
  let label

  // Late-career gate: player ≥ 5 years past their position's capped peak age.
  // Bypasses the standard label logic — peak-era labels (Elite, Peak Window, etc.)
  // are misleading for genuinely post-peak players regardless of their current score.
  if (isLateCareer) {
    label = score >= 55 ? 'Veteran Producer'
          : score >= 40 ? 'Managed Decline'
          : score >= 20 ? 'Sell Now'
          : 'Fading'
  } else if (isBreakout) {
    label = 'Breakout'
  } else if (isBounceBack) {
    label = 'Bounce-back'
  } else if (score >= 80) {
    label = 'Elite'
  } else if (score >= 70 && slope > 0) {
    label = 'Ascending Star'
  } else if (score >= 70) {
    label = 'Peak Window'
  } else if (score >= 55 && age != null && age <= 25) {
    label = 'Developing'
  } else if (score >= 55 && slope > 0) {
    label = 'Rising'
  } else if (score >= 55) {
    label = 'Solid Floor'
  } else if (score >= 40 && slope >= 0) {
    label = 'Plateau'
  } else if (score >= 40) {
    label = 'Managed Decline'
  } else if (score >= 20) {
    label = 'Sell Now'
  } else {
    label = 'Fading'
  }

  if (depthOrder != null && depthOrder >= 3) {
    if (LABELS_ABOVE_FLOOR.has(label)) label = 'Solid Floor'
  }
  return label
}
