import { createContext, useContext } from 'react'

// Provides data inputs the player profile needs (careerStats, playersMap, playerRows,
// positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections, enrichmentMap, advStats,
// teamContextByYear, gameLogsByYear, nflScheduleByYear). The three …ByYear keys (dp-v2 Slice 2) are
// view-only, dataSeason-keyed loader results with no rendering consumer yet — added here so a future
// consumer slice touches no App.jsx state.
// One provider site, in App.jsx, wrapping the router — feeds dp/PlayerDetailTabs.jsx (and, through
// it, dp/PlayerDetailModal.jsx), so the player-detail pop-up is mountable from any surface. The
// Explorer's two /players-scoped provider sites (PlayersTab.jsx, PlayersDataTable.jsx) were retired
// with that surface in 1b Slice viii.
// Consuming this context means PlayerProfile / usePlayerProfile never
// need to receive these values as props — they just call useContext.

export const ProfileDataContext = createContext(null)
export const useProfileData = () => useContext(ProfileDataContext)
