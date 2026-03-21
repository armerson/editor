import { useState, useRef } from "react"
import type { ClubProfile } from "../types"

interface ClubProfilePanelProps {
  profiles: ClubProfile[]
  currentTeamName: string
  onSave: (name: string) => void
  onApply: (profile: ClubProfile) => void
  onDelete: (id: string) => void
}

export function ClubProfilePanel({
  profiles,
  currentTeamName,
  onSave,
  onApply,
  onDelete,
}: ClubProfilePanelProps) {
  const [saving, setSaving] = useState(false)
  const [nameValue, setNameValue] = useState("")
  const inputRef = useRef<HTMLInputElement | null>(null)

  const startSaving = () => {
    setNameValue(currentTeamName || "My Club")
    setSaving(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const confirmSave = () => {
    const name = nameValue.trim() || currentTeamName || "My Club"
    onSave(name)
    setSaving(false)
    setNameValue("")
  }

  const cancelSave = () => {
    setSaving(false)
    setNameValue("")
  }

  return (
    <div className="mb-4 rounded-xl border border-neutral-800 bg-neutral-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-neutral-200">Club Profile</h2>
        {!saving && (
          <button
            type="button"
            onClick={startSaving}
            className="rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[10px] text-neutral-300 hover:bg-neutral-700 hover:text-white"
          >
            Save current
          </button>
        )}
      </div>

      {saving && (
        <div className="mb-3 flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmSave()
              if (e.key === "Escape") cancelSave()
            }}
            placeholder="Profile name"
            className="flex-1 rounded-lg border border-yellow-500/50 bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-neutral-600 focus:border-yellow-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={confirmSave}
            className="rounded-lg bg-yellow-500 px-2.5 py-1.5 text-[10px] font-semibold text-black hover:bg-yellow-400"
          >
            Save
          </button>
          <button
            type="button"
            onClick={cancelSave}
            className="rounded-lg border border-neutral-700 px-2.5 py-1.5 text-[10px] text-neutral-400 hover:text-white"
          >
            Cancel
          </button>
        </div>
      )}

      {profiles.length === 0 ? (
        <p className="text-[10px] text-neutral-500">
          No saved profiles yet. Save your club's badge, team name, and sponsor logos to reuse them next time.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {profiles.map((profile) => (
            <div
              key={profile.id}
              className="group relative flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 p-2 hover:border-neutral-600"
            >
              {/* Badge or placeholder */}
              <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border border-neutral-600 bg-neutral-700">
                {profile.homeBadgeUrl ? (
                  <img src={profile.homeBadgeUrl} alt={profile.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-bold text-neutral-400">
                    {profile.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* Name + apply */}
              <button
                type="button"
                onClick={() => onApply(profile)}
                className="min-w-0 flex-1 text-left"
                title={`Apply "${profile.name}"`}
              >
                <p className="truncate text-[11px] font-medium text-neutral-200">{profile.name}</p>
                {profile.sponsorLogoUrls.length > 0 && (
                  <p className="text-[9px] text-neutral-500">
                    {profile.sponsorLogoUrls.length} sponsor{profile.sponsorLogoUrls.length !== 1 ? "s" : ""}
                  </p>
                )}
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onDelete(profile.id) }}
                className="shrink-0 text-[10px] text-neutral-600 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                title="Delete profile"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
