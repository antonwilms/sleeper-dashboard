import { describe, it, expect, beforeEach, afterEach } from 'vitest'

// Pure-env tests — no DOM needed for load/persist
describe('loadStoredTheme', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns dark when localStorage is empty (default-dark)', async () => {
    const { loadStoredTheme } = await import('./theme.js')
    expect(loadStoredTheme()).toBe('dark')
  })

  it('returns light when light is stored', async () => {
    localStorage.setItem('theme', 'light')
    const { loadStoredTheme } = await import('./theme.js')
    expect(loadStoredTheme()).toBe('light')
  })

  it('returns dark when dark is stored', async () => {
    localStorage.setItem('theme', 'dark')
    const { loadStoredTheme } = await import('./theme.js')
    expect(loadStoredTheme()).toBe('dark')
  })

  it('returns dark when localStorage throws (catch path)', async () => {
    const orig = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('blocked') },
      configurable: true,
    })
    try {
      const { loadStoredTheme } = await import('./theme.js')
      expect(loadStoredTheme()).toBe('dark')
    } finally {
      if (orig) Object.defineProperty(window, 'localStorage', orig)
    }
  })
})

describe('persistTheme + loadStoredTheme round-trip', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('persisting light then loading returns light', async () => {
    const { persistTheme, loadStoredTheme } = await import('./theme.js')
    persistTheme('light')
    expect(loadStoredTheme()).toBe('light')
  })
})

// @vitest-environment jsdom
describe('applyThemeClass', () => {
  afterEach(() => {
    document.documentElement.classList.remove('dark')
  })

  it('adds .dark when theme is dark', async () => {
    const { applyThemeClass } = await import('./theme.js')
    applyThemeClass('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('removes .dark when theme is light', async () => {
    document.documentElement.classList.add('dark')
    const { applyThemeClass } = await import('./theme.js')
    applyThemeClass('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('is idempotent — adding dark twice leaves .dark present', async () => {
    const { applyThemeClass } = await import('./theme.js')
    applyThemeClass('dark')
    applyThemeClass('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('is idempotent — removing light twice leaves .dark absent', async () => {
    const { applyThemeClass } = await import('./theme.js')
    applyThemeClass('light')
    applyThemeClass('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })
})
