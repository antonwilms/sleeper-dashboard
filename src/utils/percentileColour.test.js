import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { SCALE_STOPS, SCALE_INK, scaleRgb, scaleCss, scaleInk, relativeLuminance, contrastRatio, hexToRgb } from './percentileColour'

const samples = Array.from({ length: 201 }, (_, i) => i / 200)
const parseCss = s => { const m = /rgb\((\d+), (\d+), (\d+)\)/.exec(s); return { r: +m[1], g: +m[2], b: +m[3] } }

describe('percentileColour', () => {
  it('T12 luminance is non-decreasing and the ends are the end stops', () => {
    const lum = samples.map(p => relativeLuminance(scaleRgb(p)))
    for (let i = 1; i < lum.length; i++) expect(lum[i]).toBeGreaterThanOrEqual(lum[i - 1])
    expect(scaleRgb(0)).toEqual(hexToRgb(SCALE_STOPS[0]))
    expect(scaleRgb(1)).toEqual(hexToRgb(SCALE_STOPS[5]))
  })

  it('T13 index.css tokens equal SCALE_STOPS / SCALE_INK', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const tok = name => new RegExp(`--color-dp-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1]?.toLowerCase()
    SCALE_STOPS.forEach((hex, i) => expect(tok(`scale-${i}`)).toBe(hex.toLowerCase()))
    expect(tok('scale-ink-dark')).toBe(SCALE_INK.dark.toLowerCase())
    expect(tok('scale-ink-light')).toBe(SCALE_INK.light.toLowerCase())
  })

  it('T14 ink contrast >= 4.5:1 at the stops and 201 samples, unrounded and rounded', () => {
    const ps = [...samples, 0, 0.2, 0.4, 0.6, 0.8, 1]
    for (const p of ps) {
      const ink = relativeLuminance(hexToRgb(scaleInk(p)))
      expect(contrastRatio(relativeLuminance(scaleRgb(p)), ink)).toBeGreaterThanOrEqual(4.5)
      expect(contrastRatio(relativeLuminance(parseCss(scaleCss(p))), ink)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('T15 scaleCss uses the comma form', () => {
    expect(scaleCss(0)).toBe('rgb(42, 27, 77)')
  })
})
