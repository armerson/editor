import { useState } from "react"
import type { RenderState } from "../types"
import { SharePanel } from "./SharePanel"

type Props = {
  renderState: RenderState
  onReset: () => void
  fileName?: string
  defaultCaption?: string
}

const STATUS_LABEL: Record<string, string> = {
  submitting: "Submitting…",
  queued: "Queued",
  rendering: "Rendering",
  done: "Done",
  error: "Error",
}

export function RenderPanel({ renderState, onReset, fileName = "highlight", defaultCaption }: Props) {
  const { status, progress, downloadUrl, error } = renderState
  const [downloading, setDownloading] = useState(false)

  async function handleDownload() {
    if (!downloadUrl) return
    setDownloading(true)
    try {
      const res = await fetch(downloadUrl)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = objectUrl
      a.download = `${fileName}.mp4`
      a.click()
      URL.revokeObjectURL(objectUrl)
    } finally {
      setDownloading(false)
    }
  }

  if (status === "idle") return null

  const isActive = status === "submitting" || status === "queued" || status === "rendering"
  const displayPct = Math.round(progress)

  return (
    <div
      className={`rounded-xl border p-4 ${
        status === "error"
          ? "border-red-500/40 bg-red-500/10"
          : status === "done"
          ? "border-emerald-500/40 bg-emerald-500/10"
          : "border-neutral-700 bg-neutral-900"
      }`}
    >
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isActive && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500" />
            </span>
          )}
          {status === "done" && (
            <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          )}
          {status === "error" && (
            <span className="flex h-2.5 w-2.5 rounded-full bg-red-500" />
          )}
          <span className="text-sm font-semibold text-neutral-200">
            {STATUS_LABEL[status] ?? status}
          </span>
        </div>

        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-neutral-600 bg-neutral-800 px-3 py-1 text-xs hover:bg-neutral-700"
        >
          {status === "done" || status === "error" ? "Dismiss" : "Cancel"}
        </button>
      </div>

      {/* Progress bar */}
      {(isActive || status === "done") && (
        <div className="mb-3">
          <div className="relative h-6 w-full overflow-hidden rounded-lg bg-neutral-700">
            {/* Filled track */}
            <div
              className={`h-full rounded-lg transition-all duration-500 ${
                status === "done"
                  ? "bg-emerald-500"
                  : status === "rendering"
                  ? "bg-yellow-500"
                  : "bg-yellow-500/60"
              }`}
              style={{
                width: `${status === "done" ? 100 : status === "submitting" ? 4 : displayPct}%`,
                minWidth: isActive ? "1.5rem" : undefined,
              }}
            />
            {/* Animated stripe overlay for queued/submitting */}
            {(status === "submitting" || status === "queued") && (
              <div
                className="absolute inset-0 animate-pulse rounded-lg"
                style={{
                  background:
                    "repeating-linear-gradient(45deg, transparent, transparent 8px, rgba(255,255,255,0.06) 8px, rgba(255,255,255,0.06) 16px)",
                }}
              />
            )}
            {/* Percentage label */}
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold tabular-nums text-white drop-shadow">
              {status === "done"
                ? "✓ Complete"
                : status === "submitting"
                ? "Submitting…"
                : status === "queued"
                ? "Queued…"
                : `${displayPct}%`}
            </span>
          </div>
        </div>
      )}

      {/* Error message */}
      {status === "error" && error && (
        <p className="mb-3 text-sm text-red-300">{error}</p>
      )}

      {/* Done: inline video preview + download + share */}
      {status === "done" && downloadUrl && (
        <div className="space-y-3">
          <video
            src={downloadUrl}
            controls
            className="w-full rounded-lg border border-neutral-700 bg-black"
            style={{ maxHeight: 280 }}
          />
          <SharePanel
            downloadUrl={downloadUrl}
            defaultCaption={defaultCaption}
            onDownload={handleDownload}
            downloading={downloading}
          />
        </div>
      )}
    </div>
  )
}
