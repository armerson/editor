import { useEffect, useRef, useState } from "react"
import { searchMusic, type MusicTrack } from "../lib/renderApi"

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

// ── Component ─────────────────────────────────────────────────────────────────

type Props = {
  /** Called when the user picks a track. Provides name + direct MP3 URL. */
  onSelectTrack: (track: { name: string; url: string }) => void
}

export function MusicSearch({ onSelectTrack }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<MusicTrack[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Tear down audio when the panel closes
  useEffect(() => {
    if (!open) {
      audioRef.current?.pause()
      setPreviewId(null)
    } else {
      // Load popular/energetic tracks on first open
      if (results.length === 0 && !loading) doSearch("")
      setTimeout(() => inputRef.current?.focus(), 50)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function doSearch(q: string) {
    setLoading(true)
    setError(null)
    searchMusic(q)
      .then((tracks) => { setResults(tracks); setLoading(false) })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Search failed"
        setError(msg === "not_configured"
          ? "JAMENDO_CLIENT_ID is not set on the server. Add it to your Railway environment variables."
          : msg)
        setLoading(false)
      })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") doSearch(query)
  }

  function togglePreview(track: MusicTrack) {
    if (!audioRef.current) audioRef.current = new Audio()
    const a = audioRef.current

    if (previewId === track.id) {
      a.pause()
      setPreviewId(null)
    } else {
      a.src = track.audio
      a.play().catch(() => {})
      setPreviewId(track.id)
      a.onended = () => setPreviewId(null)
    }
  }

  function handleSelect(track: MusicTrack) {
    audioRef.current?.pause()
    setPreviewId(null)
    setSelectedId(track.id)
    onSelectTrack({ name: `${track.name} – ${track.artist_name}`, url: track.audio })
    setOpen(false)
  }

  return (
    <div>
      {/* Toggle button */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs hover:bg-neutral-700"
      >
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <path d="M9 3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a2 2 0 1 0 2 0V6h4v4a2 2 0 1 0 2 0V3Z" />
        </svg>
        Browse free music
        <svg
          className={`h-2.5 w-2.5 transition-transform ${open ? "rotate-180" : ""}`}
          viewBox="0 0 16 16" fill="currentColor" aria-hidden
        >
          <path d="M3 5l5 5 5-5H3Z" />
        </svg>
      </button>

      {/* Panel */}
      {open && (
        <div className="mt-2 rounded-xl border border-neutral-700 bg-neutral-900 p-3">
          {/* Search bar */}
          <div className="mb-3 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search music… (press Enter)"
              className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1.5 text-xs text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => doSearch(query)}
              disabled={loading}
              className="rounded-lg bg-neutral-700 px-3 py-1.5 text-xs font-medium hover:bg-neutral-600 disabled:opacity-50"
            >
              {loading ? "…" : "Search"}
            </button>
          </div>

          {/* Error */}
          {error && <p className="mb-2 text-xs text-red-400">{error}</p>}

          {/* Results */}
          {results.length === 0 && !loading && !error && (
            <p className="text-xs text-neutral-500">No results. Try a genre like "rock", "electronic", or "upbeat".</p>
          )}

          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {results.map((track) => {
              const isPreviewing = previewId === track.id
              const isSelected = selectedId === track.id
              return (
                <li
                  key={track.id}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                    isSelected
                      ? "border-emerald-500/40 bg-emerald-500/10"
                      : "border-neutral-700 bg-neutral-800 hover:border-neutral-600"
                  }`}
                >
                  {/* Artwork */}
                  {track.image ? (
                    <img src={track.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-neutral-700">
                      <svg className="h-4 w-4 text-neutral-500" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                        <path d="M9 3a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v7a2 2 0 1 0 2 0V6h4v4a2 2 0 1 0 2 0V3Z" />
                      </svg>
                    </div>
                  )}

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium text-neutral-200">{track.name}</p>
                    <p className="truncate text-[10px] text-neutral-400">
                      {track.artist_name} · {formatDuration(track.duration)}
                    </p>
                  </div>

                  {/* Preview button */}
                  <button
                    type="button"
                    onClick={() => togglePreview(track)}
                    title={isPreviewing ? "Stop preview" : "Preview"}
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      isPreviewing
                        ? "border-yellow-500 bg-yellow-500/20 text-yellow-400"
                        : "border-neutral-600 bg-neutral-700 text-neutral-300 hover:text-white"
                    }`}
                  >
                    {isPreviewing ? (
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                        <rect x="3" y="3" width="4" height="10" rx="1" />
                        <rect x="9" y="3" width="4" height="10" rx="1" />
                      </svg>
                    ) : (
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
                        <path d="M4 3l10 5-10 5V3Z" />
                      </svg>
                    )}
                  </button>

                  {/* Use button */}
                  <button
                    type="button"
                    onClick={() => handleSelect(track)}
                    className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold transition-colors ${
                      isSelected
                        ? "bg-emerald-500 text-black"
                        : "bg-yellow-500 text-black hover:bg-yellow-400"
                    }`}
                  >
                    {isSelected ? "✓ Using" : "Use"}
                  </button>
                </li>
              )
            })}
          </ul>

          {results.length > 0 && (
            <p className="mt-2 text-[10px] text-neutral-600">
              Music from Jamendo · free for personal use · CC licensed
            </p>
          )}
        </div>
      )}
    </div>
  )
}
