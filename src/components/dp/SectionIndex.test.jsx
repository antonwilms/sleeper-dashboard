// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { SectionIndex } from './SectionIndex'

expect.extend(jestDomMatchers)
afterEach(cleanup)

const sections = [
  { id: 'overview', label: 'Overview', count: 3, span: '3y' },
  { id: 'drivers', label: 'Score drivers' },
  { id: 'why-next', label: 'Why next season' },
]

describe('SectionIndex', () => {
  it('renders one row per section', () => {
    render(<SectionIndex sections={sections} activeId="overview" onSelect={() => {}} />)
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Score drivers')).toBeInTheDocument()
    expect(screen.getByText('Why next season')).toBeInTheDocument()
  })

  it('the active row carries the active classes', () => {
    render(<SectionIndex sections={sections} activeId="drivers" onSelect={() => {}} />)
    expect(screen.getByText('Score drivers').closest('button').className).toContain('bg-dp-row-active')
    expect(screen.getByText('Overview').closest('button').className).not.toContain('bg-dp-row-active')
  })

  it('clicking a row calls onSelect with its id', () => {
    const onSelect = vi.fn()
    render(<SectionIndex sections={sections} activeId="overview" onSelect={onSelect} />)
    fireEvent.click(screen.getByText('Why next season'))
    expect(onSelect).toHaveBeenCalledWith('why-next')
  })

  it('rows are buttons, keyboard-reachable', () => {
    render(<SectionIndex sections={sections} activeId="overview" onSelect={() => {}} />)
    expect(screen.getByText('Overview').closest('button')).toBeInstanceOf(HTMLButtonElement)
  })

  it('an entry without a count renders no pips', () => {
    render(<SectionIndex sections={sections} activeId="overview" onSelect={() => {}} />)
    const driversRow = screen.getByText('Score drivers').closest('button')
    expect(driversRow.querySelector('[aria-hidden="true"]')).not.toBeInTheDocument()
  })

  it('an entry with a count renders CoveragePips', () => {
    render(<SectionIndex sections={sections} activeId="overview" onSelect={() => {}} />)
    const overviewRow = screen.getByText('Overview').closest('button')
    expect(overviewRow.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    expect(screen.getByText('3y')).toBeInTheDocument()
  })
})
