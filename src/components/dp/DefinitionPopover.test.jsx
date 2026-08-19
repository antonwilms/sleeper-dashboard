// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
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
