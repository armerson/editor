export type JobStatus = "queued" | "rendering" | "done" | "error"

export type RenderJob = {
  id: string
  status: JobStatus
  progress: number
  downloadUrl: string | null
  error: string | null
}

const jobs = new Map<string, RenderJob>()

export function createJob(): RenderJob {
  const id = crypto.randomUUID()
  const job: RenderJob = {
    id,
    status: "queued",
    progress: 0,
    downloadUrl: null,
    error: null,
  }
  jobs.set(id, job)
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

