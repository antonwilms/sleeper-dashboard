import { useState, useCallback } from 'react'
import { PlayersTab } from '../PlayersTab'
import { OutlookTab } from './OutlookTab'
import { NflStatsTab } from './NflStatsTab'
import { WeeklyPlaceholder } from './WeeklyPlaceholder'

const LS_VIEW = 'players-view'
const LS_DYNASTY_TAB = 'players-dynasty-tab'

const PRIMARY_TABS = [
  { key: 'dynasty', label: 'Dynasty' },
  { key: 'weekly',  label: 'Weekly'  },
]
const DYNASTY_TABS = [
  { key: 'value',    label: 'Value'     },
  { key: 'outlook',  label: 'Outlook'   },
  { key: 'nflStats', label: 'NFL stats' },
]

export function PlayersSurface(props) {
  const [primaryView, setPrimaryViewRaw] = useState(() => {
    const v = localStorage.getItem(LS_VIEW)
    return v === 'weekly' ? 'weekly' : 'dynasty'
  })
  const setPrimaryView = useCallback(v => {
    setPrimaryViewRaw(v)
    localStorage.setItem(LS_VIEW, v)
  }, [])

  const [dynastyTab, setDynastyTabRaw] = useState(() => {
    const v = localStorage.getItem(LS_DYNASTY_TAB)
    return ['value', 'outlook', 'nflStats'].includes(v) ? v : 'value'
  })
  const setDynastyTab = useCallback(v => {
    setDynastyTabRaw(v)
    localStorage.setItem(LS_DYNASTY_TAB, v)
  }, [])

  return (
    <div>
      {/* Primary tabs — underline-active (matches LeagueView sub-nav) */}
      <div className="flex gap-1 mb-4 border-b">
        {PRIMARY_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setPrimaryView(t.key)}
            className={`px-4 py-2 text-sm transition-colors ${
              primaryView === t.key
                ? 'border-b-2 border-[var(--color-accent)] text-[var(--color-accent)] font-medium'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {primaryView === 'dynasty' && (
        <>
          {/* Secondary tabs — pill style (matches Explorer position tabs) */}
          <div className="flex gap-1 mb-4">
            {DYNASTY_TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setDynastyTab(t.key)}
                className={`px-3 py-1 text-sm rounded transition-colors ${
                  dynastyTab === t.key
                    ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                    : 'bg-[var(--color-surface-3)] text-[var(--color-text-semi-muted)] hover:bg-[var(--color-surface-4)]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {dynastyTab === 'value'    && <PlayersTab {...props} />}
          {dynastyTab === 'outlook'  && <OutlookTab {...props} />}
          {dynastyTab === 'nflStats' && <NflStatsTab {...props} />}
        </>
      )}

      {primaryView === 'weekly' && <WeeklyPlaceholder />}
    </div>
  )
}
