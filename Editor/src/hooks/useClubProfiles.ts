import { useState, useCallback } from "react"
import type { ClubProfile } from "../types"

const PROFILES_KEY = "editor-club-profiles"

function loadProfiles(): ClubProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistProfiles(profiles: ClubProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
}

export function useClubProfiles() {
  const [profiles, setProfiles] = useState<ClubProfile[]>(loadProfiles)

  const addProfile = useCallback((profile: Omit<ClubProfile, "id" | "savedAt">): ClubProfile => {
    const newProfile: ClubProfile = {
      ...profile,
      id: crypto.randomUUID(),
      savedAt: Date.now(),
    }
    setProfiles((prev) => {
      const next = [...prev, newProfile]
      persistProfiles(next)
      return next
    })
    return newProfile
  }, [])

  const deleteProfile = useCallback((id: string) => {
    setProfiles((prev) => {
      const next = prev.filter((p) => p.id !== id)
      persistProfiles(next)
      return next
    })
  }, [])

  return { profiles, addProfile, deleteProfile }
}
