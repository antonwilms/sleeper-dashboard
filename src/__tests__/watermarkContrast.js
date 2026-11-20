// Shared helper for the W2b-2 watermark contrast tests (cells.test.jsx, LineupTable.test.jsx). Not a
// test file (no `*.test.*` name), so vitest does not collect it. Imports the contrast maths from
// percentileColour.js and the opacity from cells.jsx; copies no definition.
import { readFileSync } from 'node:fs'
import { hexToRgb, relativeLuminance, contrastRatio } from '../utils/percentileColour'
import { WATERMARK_OPACITY } from '../components/dp/cells'

export const GROUNDS = ['dp-card', 'dp-card-quiet', 'dp-row-self']

export function cssToken(name, cssText = readFileSync('src/index.css', 'utf8')) {
  const m = cssText.match(new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`))
  if (!m) throw new Error(`token --color-${name} not found`)
  return m[1]
}

// The `text-dp-*` colour class on an element (size classes like text-[11px] never match).
export function textToken(el) {
  const m = el.className.match(/\btext-(dp-[a-z0-9-]+)\b/)
  if (!m) throw new Error(`no text-dp-* class on "${el.className}"`)
  return m[1]
}

// White at WATERMARK_OPACITY composited over `hex` (the worst-case logo pixel for light text).
function withWatermark(hex) {
  const g = hexToRgb(hex)
  const mix = v => Math.round(255 * WATERMARK_OPACITY + v * (1 - WATERMARK_OPACITY))
  return { r: mix(g.r), g: mix(g.g), b: mix(g.b) }
}

// Minimum contrast ratio of the element's text colour over the three grounds under a white watermark pixel.
export function minWatermarkContrast(el, cssText = readFileSync('src/index.css', 'utf8')) {
  const text = relativeLuminance(hexToRgb(cssToken(textToken(el), cssText)))
  return Math.min(...GROUNDS.map(g => contrastRatio(text, relativeLuminance(withWatermark(cssToken(g, cssText))))))
}
