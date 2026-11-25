// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DefinitionPopover } from './DefinitionPopover'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const CONTENT = {
  term: 'WOPR', scope: 'season', gloss: 'Weighted opportunity rating.',
  percentiles: { p10: 0.2, p50: 0.5, p90: 0.9, subject: 72 },
  band: 'high', span: '2021–2025',
  field: '(1.5 × target_share) + (0.7 × air_yards_share)',
}

describe('DefinitionPopover', () => {
  it('is closed by default', () => {
    render(<DefinitionPopover {...CONTENT}>WOPR</DefinitionPopover>)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('opens on click', () => {
    render(<DefinitionPopover {...CONTENT}>WOPR</DefinitionPopover>)
    fireEvent.click(screen.getByRole('button', { name: 'WOPR' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('does not open on hover — no mouseover/mouseenter handler opens it', () => {
    render(<DefinitionPopover {...CONTENT}>WOPR</DefinitionPopover>)
    const trigger = screen.getByRole('button', { name: 'WOPR' })
    fireEvent.mouseOver(trigger)
    fireEvent.mouseEnter(trigger)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('closes on Escape and returns focus to the trigger', () => {
    render(<DefinitionPopover {...CONTENT}>WOPR</DefinitionPopover>)
    const trigger = screen.getByRole('button', { name: 'WOPR' })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.activeElement).toBe(trigger)
  })

  it('the trigger is a real <button> (keyboard-operable)', () => {
    render(<DefinitionPopover {...CONTENT}>WOPR</DefinitionPopover>)
    expect(screen.getByRole('button', { name: 'WOPR' }).tagName).toBe('BUTTON')
  })

  it('renders content in the specified order: term+scope, gloss, percentile strip, pips+span, field', () => {
    render(<DefinitionPopover {...CONTENT}>WOPR</DefinitionPopover>)
    fireEvent.click(screen.getByRole('button', { name: 'WOPR' }))
    const dialog = screen.getByRole('dialog')
    const text = dialog.textContent
    const iTerm = text.indexOf('WOPR')
    const iScope = text.indexOf('season')
    const iGloss = text.indexOf('Weighted opportunity rating')
    const iStripCaption = text.indexOf('LEAGUE 10th')
    const iSpan = text.indexOf('2021–2025')
    const iField = text.indexOf('target_share')
    expect(iTerm).toBeGreaterThanOrEqual(0)
    expect(iTerm).toBeLessThan(iScope)
    expect(iScope).toBeLessThan(iGloss)
    expect(iGloss).toBeLessThan(iStripCaption)
    expect(iStripCaption).toBeLessThan(iSpan)
    expect(iSpan).toBeLessThan(iField)
  })

  it('the percentile strip caption uses the void token, no verdict language', () => {
    render(<DefinitionPopover {...CONTENT}>WOPR</DefinitionPopover>)
    fireEvent.click(screen.getByRole('button', { name: 'WOPR' }))
    const caption = screen.getByText('LEAGUE 10th → 90th · RAW VALUE, NOT RANK')
    expect(caption.className).toContain('text-dp-muted-3')
  })
})

describe('DefinitionPopover — strategy', () => {
  const savedWidth = window.innerWidth
  const savedHeight = window.innerHeight
  const setViewport = (width, height) => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
  }
  const mockGeometry = TRIGGER => vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    return this.getAttribute('role') === 'dialog'
      ? { top: 0, bottom: 150, left: 0, right: 256, width: 256, height: 150 }
      : TRIGGER
  })
  afterEach(() => {
    vi.restoreAllMocks()
    setViewport(savedWidth, savedHeight)
  })
  const openPopover = (props = {}) => {
    render(<DefinitionPopover {...CONTENT} {...props}>WOPR</DefinitionPopover>)
    fireEvent.click(screen.getByRole('button', { name: 'WOPR' }))
    return screen.getByRole('dialog')
  }

  it('D1 the default stays an absolute panel, unpositioned and open through a scroll', () => {
    mockGeometry({ top: 100, bottom: 120, left: 40 })
    setViewport(1024, 800)
    const dialog = openPopover()
    expect(dialog.classList).toContain('absolute')
    expect(dialog.classList).toContain('mt-1')
    expect(dialog.classList).not.toContain('fixed')
    expect(dialog.style.top).toBe('')
    expect(dialog.style.left).toBe('')
    fireEvent.scroll(document)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('D2 fixed places the panel below the trigger against the viewport', () => {
    mockGeometry({ top: 100, bottom: 120, left: 40 })
    setViewport(1024, 800)
    const dialog = openPopover({ strategy: 'fixed' })
    expect(dialog.style.top).toBe('124px')
    expect(dialog.style.left).toBe('40px')
    expect(dialog.classList).toContain('fixed')
  })

  it('D3 fixed flips above the trigger near the bottom of the viewport', () => {
    mockGeometry({ top: 700, bottom: 720, left: 40 })
    setViewport(1024, 800)
    const dialog = openPopover({ strategy: 'fixed' })
    expect(dialog.style.top).toBe('546px')
  })

  it('D4 fixed clamps the left edge on a phone-width viewport', () => {
    mockGeometry({ top: 100, bottom: 120, left: 300 })
    setViewport(375, 800)
    const dialog = openPopover({ strategy: 'fixed' })
    expect(dialog.style.left).toBe('111px')
  })

  it('D5 fixed closes on scroll and on resize', () => {
    mockGeometry({ top: 100, bottom: 120, left: 40 })
    setViewport(1024, 800)
    openPopover({ strategy: 'fixed' })
    fireEvent.scroll(document)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'WOPR' }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent(window, new Event('resize'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
