import "dotenv/config"
import crypto from "node:crypto"
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
import { renderProjectToMp4, prewarmBundle } from "./remotionRenderer"
import { uploadRenderedMp4 } from "./storageUploader"
import type {
  StartRenderResponse,
  RenderJobResponse,
  HealthResponse,
  ErrorResponse,
  LoginResponse,
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
const BUILD_TIME = "2026-03-19T-v6"
const rendersDir = process.env.RENDERS_DIR
  ? path.resolve(process.env.RENDERS_DIR)
  : path.resolve(process.cwd(), "renders")

// Auth config
// BETA_TOKEN — acts as a bypass token (X-Beta-Token header or ?bypass= URL param)
const BETA_TOKEN = process.env.BETA_TOKEN || null
// JWT_SECRET — signs tokens issued by POST /api/auth/login
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-in-prod"
// USERS — comma-separated list of email:password pairs, e.g. "alice@test.com:pass1,bob@test.com:pass2"
const USERS_RAW = process.env.USERS || ""

// ── Auth helpers ─────────────────────────────────────────────────────────────

/** Parse USERS env var into a list of {email, password} objects. */
function parseUsers(): Array<{ email: string; password: string }> {
  if (!USERS_RAW) return []
  return USERS_RAW.split(",").flatMap(pair => {
    const colonIdx = pair.indexOf(":")
    if (colonIdx < 1) return []
    return [{ email: pair.slice(0, colonIdx).trim().toLowerCase(), password: pair.slice(colonIdx + 1).trim() }]
  })
}

/** Sign a simple HS256 JWT using Node's built-in crypto (no extra deps). */
function signJwt(payload: Record<string, unknown>, expirySeconds = 7 * 86_400): string {
  const header = Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")
  const body = Buffer.from(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expirySeconds,
  })).toString("base64url")
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url")
  return `${header}.${body}.${sig}`
}

/** Verify an HS256 JWT. Returns the decoded payload or null if invalid/expired. */
function verifyJwt(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split(".")
    if (!header || !body || !sig) return null
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url")
    // Constant-time comparison to prevent timing attacks
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>
    if (typeof payload.exp === "number" && Math.floor(Date.now() / 1000) > payload.exp) return null
    return payload
  } catch {
    return null
  }
}

// ── Recover interrupted jobs from a previous run ──────────────────────────────
try {
  recoverInterruptedJobs()
} catch (err) {
  logger.error({ err }, "Failed to recover interrupted jobs, continuing anyway")
}

// ── Pre-warm the Remotion bundle in the background ────────────────────────────
// Starts the webpack build immediately so the first render request doesn't
// pay the ~60-90 s cold-start cost. No-op in Lambda mode.
prewarmBundle()

// ── Express app ───────────────────────────────────────────────────────────────
const app = express()

// Allow the Vercel frontend origin (or * for local dev / unset).
const corsOrigin = process.env.CORS_ORIGIN ?? "*"
const corsOptions: cors.CorsOptions = {
  origin: corsOrigin,
  // Explicitly allow auth headers so the browser preflight passes.
  allowedHeaders: ["Content-Type", "X-Beta-Token", "Authorization"],
  methods: ["GET", "POST", "OPTIONS"],
}
// Must handle OPTIONS before any auth middleware — cors() alone doesn't
// guarantee a short-circuit when origin is a specific string.
app.options("*", cors(corsOptions))
app.use(cors(corsOptions))
app.use(express.json({ limit: "25mb" }))

// Request logging middleware
app.use((req, _res, next) => {
  logger.info({ method: req.method, url: req.url }, "incoming request")
  next()
})

// ── Health endpoints ──────────────────────────────────────────────────────────
const SERVER_START = Date.now()

function healthBody(): HealthResponse {
  let activeJobs: number
  try {
    activeJobs = getActiveJobCount()
  } catch (err) {
    logger.error({ err }, "Failed to get active job count")
    activeJobs = -1
  }
  const serveUrl = process.env.REMOTION_SERVE_URL ?? undefined
  const isLambda = !!(process.env.REMOTION_LAMBDA_FUNCTION_NAME && serveUrl)
  return {
    ok: true,
    version: process.env.npm_package_version ?? "0.1.0",
    buildTime: BUILD_TIME,
    uptime: Math.floor((Date.now() - SERVER_START) / 1000),
    db: "sqlite",
    activeJobs,
    renderMode: isLambda ? "lambda" : "local",
    serveUrl,
  }
}

