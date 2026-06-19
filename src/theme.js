const LS_THEME = 'theme'

export function loadStoredTheme() {
  try { return localStorage.getItem(LS_THEME) || 'dark' } catch { return 'dark' }
}

export function persistTheme(t) {
  try { localStorage.setItem(LS_THEME, t) } catch {}
}

export function applyThemeClass(t) {
  document.documentElement.classList.toggle('dark', t === 'dark')
}
