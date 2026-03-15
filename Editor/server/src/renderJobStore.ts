export type JobStatus = "queued" | "rendering" | "done" | "error"

export type RenderJob = {
  id: string
  status: JobStatus
  progress: number
  downloadUrl: string | null
  error: string | null
  createdAt: number
}

const jobs = new Map<string, RenderJob>()

/** Evict completed/failed jobs older than this from the in-memory store. */
const JOB_TTL_MS = 2 * 60 * 60 * 1000 // 2 hours

export function createJob(): RenderJob {
  const id = crypto.randomUUID()
  const job: RenderJob = {
    id,
    status: "queued",
    progress: 0,
    downloadUrl: null,
    error: null,
    createdAt: Date.now(),
  }
  jobs.set(id, job)

  // Evict stale jobs to prevent unbounded memory growth.
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [jid, j] of jobs) {
    if (j.createdAt < cutoff) jobs.delete(jid)
  }

  return job
}

export function getJob(id: string): RenderJob | undefined {
  return jobs.get(id)
}

export function updateJob(id: string, partial: Partial<RenderJob>) {
  const job = jobs.get(id)
  if (!job) return
  Object.assign(job, partial)
}
