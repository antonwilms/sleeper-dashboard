import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { compareNullsLast } from '../../utils/sortUtils'
import { BrandMark } from './NavRail'

// Global player search (1b Slice vii §4) — activates the field Slice i left disabled. Chrome
// component: stays on the adaptive --color-* family (NOT --color-dp-*), because that's what
// TopBar itself uses throughout. Deliberately does NOT import dp/cells.jsx's PlayerCell — that
// component carries dp tokens; the result rows below are local markup in PlayerCell's spirit (no
// headshot or logo), not its implementation.

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
      className="flex items-center gap-3 px-3 py-2 rounded-md cursor-pointer hover:bg-[var(--color-surface-2)] focus:outline-none focus:bg-[var(--color-surface-2)]"
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
  user, selectedLeague, onSwitch,
  showLeagueLink, currentWeek, searchablePlayers, popupOpen, onOpenPlayerDetail,
}) {
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
    <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-canvas)]/90 backdrop-blur">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-7 h-[60px] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0 min-w-0">
          {/* The rail carries the brand mark on desktop; it moves here when the rail is absent. */}
          <span className={showLeagueLink ? 'md:hidden' : ''}><BrandMark size={22} /></span>
          {selectedLeague && (
            <span className="h-9 px-3 rounded-lg border border-[var(--color-surface-4)] bg-[var(--color-surface)] text-[13px] font-medium text-[var(--color-text)] flex items-center gap-2 min-w-0">
              <span aria-hidden="true" className="w-[18px] h-[18px] rounded-[5px] bg-[var(--color-surface-4)] text-[10px] font-semibold flex items-center justify-center shrink-0">
                {(selectedLeague.name ?? '?').trim().slice(0, 2).toUpperCase()}
              </span>
              <span className="truncate max-w-[220px]">{selectedLeague.name}</span>
              <span className="text-[var(--color-text-muted)] text-[10px]" aria-hidden="true">▾</span>
            </span>
          )}
        </div>

        <div className="flex-1 max-w-[520px] hidden sm:block relative" ref={containerRef}>
          <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none">
            <circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" />
          </svg>
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
            className="w-full h-9 text-[13px] border border-[var(--color-border)] bg-[var(--color-surface)] rounded-lg pl-9 pr-12 text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-surface-5)] disabled:opacity-60"
          />
          {!disabled && (
            <span
              aria-hidden="true"
              title="Focus search (⌘K / Ctrl+K)"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] leading-none px-1.5 py-1 rounded-[5px] border border-[var(--color-surface-4)] text-[var(--color-text-muted)] pointer-events-none"
            >
              ⌘K
            </span>
          )}

          {showDropdown && (
            <div
              data-testid="search-dropdown"
              className="absolute left-0 top-[calc(100%+6px)] w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_16px_40px_rgb(0_0_0/0.45)] z-10 p-1 max-h-80 overflow-y-auto"
            >
              {results.map(p => (
                <SearchResultRow key={p.player_id} player={p} onSelect={handleSelect} />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm shrink-0">
          {currentWeek != null && (
            <span className="hidden md:flex items-center gap-2 font-mono text-[11.5px] text-[var(--color-text-semi-muted)] border border-[var(--color-surface-4)] rounded-full px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] shadow-[0_0_0_3px_var(--color-accent-subtle-bg)]" aria-hidden="true" />
              Data current · Week {currentWeek}
            </span>
          )}
          {user && (
            <>
              {user.avatar && (
                <img src={`https://sleepercdn.com/avatars/thumbs/${user.avatar}`} alt=""
                  className="w-8 h-8 rounded-full object-cover ring-1 ring-[var(--color-surface-4)]" />
              )}
              {/* Hidden below `sm`: this cluster is `shrink-0`, so at phone width the username
                  pushed the whole PAGE wider than the viewport (87px over at 375px). The avatar
                  beside it already identifies the user and `Switch` is the action, so the name is
                  the one droppable item. Same `hidden`-until-breakpoint pattern as the week
                  indicator above; it stays in the DOM, so it remains findable and accessible. */}
              <span className="hidden sm:inline font-medium text-[var(--color-text-secondary)]">{user.display_name || user.username}</span>
              <button onClick={onSwitch}
                className="h-8 px-2.5 rounded-lg border border-[var(--color-surface-4)] text-[var(--color-text-semi-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-2)] text-xs">
                Switch
              </button>
            </>
          )}
          {/* League affordance for mobile — hidden on desktop where NavRail shows it */}
          {showLeagueLink && (
            <NavLink
              to="/league"
              className={({ isActive }) =>
                `md:hidden text-xs h-8 px-2.5 flex items-center rounded-lg transition-colors ${
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