app.get("/health", (_req, res) => {
  res.json(healthBody())
})

app.get("/healthz", (_req, res) => {
  res.json(healthBody())
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Public — must be registered BEFORE the auth guard middleware.
app.post("/api/auth/login", (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    res.status(400).json({ error: "email and password are required" } as ErrorResponse)
    return
  }
  const users = parseUsers()
  if (users.length === 0) {
    // No USERS configured — login endpoint unavailable; use bypass token.
    res.status(503).json({ error: "Login not configured. Use your bypass token." } as ErrorResponse)
    return
  }
  const user = users.find(u => u.email === email.trim().toLowerCase() && u.password === password)
  if (!user) {
    logger.warn({ email }, "failed login attempt")
    res.status(401).json({ error: "Invalid email or password" } as ErrorResponse)
    return
  }
  const token = signJwt({ email: user.email })
  logger.info({ email: user.email }, "user logged in")
  const body: LoginResponse = { token }
  res.json(body)
})

// ── Auth guard (protects all /api/* routes except /api/auth/*) ────────────────
const authEnabled = Boolean(BETA_TOKEN || USERS_RAW)
if (authEnabled) {
  app.use("/api", (req, res, next) => {
    // Always let CORS preflight through.
    if (req.method === "OPTIONS") { next(); return }
    // /api/auth/* is public (login endpoint handled above).
    if (req.path.startsWith("/auth/")) { next(); return }

    // 1. Accept JWT issued by /api/auth/login (Authorization: Bearer <token>)
    const authHeader = req.headers["authorization"]
    if (authHeader?.startsWith("Bearer ")) {
      const payload = verifyJwt(authHeader.slice(7))
      if (payload) { next(); return }
    }

    // 2. Accept bypass token (X-Beta-Token header — set by ?bypass= URL param on frontend)
    if (BETA_TOKEN && req.headers["x-beta-token"] === BETA_TOKEN) {
      next(); return
    }

    logger.warn({ url: req.url }, "rejected request: missing or invalid auth")
    res.status(401).json({ error: "Unauthorized" } as ErrorResponse)
  })
  logger.info({ hasUsers: Boolean(USERS_RAW), hasBypass: Boolean(BETA_TOKEN) }, "auth guard enabled")
}

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

  // ── Concurrent render guard ──────────────────────────────────────────────
  // Railway's 512 MB starter plan cannot sustain two simultaneous renders.
  // Each render uses ~400-500 MB (Node.js + Chrome + FFmpeg compositor);
  // a second parallel render would immediately OOM-kill the container.
  // Reject with 429 if a render is already in progress — the client must
  // poll the existing job and retry after it finishes.
  const active = getActiveJobCount()
  if (active >= 1) {
    logger.warn({ activeJobs: active }, "render rejected: another render is already in progress")
    const body: ErrorResponse = { error: "A render is already in progress. Please wait for it to finish, then try again." }
    res.status(429).json(body)
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

      const result = await renderProjectToMp4({
        jobId: job.jobId,
        project,
        rendersDir,
        onProgress: (p01) =>
          updateJob(job.jobId, { status: "rendering", progress: p01 * 100 }),
      })

      if (result.downloadUrl) {
        // Lambda path: rendered MP4 is already on S3 with a public URL — no upload needed.
        updateJob(job.jobId, { status: "done", progress: 100, downloadUrl: result.downloadUrl })
        logger.info({ jobId: job.jobId, downloadUrl: result.downloadUrl }, "Lambda render stored on S3")
      } else if (process.env.RENDER_OUTPUT_BUCKET) {
        // Local path + Firebase upload.
        logger.info({ jobId: job.jobId }, "uploading mp4 to storage")
        const upload = await uploadRenderedMp4(result.localMp4Path!, job.jobId)
        updateJob(job.jobId, { status: "done", progress: 100, downloadUrl: upload.publicUrl })
        logger.info({ jobId: job.jobId, url: upload.publicUrl }, "upload complete")
      } else {
        // Local path + serve from this server.
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
