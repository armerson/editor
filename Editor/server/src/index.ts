import "dotenv/config"
import path from "node:path"
import express from "express"
import cors from "cors"
import { ProjectSchema } from "./projectSchema"
import { validateProjectForRender } from "./validateProject"
import { createJob, getJob, updateJob } from "./renderJobStore"
import { renderProjectToMp4 } from "./remotionRenderer"
import { uploadRenderedMp4 } from "./storageUploader"

const app = express()
app.use(cors())
app.use(express.json({ limit: "25mb" }))

if (!process.env.REMOTION_ROOT) {
  console.error(
    "[api] FATAL: REMOTION_ROOT env var is not set.\n" +
    "       Set it to the absolute path of the Renderer folder, e.g.:\n" +
    "       REMOTION_ROOT=/path/to/highlight-reel-system/Renderer"
  )
  process.exit(1)
}

const PORT = Number(process.env.PORT ?? 3001)
const rendersDir = process.env.RENDERS_DIR
  ? path.resolve(process.env.RENDERS_DIR)
  : path.resolve(process.cwd(), "renders")

app.get("/healthz", (_req, res) => {
  res.json({ ok: true })
})

// API contract:
// POST /api/render
//   body: ProjectData JSON (same shape as editor export/render)
//   200: { jobId }
// GET /api/render/:jobId
//   200: { status, progress?, downloadUrl?, error? }

app.post("/api/render", async (req, res) => {
  console.log("[api] POST /api/render")

  const parsed = ProjectSchema.safeParse(req.body)
  if (!parsed.success) {
    console.warn("[api] invalid project payload", parsed.error.flatten())
    res.status(400).json({ error: "Invalid project JSON" })
    return
  }

  const project = parsed.data
  const errors = validateProjectForRender(project)
  if (errors.length > 0) {
    console.warn("[api] project failed validation:", errors)
    res.status(400).json({ error: "Project not renderable", errors })
    return
  }

  const job = createJob()
  res.json({ jobId: job.id })

  // Fire-and-forget async render.
  ;(async () => {
    try {
      updateJob(job.id, { status: "rendering", progress: 0 })

      const { localMp4Path } = await renderProjectToMp4({
        jobId: job.id,
        project,
        rendersDir,
        onProgress: (p01) => updateJob(job.id, { status: "rendering", progress: p01 * 100 }),
      })

      const shouldUpload = Boolean(process.env.RENDER_OUTPUT_BUCKET)
      if (shouldUpload) {
        console.log("[render] uploading mp4 to storage…")
        const upload = await uploadRenderedMp4(localMp4Path, job.id)
        updateJob(job.id, { status: "done", progress: 100, downloadUrl: upload.publicUrl })
        console.log("[render] uploaded:", { url: upload.publicUrl })
      } else {
        // Minimal dev fallback: serve from this server.
        const base = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`
        const downloadUrl = `${base.replace(/\/$/, "")}/renders/${job.id}.mp4`
        updateJob(job.id, { status: "done", progress: 100, downloadUrl })
        console.log("[render] stored locally:", { downloadUrl })
      }
    } catch (err) {
      console.error("[render] job failed:", err)
      updateJob(job.id, {
        status: "error",
        error: err instanceof Error ? err.message : "Render failed",
      })
    }
  })()
})

app.get("/api/render/:jobId", (req, res) => {
  const jobId = req.params.jobId
  const job = getJob(jobId)
  if (!job) {
    res.status(404).json({ status: "error", error: "Job not found" })
    return
  }
  res.json({
    status: job.status,
    progress: job.progress,
    downloadUrl: job.downloadUrl ?? undefined,
    error: job.error ?? undefined,
  })
})

app.use("/renders", express.static(rendersDir, { maxAge: "365d", immutable: true }))

app.listen(PORT, () => {
  console.log(`[api] render server listening on :${PORT}`)
  console.log("[api] rendersDir:", rendersDir)
})

