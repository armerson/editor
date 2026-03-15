import db from "./db"
import { logger } from "./logger"
import type { JobStatus, RenderJobResponse } from "./types"

// ─── Row shape (matches SQLite column names) ────────────────────────────────

type JobRow = {
  id: string
  status: JobStatus
  progress: number
  download_url: string | null
  error: string | null
  created_at: string
  updated_at: string
}

// ─── Prepared statements ─────────────────────────────────────────────────────

const stmtInsert = db.prepare<[string, string, string]>(`
  INSERT INTO render_jobs (id, status, created_at, updated_at)
  VALUES (?, 'queued', ?, ?)
`)

const stmtSelect = db.prepare<[string], JobRow>(`
  SELECT * FROM render_jobs WHERE id = ?
`)

const stmtUpdate = db.prepare<[string, number, string | null, string | null, string, string]>(`
  UPDATE render_jobs
  SET status = ?, progress = ?, download_url = ?, error = ?, updated_at = ?
  WHERE id = ?
`)

const stmtCountActive = db.prepare<[], { n: number }>(`
  SELECT COUNT(*) AS n FROM render_jobs WHERE status IN ('queued', 'rendering')
`)

const stmtRecoverInterrupted = db.prepare<[string]>(`
  UPDATE render_jobs
  SET status = 'error', error = 'Server restarted while job was in progress', updated_at = ?
  WHERE status IN ('queued', 'rendering')
`)

// ─── Public API ───────────────────────────────────────────────────────────────

export function createJob(): RenderJobResponse {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  stmtInsert.run(id, now, now)
  logger.info({ jobId: id }, "job created")
  return jobToResponse(stmtSelect.get(id)!)
}

export function getJob(id: string): RenderJobResponse | undefined {
  const row = stmtSelect.get(id)
  if (!row) return undefined
  return jobToResponse(row)
}

export function updateJob(
  id: string,
  partial: {
    status?: JobStatus
    progress?: number
    downloadUrl?: string | null
    error?: string | null
  }
): void {
  const row = stmtSelect.get(id)
  if (!row) {
    logger.warn({ jobId: id }, "updateJob: job not found")
    return
  }

  // Progress must never regress (guards against out-of-order callbacks).
  const newProgress = partial.progress !== undefined
    ? Math.max(row.progress, partial.progress)
    : row.progress

  const now = new Date().toISOString()

  stmtUpdate.run(
    partial.status ?? row.status,
    newProgress,
    partial.downloadUrl !== undefined ? partial.downloadUrl : row.download_url,
    partial.error !== undefined ? partial.error : row.error,
    now,
    id,
  )
}

/** Returns count of jobs currently queued or rendering. */
export function getActiveJobCount(): number {
  return stmtCountActive.get()!.n
}

/**
 * On startup, mark any jobs that were still running/queued as failed —
 * they were interrupted by the previous process exit.
 */
export function recoverInterruptedJobs(): number {
  const now = new Date().toISOString()
  const result = stmtRecoverInterrupted.run(now)
  const count = result.changes
  if (count > 0) {
    logger.warn({ count }, "recovered interrupted jobs from previous run")
  }
  return count
}

/** Converts a DB row to the canonical RenderJobResponse shape. */
export function jobToResponse(row: JobRow): RenderJobResponse {
  return {
    jobId: row.id,
    status: row.status,
    progress: row.progress,
    downloadUrl: row.download_url,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}
