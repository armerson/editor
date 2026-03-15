import "dotenv/config"
import path from "node:path"
import express from "express"
import cors from "cors"
import { logger } from "./logger"
import { ProjectSchema } from "./projectSchema"
import { validateProjectForRender } from "./validateProject"
import {
  createJob,
  getJob,
  updateJob,
  getActiveJobCount,
  recoverInterruptedJobs,
} from "./renderJobStore"
import { renderProjectToMp4 } from "./remotionRenderer"
import { uploadRenderedMp4 } from "./storageUploader"
import type {
  StartRenderResponse,
  RenderJobResponse,
  HealthResponse,
  ErrorResponse,
} from "./types"

// ── Startup guard ─────────────────────────────────────────────────────────────
if (!process.env.REMOTION_ROOT) {
  logger.fatal(
    "REMOTION_ROOT env var is not set. Set it to the absolute path of the Renderer folder, e.g.:\n" +
    "  REMOTION_ROOT=/path/to/highlight-reel-system/Renderer"
  )
  process.exit(1)
}

// ── Config ────────────────────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3001)
const rendersDir = process.env.RENDERS_DIR
  ? path.resolve(process.env.RENDERS_DIR)
  : path.resolve(process.cwd(), "renders")

// ── Recover interrupted jobs from a previous run ──────────────────────────────
recoverInterruptedJobs()

// ── Express app ───────────────────────────────────────────────────────────────
const app = express()
app.use(cors())
app.use(express.json({ limit: "25mb" }))

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "incoming request")
  next()
})

// ── Health endpoints ──────────────────────────────────────────────────────────
const SERVER_START = Date.now()

function healthBody(): HealthResponse {
  return {
    ok: true,
    version: process.env.npm_package_version ?? "0.1.0",
    uptime: Math.floor((Date.now() - SERVER_START) / 1000),
    db: "sqlite",
    activeJobs: getActiveJobCount(),
  }
}

app.get("/health", (_req, res) => {
  res.json(healthBody())
})

app.get("/healthz", (_req, res) => {
  res.json(healthBody())
})

// ── POST /api/render ──────────────────────────────────────────────────────────
app.post("/api/render", async (req, res) => {
  const parsed = ProjectSchema.safeParse(req.body)
  if (!parsed.success) {
    logger.warn({ issues: parsed.error.flatten() }, "invalid project payload")
    const body: ErrorResponse = { error: "Invalid project JSON" }
    res.status(400).json(body)
    return
  }

  const project = parsed.data
  const errors = validateProjectForRender(project)
  if (errors.length > 0) {
    logger.warn({ errors }, "project failed render validation")
    const body: ErrorResponse = { error: "Project not renderable", errors }
    res.status(400).json(body)
    return
  }

  const job = createJob()

  // HTTP 202 Accepted — job is queued, poll GET /api/render/:jobId for status.
  const body: StartRenderResponse = { jobId: job.jobId }
  res.status(202).json(body)

  // Fire-and-forget async render.
  ;(async () => {
    try {
      updateJob(job.jobId, { status: "rendering", progress: 0 })

      const { localMp4Path } = await renderProjectToMp4({
        jobId: job.jobId,
        project,
        rendersDir,
        onProgress: (p01) =>
          updateJob(job.jobId, { status: "rendering", progress: p01 * 100 }),
      })

      if (process.env.RENDER_OUTPUT_BUCKET) {
        logger.info({ jobId: job.jobId }, "uploading mp4 to storage")
        const upload = await uploadRenderedMp4(localMp4Path, job.jobId)
        updateJob(job.jobId, { status: "done", progress: 100, downloadUrl: upload.publicUrl })
        logger.info({ jobId: job.jobId, url: upload.publicUrl }, "upload complete")
      } else {
        const base = (process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`).replace(/\/$/, "")
        const downloadUrl = `${base}/renders/${job.jobId}.mp4`
        updateJob(job.jobId, { status: "done", progress: 100, downloadUrl })
        logger.info({ jobId: job.jobId, downloadUrl }, "render stored locally")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Render failed"
      logger.error({ jobId: job.jobId, err }, "render job failed")
      updateJob(job.jobId, { status: "error", error: message })
    }
  })()
})

// ── GET /api/render/:jobId ────────────────────────────────────────────────────
app.get("/api/render/:jobId", (req, res) => {
  const { jobId } = req.params
  const job: RenderJobResponse | undefined = getJob(jobId)

  if (!job) {
    const body: ErrorResponse = { error: "Job not found" }
    res.status(404).json(body)
    return
  }

  res.json(job)
})

// ── Static: serve local renders ───────────────────────────────────────────────
app.use("/renders", express.static(rendersDir, { maxAge: "365d", immutable: true }))

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT, rendersDir }, "render server listening")
})
