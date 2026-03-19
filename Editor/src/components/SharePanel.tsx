import { useState } from "react"

type Platform = {
  id: string
  label: string
  charLimit: number | null
  /** Has a web intent URL fallback for desktop */
  hasWebIntent: boolean
  color: string
  icon: React.ReactNode
}

const PLATFORMS: Platform[] = [
  {
    id: "x",
    label: "X",
    charLimit: 280,
    hasWebIntent: true,
    color: "#000",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
      </svg>
    ),
  },
  {
    id: "facebook",
    label: "Facebook",
    charLimit: null,
    hasWebIntent: true,
    color: "#1877F2",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  {
    id: "instagram",
    label: "Instagram",
    charLimit: 2200,
    hasWebIntent: false,
    color: "#E1306C",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
      </svg>
    ),
  },
  {
    id: "tiktok",
    label: "TikTok",
    charLimit: 2200,
    hasWebIntent: false,
    color: "#010101",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M19.59 6.69a4.83 4.83 0 01-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 01-2.88 2.5 2.89 2.89 0 01-2.89-2.89 2.89 2.89 0 012.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 00-.79-.05 6.34 6.34 0 00-6.34 6.34 6.34 6.34 0 006.34 6.34 6.34 6.34 0 006.33-6.34V8.69a8.14 8.14 0 004.77 1.52V6.76a4.85 4.85 0 01-1-.07z" />
      </svg>
    ),
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    charLimit: 3000,
    hasWebIntent: true,
    color: "#0A66C2",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  },
  {
    id: "whatsapp",
    label: "WhatsApp",
    charLimit: null,
    hasWebIntent: true,
    color: "#25D366",
    icon: (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
]

/** Returns a web-intent URL for text-capable platforms, empty string otherwise. */
function getWebIntentUrl(platformId: string, caption: string, videoUrl: string): string {
  const text = encodeURIComponent(caption)
  const url = encodeURIComponent(videoUrl)
  switch (platformId) {
    case "x":
      return `https://twitter.com/intent/tweet?text=${text}`
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`
    case "linkedin":
      return `https://www.linkedin.com/shareArticle?mini=true&url=${url}&summary=${text}`
    case "whatsapp":
      return `https://api.whatsapp.com/send?text=${text}`
    default:
      return ""
  }
}

/** Fetch the video as a blob and trigger a browser download. */
async function fetchAndDownload(downloadUrl: string, fileName: string): Promise<void> {
  const res = await fetch(downloadUrl)
  const blob = await res.blob()
  triggerBlobDownload(blob, fileName)
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = objectUrl
  a.download = `${fileName}.mp4`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Delay revoke so the browser has time to start the download
  setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000)
}

type Props = {
  downloadUrl: string
  fileName: string
  defaultCaption?: string
}

export function SharePanel({ downloadUrl, fileName, defaultCaption = "" }: Props) {
  const [open, setOpen] = useState(false)
  const [selectedId, setSelectedId] = useState("x")
  const [caption, setCaption] = useState(defaultCaption)
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)

  const platform = PLATFORMS.find((p) => p.id === selectedId)!
  const charCount = caption.length
  const overLimit = platform.charLimit !== null && charCount > platform.charLimit

  async function handleDownload() {
    setDownloading(true)
    try {
      await fetchAndDownload(downloadUrl, fileName)
    } catch {
      // CORS or fetch failed — open in new tab as last resort
      window.open(downloadUrl, "_blank", "noopener,noreferrer")
    } finally {
      setDownloading(false)
    }
  }

  /**
   * Share the actual video file using the Web Share API (opens the native OS
   * share sheet on mobile, letting users pick Instagram, TikTok, etc.).
   *
   * Desktop fallback: for platforms that have a web intent URL we open a
   * compose window with the caption pre-filled and also download the video so
   * the user can attach it manually. For app-only platforms (Instagram, TikTok)
   * without native share support we just download the file.
   */
  async function handleShare() {
    setSharing(true)
    setShareError(null)
    try {
      const res = await fetch(downloadUrl)
      const blob = await res.blob()
      const file = new File([blob], `${fileName}.mp4`, { type: "video/mp4" })

      if (navigator.canShare?.({ files: [file] })) {
        // Native share sheet — attaches the real video file
        await navigator.share({ files: [file], title: fileName, text: caption })
      } else {
        // Desktop / browser without file-share support
        const intentUrl = getWebIntentUrl(platform.id, caption, downloadUrl)
        if (intentUrl) {
          // Open compose window with caption; download video so user can attach it
          window.open(intentUrl, "_blank", "noopener,noreferrer,width=600,height=500")
          triggerBlobDownload(blob, fileName)
          setShareError(
            `Your browser can't attach the video automatically. We've downloaded it — upload it inside ${platform.label} when the compose window opens.`
          )
        } else {
          // App-only platform on desktop — just download
          triggerBlobDownload(blob, fileName)
          setShareError(
            `${platform.label} doesn't support web sharing. The video has been downloaded — open ${platform.label} on your phone and create a new post.`
          )
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== "AbortError") {
        setShareError("Couldn't share the video. Try downloading it instead.")
      }
    } finally {
      setSharing(false)
    }
  }

  async function handleCopyCaption() {
    await navigator.clipboard.writeText(caption)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-2">
      {/* Download button */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400 disabled:cursor-wait disabled:opacity-60"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 4v11" />
        </svg>
        {downloading ? "Downloading…" : "Download MP4"}
      </button>

      {/* Share toggle */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setShareError(null) }}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-neutral-600 bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:bg-neutral-700"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
        </svg>
        {open ? "Hide Share Options" : "Share to Social Media"}
      </button>

      {/* Share panel */}
      {open && (
        <div className="rounded-xl border border-neutral-700 bg-neutral-900 p-4 space-y-4">
          {/* Platform picker */}
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setSelectedId(p.id); setShareError(null) }}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  selectedId === p.id
                    ? "border-transparent text-white"
                    : "border-neutral-700 bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200"
                }`}
                style={selectedId === p.id ? { backgroundColor: p.color, borderColor: p.color } : {}}
              >
                {p.icon}
                {p.label}
              </button>
            ))}
          </div>

          {/* Caption textarea */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-400">Caption</label>
              {platform.charLimit !== null && (
                <span className={`text-xs tabular-nums ${overLimit ? "text-red-400" : "text-neutral-500"}`}>
                  {charCount} / {platform.charLimit}
                </span>
              )}
            </div>
            <textarea
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={4}
              placeholder={`Write your ${platform.label} caption…`}
              className="w-full resize-none rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-white placeholder-neutral-500 focus:border-neutral-500 focus:outline-none"
            />
          </div>

          {/* Share error / info */}
          {shareError && (
            <div className="rounded-lg border border-amber-600/30 bg-amber-500/10 px-3 py-2.5 text-xs text-amber-300">
              {shareError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopyCaption}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-700"
            >
              {copied ? (
                <>
                  <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy Caption
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              disabled={overLimit || sharing}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: platform.color }}
            >
              {sharing ? (
                <>
                  <svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                  Preparing…
                </>
              ) : (
                <>
                  {platform.icon}
                  Share to {platform.label}
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
