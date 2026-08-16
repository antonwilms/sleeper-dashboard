import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { compareNullsLast } from '../../utils/sortUtils'

// Global player search (1b Slice vii §4) — activates the field Slice i left disabled. Chrome
// component: stays on the light/dark-adaptive --color-* family (NOT --color-dp-*), same as the
// rest of TopBar/NavRail/BottomTabBar, since it wraps League/Board/Trade in both themes (§5.2). A
// dark-only dp dropdown hanging off a theme-adaptive bar would render as a black panel under a
// light bar. Deliberately does NOT import dp/cells.jsx's PlayerCell — that component carries dp
// tokens; the result rows below are local markup matching its layout, not its implementation.

const MIN_QUERY_LEN = 2
const RESULT_LIMIT = 8

function SearchResultRow({ player, onSelect }) {
  const meta = [player.position, player.age, player.nfl_team].filter(Boolean).join(' · ')
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(player.player_id)}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(player.player_id)
        }
      }}
      className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-[var(--color-surface-2)]"
    >
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-[var(--color-text)] truncate">{player.full_name}</div>
        {meta && <div className="text-[11px] text-[var(--color-text-muted)] truncate">{meta}</div>}
      </div>
      <span className="font-mono text-[11px] text-[var(--color-text-muted)] shrink-0">
        {player.score ?? '—'}
      </span>
    </div>
  )
}

export function TopBar({
  user, selectedLeague, onSwitch, theme, onToggleTheme,
  showLeagueLink, currentWeek, searchablePlayers, popupOpen, onOpenPlayerDetail,
}) {
  const isDark = theme === 'dark'
  const disabled = !(searchablePlayers?.length > 0)

  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  // ⌘K / Ctrl+K — owned here, not App.jsx (§4.3/§5.1). Inert while the pop-up is open: its scrim
  // already blocks the click path (z-40 over TopBar's z-30), so `popupOpen` just closes the same
  // gap for the one input a scrim can't block — a keydown listener. A second global Escape/⌘K
  // listener living in App.jsx would need a focus-signal prop back down to this input; a boolean
  // can't even re-fire on a repeated ⌘K, so the listener lives with the ref it operates on instead.
  useEffect(() => {
    const handler = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        if (popupOpen) return
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [popupOpen])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    const handler = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  // Clear the query on league switch (§5.1) — view-local state, so `handleSwitch` in App.jsx has
  // no handle on it; AppShell renders TopBar unconditionally, so it never unmounts on a switch
  // either. This effect is the only place that CAN reset it.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional league-switch reset
    setQuery('')
    setOpen(false)
  }, [selectedLeague?.league_id])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q.length < MIN_QUERY_LEN) return []
    return (searchablePlayers ?? [])
      .filter(p => (p.full_name ?? '').toLowerCase().includes(q))
      .sort((a, b) => compareNullsLast(a.score, b.score, -1))
      .slice(0, RESULT_LIMIT)
  }, [query, searchablePlayers])

  const showDropdown = open && results.length > 0

  function handleChange(e) {
    const v = e.target.value
    setQuery(v)
    setOpen(v.trim().length >= MIN_QUERY_LEN)
  }

  function handleFocus() {
    if (query.trim().length >= MIN_QUERY_LEN) setOpen(true)
  }

  function handleKeyDown(e) {
    if (e.key === 'Escape') {
      setOpen(false)
      e.currentTarget.blur()
    }
  }

  function handleSelect(id) {
    onOpenPlayerDetail?.(id)
    setQuery('')
    setOpen(false)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-[18px] h-[18px] rounded-sm bg-[var(--color-accent)]" aria-hidden="true" />
          {selectedLeague && (
            <span className="font-semibold text-[var(--color-text)] tracking-tight flex items-center gap-1">
              {selectedLeague.name}
              <span className="text-[var(--color-text-faint)]" aria-hidden="true">▾</span>
            </span>
          )}
        </div>

        <div className="flex-1 max-w-md hidden sm:block relative" ref={containerRef}>
          <input
            ref={inputRef}
            type="text"
            disabled={disabled}
            value={query}
            onChange={handleChange}
            onFocus={handleFocus}
            onKeyDown={handleKeyDown}
            placeholder="Search players"
            aria-label="Search players"
            className="w-full text-sm border border-[var(--color-border)] bg-[var(--color-surface)] rounded px-3 py-1.5 pr-12 placeholder:text-[var(--color-text-muted)] disabled:opacity-60"
          />
          {!disabled && (
            <span
              aria-hidden="true"
              title="Focus search (⌘K / Ctrl+K)"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] leading-none px-1.5 py-1 rounded-[4px] border border-[var(--color-border)] text-[var(--color-text-faint)] pointer-events-none"
            >
              ⌘K
            </span>
          )}

          {showDropdown && (
            <div
              data-testid="search-dropdown"
              className="absolute left-0 top-[calc(100%+6px)] w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-md shadow-lg z-10 py-1 max-h-80 overflow-y-auto"
            >
              {results.map(p => (
                <SearchResultRow key={p.player_id} player={p} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm shrink-0">
          {currentWeek != null && (
            <span className="hidden md:flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-positive-solid)]" aria-hidden="true" />
              Data current · Week {currentWeek}
            </span>
          )}
          <button
            onClick={onToggleTheme}
            className="text-[var(--color-text-faint)] hover:text-[var(--color-text-semi-muted)] text-xs flex items-center gap-1"
            title="Toggle light/dark theme"
          >
            <span aria-hidden="true">{isDark ? '☀' : '☾'}</span>
            <span>{isDark ? 'Light' : 'Dark'}</span>
          </button>
          {user && (
            <>
              {user.avatar && (
                <img src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} alt=""
                  className="w-7 h-7 rounded-full object-cover" />
              )}
              <span className="font-medium text-[var(--color-text-secondary)]">{user.display_name || user.username}</span>
              <button onClick={onSwitch}
                className="text-[var(--color-text-faint)] hover:text-[var(--color-text-semi-muted)] text-xs underline underline-offset-2">
                Switch
              </button>
            </>
          )}
          {/* League affordance for mobile — hidden on desktop where NavRail shows it */}
          {showLeagueLink && (
            <NavLink
              to="/league"
              className={({ isActive }) =>
                `md:hidden text-xs px-2 py-1 rounded transition-colors ${
                  isActive ? 'bg-[var(--color-accent-subtle-bg)] text-[var(--color-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
                }`
              }
            >
              League
            </NavLink>
          )}
        </div>
      </div>
    </header>
  )
}
