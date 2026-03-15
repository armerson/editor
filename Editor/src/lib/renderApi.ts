import type { ProjectData } from "../App"

export type RenderJobStatus = "queued" | "rendering" | "done" | "error"

export type StartRenderResponse = {
  jobId: string
}

export type RenderStatusResponse = {
  status: RenderJobStatus
  progress?: number
  downloadUrl?: string
  error?: string
}

const API_BASE = import.meta.env.VITE_RENDER_API_BASE ?? "http://localhost:3001"

export async function startRender(project: ProjectData): Promise<StartRenderResponse> {
  const res = await fetch(`${API_BASE}/api/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(project),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Render start failed: ${res.status} ${res.statusText} ${text}`.trim())
  }

  return (await res.json()) as StartRenderResponse
}

export async function getRenderStatus(jobId: string): Promise<RenderStatusResponse> {
  const res = await fetch(`${API_BASE}/api/render/${jobId}`)
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Render status failed: ${res.status} ${res.statusText} ${text}`.trim())
  }
  return (await res.json()) as RenderStatusResponse
}

