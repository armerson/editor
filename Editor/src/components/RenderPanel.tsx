import type { RenderState } from "../types"

type Props = {
  renderState: RenderState
  onReset: () => void
}

const STATUS_LABEL: Record<string, string> = {
  submitting: "Submitting…",
  queued: "Queued",
  rendering: "Rendering",
  done: "Done",
  error: "Error",
}

export function RenderPanel({ renderState, onReset }: Props) {
  const { status, progress, downloadUrl, error } = renderState
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
          {status === "rendering" && (
            <span className="tabular-nums text-sm text-neutral-400">{displayPct}%</span>
          )}
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
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-neutral-700">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              status === "done" ? "bg-emerald-500" : "bg-yellow-500"
            }`}
            style={{ width: `${status === "done" ? 100 : displayPct}%` }}
          />
        </div>
      )}

      {/* Error message */}
      {status === "error" && error && (
        <p className="mb-3 text-sm text-red-300">{error}</p>
      )}

      {/* Done: inline video preview + download */}
      {status === "done" && downloadUrl && (
        <div className="space-y-3">
          <video
            src={downloadUrl}
            controls
            className="w-full rounded-lg border border-neutral-700 bg-black"
            style={{ maxHeight: 280 }}
          />
          <a
            href={downloadUrl}
            download
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
            </svg>
            Download MP4
          </a>
        </div>
      )}
    </div>
  )
}
