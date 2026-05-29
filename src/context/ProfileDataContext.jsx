import { createContext, useContext } from 'react'

// Provides the four data inputs every player profile needs.
// Populated by App.jsx once careerStats + league data are loaded.
// Consuming this context means ProfilePanel / usePlayerProfile never
// need to receive these values as props — they just call useContext.

export const ProfileDataContext = createContext(null)
export const useProfileData = () => useContext(ProfileDataContext)
