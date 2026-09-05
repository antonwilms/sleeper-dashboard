// @vitest-environment jsdom
// parsePage() uses DOMParser — the repo's default 'node' test environment has none.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('../utils/cache', () => ({
  getCache: vi.fn(() => Promise.resolve(null)),
  setCache: vi.fn(() => Promise.resolve()),
}))

// KTC page markup: one `.onePlayer` row, enough for parsePage to succeed.
const ONE_PLAYER_HTML = `
  <div class="onePlayer">
    <div class="player-name"><p><a>Ja'Marr Chase</a></p><span class="player-team">CIN</span></div>
    <div class="position-team">WR1</div>
    <div class="value"><p>9,500</p></div>
  </div>
`

let fetchSpy

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch')
  vi.resetModules()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('corsproxy.io key handling (post-legacy-URL-retirement)', () => {
  it('no VITE_CORSPROXY_KEY configured — never calls corsproxy, warns once, getKTCValues resolves null', async () => {
    vi.stubEnv('VITE_CORSPROXY_KEY', undefined)
    vi.stubEnv('DEV', false)
    const warnSpy = vi.spyOn(console, 'warn')
    const { getKTCValues } = await import('./ktc.js')

    const result = await getKTCValues()

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
    const keyWarnings = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('is not set'))
    )
    expect(keyWarnings.length).toBe(1)
  })

  it('warns only once across repeated calls in the same session (module-level guard)', async () => {
    vi.stubEnv('VITE_CORSPROXY_KEY', undefined)
    vi.stubEnv('DEV', false)
    const warnSpy = vi.spyOn(console, 'warn')
    const { getKTCValues } = await import('./ktc.js')

    await getKTCValues()
    await getKTCValues()

    const keyWarnings = warnSpy.mock.calls.filter(args =>
      args.some(a => typeof a === 'string' && a.includes('is not set'))
    )
    expect(keyWarnings.length).toBe(1)
  })

  it('with VITE_CORSPROXY_KEY configured — fetches the new keyed URL shape (key= and url= params)', async () => {
    vi.stubEnv('VITE_CORSPROXY_KEY', 'test-key-123')
    vi.stubEnv('DEV', false)
    fetchSpy.mockResolvedValue({ ok: true, text: () => Promise.resolve(ONE_PLAYER_HTML) })
    const { getKTCValues } = await import('./ktc.js')

    const result = await getKTCValues()

    expect(fetchSpy).toHaveBeenCalled()
    const requestedUrl = fetchSpy.mock.calls[0][0]
    expect(requestedUrl).toContain('https://corsproxy.io/?')
    expect(requestedUrl).toContain('key=test-key-123')
    expect(requestedUrl).toContain(`url=${encodeURIComponent('https://keeptradecut.com')}`)
    expect(result).not.toBeNull()
    expect(result[0].name).toBe("Ja'Marr Chase")
  })

  it('a corsproxy non-OK response still fails gracefully — getKTCValues returns null, never throws', async () => {
    vi.stubEnv('VITE_CORSPROXY_KEY', 'test-key-123')
    vi.stubEnv('DEV', false)
    fetchSpy.mockResolvedValue({ ok: false, status: 401 })
    const { getKTCValues } = await import('./ktc.js')

    await expect(getKTCValues()).resolves.toBeNull()
  })

  it('DEV mode still tries the local /ktc-proxy first, regardless of VITE_CORSPROXY_KEY', async () => {
    vi.stubEnv('VITE_CORSPROXY_KEY', undefined)
    vi.stubEnv('DEV', true)
    fetchSpy.mockImplementation((url) => {
      if (String(url).startsWith('/ktc-proxy')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(ONE_PLAYER_HTML) })
      }
      return Promise.reject(new Error('should not reach corsproxy in this test'))
    })
    const { getKTCValues } = await import('./ktc.js')

    const result = await getKTCValues()
    expect(result).not.toBeNull()
    expect(result[0].name).toBe("Ja'Marr Chase")
  })
})
