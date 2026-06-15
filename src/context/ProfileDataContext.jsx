import { createContext, useContext } from 'react'

// Provides data inputs the player profile needs (careerStats, playersMap, playerRows,
// positionPeakPPG, ktcMap, historicalShares, collegeStats, seasonProjections, enrichmentMap, advStats).
// Populated by PlayersTab once career + league data are loaded.
// Consuming this context means PlayerProfile / usePlayerProfile never
// need to receive these values as props — they just call useContext.

export const ProfileDataContext = createContext(null)
export const useProfileData = () => useContext(ProfileDataContext)
