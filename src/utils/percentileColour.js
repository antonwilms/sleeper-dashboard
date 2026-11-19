// W2b-1 — the league-starter percentile colour scale. Pure, view-only. The six stops and the two
// ink colours are also tokens in src/index.css (`--color-dp-scale-*`); equality-tested in
// percentileColour.test.js (original = index.css).

export const SCALE_STOPS = ['#2A1B4D', '#3B3F86', '#22708A', '#25A07A', '#5FD06A', '#C2F59A']
export const SCALE_INK = { dark: '#000000', light: '#ffffff' }

export function hexToRgb(hex) {
  const h = hex.replace('#', '')
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

// Linear sRGB-channel interpolation between the six stops at p = 0, .2, … 1. UNROUNDED channels.
export function scaleRgb(p) {
  const c = Math.min(1, Math.max(0, p))
  const s = Math.min(4, Math.floor(c * 5))
  const t = c * 5 - s
  const a = hexToRgb(SCALE_STOPS[s])
  const b = hexToRgb(SCALE_STOPS[s + 1])
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t }
}

// Comma form — jsdom's CSSStyleDeclaration parses it; the space form may be dropped.
export function scaleCss(p) {
  const { r, g, b } = scaleRgb(p)
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`
}

export function relativeLuminance({ r, g, b }) {
  const lin = v => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

export function contrastRatio(l1, l2) {
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

export function scaleInk(p) {
  const bg = relativeLuminance(scaleRgb(p))
  const dark = contrastRatio(bg, relativeLuminance(hexToRgb(SCALE_INK.dark)))
  const light = contrastRatio(bg, relativeLuminance(hexToRgb(SCALE_INK.light)))
  return dark >= light ? SCALE_INK.dark : SCALE_INK.light
}
