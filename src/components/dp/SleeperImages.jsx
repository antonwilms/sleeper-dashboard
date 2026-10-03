import { useState } from 'react'
import { playerHeadshotUrl, teamLogoUrl } from '../../utils/sleeperImages'

// Sleeper CDN images with a graceful fallback (in-season notes P7 — sleeper-images.md).
// PlayerHeadshot renders a player's Sleeper photo; TeamLogo renders a team's Sleeper logo. URLs come
// only from src/utils/sleeperImages.js — no surface builds a sleepercdn.com URL itself.
//
// Fallback rule (D4): a headshot with no usable src (a non-numeric id, or a CDN 403/404 firing
// onError) renders the `fallback` prop when given, else a same-size neutral placeholder so row
// alignment never shifts. A TeamLogo with no usable src renders nothing — every logo sits beside
// the team code text, which stays.
//
// `<img>` rules, all required: referrerPolicy="no-referrer" (the app's origin is not sent to the
// CDN); no `crossOrigin` (the CDN sends no access-control-allow-origin header, so a CORS-mode
// request would fail and fire onError for every image); alt="" (decorative — the adjacent text
// carries the name/team); loading="lazy" + decoding="async" (long tables must not fetch or decode
// every row up front). Failure is tracked as `failedSrc === src`, not a boolean, so a re-render
// with a different player/team retries instead of staying on the fallback.

export function PlayerHeadshot({ playerId, size = 28, shapeClass = 'rounded-full', fallback, badge }) {
  const src = playerHeadshotUrl(playerId)
  const [failedSrc, setFailedSrc] = useState(null)

  if (src == null || failedSrc === src) {
    if (fallback !== undefined) return fallback
    return (
      <span
        aria-hidden="true"
        data-testid="headshot-fallback"
        className={`${shapeClass} bg-dp-chip shrink-0 inline-block`}
        style={{ width: size, height: size }}
      />
    )
  }

  const img = (
    <img
      data-testid="headshot"
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailedSrc(src)}
      style={{ width: size, height: size }}
      className={`${shapeClass} object-cover bg-dp-chip shrink-0`}
    />
  )
  if (badge == null) return img
  return (
    <span className="relative inline-block shrink-0">
      {img}
      {badge}
    </span>
  )
}

export function TeamLogo({ team, size = 16, className = '' }) {
  const src = teamLogoUrl(team)
  const [failedSrc, setFailedSrc] = useState(null)

  if (src == null || failedSrc === src) return null

  return (
    <img
      data-testid="team-logo"
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailedSrc(src)}
      style={{ width: size, height: size }}
      className={`object-contain shrink-0 ${className}`}
    />
  )
}
