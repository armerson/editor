/**
 * Shared TypeScript types for all API request/response shapes.
 */

export type JobStatus = "queued" | "rendering" | "done" | "error"

/** POST /api/render → 202 */
export interface StartRenderResponse {
  jobId: string
}

/** GET /api/render/:jobId → 200 */
export interface RenderJobResponse {
  jobId: string
  status: JobStatus
  progress: number
  downloadUrl: string | null
  error: string | null
  createdAt: string   // ISO-8601
  updatedAt: string   // ISO-8601
}

/** GET /health → 200 */
export interface HealthResponse {
  ok: boolean
  version: string
  buildTime: string
  uptime: number       // seconds
  db: "sqlite"
  activeJobs: number
  /** Render mode and Lambda serve URL (if configured) — for deployment diagnostics */
  renderMode: "lambda" | "local"
  serveUrl?: string
}

/** 4xx / 5xx error body */
export interface ErrorResponse {
  error: string
  errors?: string[]
}

/** POST /api/auth/login → 200 */
export interface LoginResponse {
  token: string
}
