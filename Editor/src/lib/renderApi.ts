import type { ProjectData } from "../types"

export type RenderJobStatus = "queued" | "rendering" | "done" | "error"

export type StartRenderResponse = {
  jobId: string
}

export type RenderStatusResponse = {
  jobId?: string
  status: RenderJobStatus
  progress?: number
  downloadUrl?: string | null
  error?: string | null
  createdAt?: string
  updatedAt?: string
}

/** Normalise the backend URL — add https:// if no protocol is present, strip trailing slash. */
function normaliseBase(raw: string): string {
  const trimmed = raw.trim().replace(/\/$/, "")
  if (trimmed && !/^https?:\/\//i.test(trimmed)) {
    return `https://${trimmed}`
  }
  return trimmed
}
const API_BASE = normaliseBase(import.meta.env.VITE_RENDER_API_BASE ?? "http://localhost:3001")

/** Return auth headers — JWT for login users, X-Beta-Token for bypass users. */
function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const jwt = localStorage.getItem("auth_jwt")
  if (jwt) return { "Authorization": `Bearer ${jwt}`, ...extra }
  const bypass = localStorage.getItem("beta_token") ?? (import.meta.env.VITE_BETA_TOKEN as string | undefined) ?? ""
  return { ...(bypass ? { "X-Beta-Token": bypass } : {}), ...extra }
}

export async function startRender(project: ProjectData): Promise<StartRenderResponse> {
  const res = await fetch(`${API_BASE}/api/render`, {
    method: "POST",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(project),
  })

  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    let message: string
    try {
      const body = JSON.parse(raw) as { error?: string; errors?: string[] }
      if (body.errors?.length) {
        message = body.errors.join("\n")
      } else if (body.error) {
        message = body.error
      } else {
        message = `Render start failed (${res.status})`
      }
    } catch {
      message = raw.trim() || `Render start failed (${res.status})`
    }
    throw new Error(message)
  }

  return (await res.json()) as StartRenderResponse
}

export async function getRenderStatus(jobId: string): Promise<RenderStatusResponse> {
  const res = await fetch(`${API_BASE}/api/render/${jobId}`, { headers: apiHeaders() })
  if (!res.ok) {
    const raw = await res.text().catch(() => "")
    let message: string
    try {
      const body = JSON.parse(raw) as { error?: string }
      message = body.error || `Status check failed (${res.status})`
    } catch {
      message = raw.trim() || `Status check failed (${res.status})`
    }
    throw new Error(message)
  }
  return (await res.json()) as RenderStatusResponse
}

export type MusicTrack = {
  id: string
  name: string
  artist_name: string
  duration: number
  audio: string
  image: string
}

/**
 * Search the music library via the backend proxy.
 * Returns [] and throws if JAMENDO_CLIENT_ID is not configured on the server.
 */
export async function searchMusic(query: string, limit = 20): Promise<MusicTrack[]> {
  const params = new URLSearchParams({ limit: String(limit) })
  if (query.trim()) params.set("q", query.trim())
  const res = await fetch(`${API_BASE}/api/music/search?${params}`, { headers: apiHeaders() })
  if (res.status === 503) throw new Error("not_configured")
  if (!res.ok) throw new Error(`Music search failed: ${res.status}`)
  const data = await res.json() as { results?: MusicTrack[] }
  return data.results ?? []
}
