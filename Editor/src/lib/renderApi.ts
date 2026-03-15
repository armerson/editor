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

const API_BASE = (import.meta.env.VITE_RENDER_API_BASE ?? "http://localhost:3001").replace(/\/$/, "")

/** Return headers including the beta token when one is stored. */
function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = localStorage.getItem("beta_token") ?? import.meta.env.VITE_BETA_TOKEN ?? ""
  return {
    ...(token ? { "X-Beta-Token": token } : {}),
    ...extra,
  }
}

export async function startRender(project: ProjectData): Promise<StartRenderResponse> {
  const res = await fetch(`${API_BASE}/api/render`, {
    method: "POST",
    headers: { ...apiHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(project),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Render start failed: ${res.status} ${res.statusText} ${text}`.trim())
  }

  return (await res.json()) as StartRenderResponse
}

export async function getRenderStatus(jobId: string): Promise<RenderStatusResponse> {
  const res = await fetch(`${API_BASE}/api/render/${jobId}`, { headers: apiHeaders() })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Render status failed: ${res.status} ${res.statusText} ${text}`.trim())
  }
  return (await res.json()) as RenderStatusResponse
}
