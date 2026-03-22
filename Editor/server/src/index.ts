import "dotenv/config"
import crypto from "node:crypto"
import path from "node:path"
import express from "express"
import cors from "cors"
import { logger } from "./logger"
import db from "./db"
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

// ── Tier config ────────────────────────────────────────────────────────────────
// Monthly render limits per tier. Pro uses 9999 as a stand-in for "unlimited"
// so it serialises cleanly to JSON; the frontend maps this back to Infinity.
const TIER_LIMITS: Record<string, number> = { free: 2, club: 20, pro: 9999 }

// ── Auth helpers ─────────────────────────────────────────────────────────────

/** Hash a password with scrypt (Node built-in, memory-hard). Returns "salt:hash". */
function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex")
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err)
      else resolve(`${salt}:${key.toString("hex")}`)
    })
  })
}

/** Verify a password against a stored "salt:hash" string. */
function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hash] = stored.split(":")
  if (!salt || !hash) return Promise.resolve(false)
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) reject(err)
      else {
        try {
          resolve(crypto.timingSafeEqual(Buffer.from(hash, "hex"), key))
        } catch {
          resolve(false)
        }
      }
    })
  })
}

/** Check whether any users exist in the DB (used for dynamic auth gate). */
function dbHasUsers(): boolean {
  try {
    return !!db.prepare("SELECT 1 FROM users LIMIT 1").get()
  } catch {
    return false
  }
}

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

// ── User / quota helpers ──────────────────────────────────────────────────────

type UserRow = {
  id: number
  email: string
  tier: string
  renders_this_month: number
  renders_period_start: string
}

function getUserByEmail(email: string): UserRow | undefined {
  return db
    .prepare("SELECT id, email, tier, renders_this_month, renders_period_start FROM users WHERE email = ?")
    .get(email) as UserRow | undefined
}

/** If the billing month has rolled over, reset renders_this_month to 0. */
function checkAndResetMonthlyCounter(user: UserRow): void {
  const currentPeriod = new Date().toISOString().slice(0, 7) + "-01" // YYYY-MM-01
  if (user.renders_period_start !== currentPeriod) {
    db.prepare("UPDATE users SET renders_this_month = 0, renders_period_start = ? WHERE id = ?")
      .run(currentPeriod, user.id)
  }
}

function incrementRendersThisMonth(email: string): void {
  db.prepare("UPDATE users SET renders_this_month = renders_this_month + 1 WHERE email = ?").run(email)
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

// ── POST /api/auth/register ───────────────────────────────────────────────────
// Public — must be registered BEFORE the auth guard middleware.
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    res.status(400).json({ error: "email and password are required" } as ErrorResponse)
    return
  }
  if (password.length < 8) {
    res.status(400).json({ error: "Password must be at least 8 characters" } as ErrorResponse)
    return
  }
  const normalEmail = email.trim().toLowerCase()
  const existing = db.prepare("SELECT 1 FROM users WHERE email = ?").get(normalEmail)
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" } as ErrorResponse)
    return
  }
  try {
    const hash = await hashPassword(password)
    db.prepare("INSERT INTO users (email, password_hash) VALUES (?, ?)").run(normalEmail, hash)
    const token = signJwt({ email: normalEmail, tier: "free", renders_used: 0, render_limit: TIER_LIMITS.free })
    logger.info({ email: normalEmail }, "new user registered")
    res.status(201).json({ token } as LoginResponse)
  } catch (err) {
    logger.error({ err }, "registration failed")
    res.status(500).json({ error: "Registration failed. Please try again." } as ErrorResponse)
  }
})

// ── POST /api/auth/login ──────────────────────────────────────────────────────
// Public — must be registered BEFORE the auth guard middleware.
app.post("/api/auth/login", async (req, res) => {
  const { email, password } = (req.body ?? {}) as { email?: unknown; password?: unknown }
  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    res.status(400).json({ error: "email and password are required" } as ErrorResponse)
    return
  }
  const normalEmail = email.trim().toLowerCase()

  // 1. Check env-var users (plain-text password, backward compat)
  const envUsers = parseUsers()
  const envUser = envUsers.find(u => u.email === normalEmail && u.password === password)
  if (envUser) {
    // Env-var users bypass quota — give them the club limit so the UI renders sensibly.
    const token = signJwt({ email: envUser.email, tier: "club", renders_used: 0, render_limit: TIER_LIMITS.club })
    logger.info({ email: envUser.email }, "user logged in (env)")
    res.json({ token } as LoginResponse)
    return
  }

  // 2. Check DB users (hashed password)
  const dbUser = db.prepare("SELECT password_hash, tier, renders_this_month, renders_period_start FROM users WHERE email = ?").get(normalEmail) as
    | { password_hash: string; tier: string; renders_this_month: number; renders_period_start: string }
    | undefined
  if (dbUser) {
    const valid = await verifyPassword(password, dbUser.password_hash)
    if (valid) {
      // Reset monthly counter if the billing period rolled over since last login.
      const currentPeriod = new Date().toISOString().slice(0, 7) + "-01"
      let rendersUsed = dbUser.renders_this_month
      if (dbUser.renders_period_start !== currentPeriod) {
        db.prepare("UPDATE users SET renders_this_month = 0, renders_period_start = ? WHERE email = ?")
          .run(currentPeriod, normalEmail)
        rendersUsed = 0
      }
      const tier = dbUser.tier ?? "free"
      const token = signJwt({ email: normalEmail, tier, renders_used: rendersUsed, render_limit: TIER_LIMITS[tier] ?? TIER_LIMITS.free })
      logger.info({ email: normalEmail }, "user logged in (db)")
      res.json({ token } as LoginResponse)
      return
    }
    logger.warn({ email: normalEmail }, "failed login attempt")
    res.status(401).json({ error: "Invalid email or password" } as ErrorResponse)
    return
  }

  // 3. No matching user found anywhere
  if (envUsers.length === 0 && !dbHasUsers()) {
    res.status(503).json({ error: "No accounts exist yet. Please register first." } as ErrorResponse)
    return
  }
  logger.warn({ email: normalEmail }, "failed login attempt")
  res.status(401).json({ error: "Invalid email or password" } as ErrorResponse)
})

// ── Auth guard (protects all /api/* routes except /api/auth/*) ────────────────
// Always installed; passes through when no auth is configured (no env users,
// no bypass token, no DB users). Becomes active as soon as any auth source exists.
app.use("/api", (req, res, next) => {
  // Always let CORS preflight through.
  if (req.method === "OPTIONS") { next(); return }
  // /api/auth/* is public (login/register endpoints handled above).
  if (req.path.startsWith("/auth/")) { next(); return }

  // If no auth sources exist at all, allow the request through.
  if (!BETA_TOKEN && !USERS_RAW && !dbHasUsers()) { next(); return }

  // 1. Accept JWT issued by /api/auth/login (Authorization: Bearer <token>)
  const authHeader = req.headers["authorization"]
  if (authHeader?.startsWith("Bearer ")) {
    const payload = verifyJwt(authHeader.slice(7))
    if (payload) { res.locals.jwtPayload = payload; next(); return }
  }

  // 2. Accept bypass token (X-Beta-Token header — set by ?bypass= URL param on frontend)
  if (BETA_TOKEN && req.headers["x-beta-token"] === BETA_TOKEN) {
    res.locals.isBypass = true; next(); return
  }

  logger.warn({ url: req.url }, "rejected request: missing or invalid auth")
  res.status(401).json({ error: "Unauthorized" } as ErrorResponse)
})
logger.info({ hasEnvUsers: Boolean(USERS_RAW), hasBypass: Boolean(BETA_TOKEN) }, "auth guard installed")

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
// Returns up-to-date tier and render-usage counts for the authenticated user.
app.get("/api/auth/me", (req, res) => {
  const payload = res.locals.jwtPayload as Record<string, unknown> | undefined
  const email = typeof payload?.email === "string" ? payload.email.toLowerCase() : null

  if (!email) {
    // Bypass-token sessions have no email — return sensible defaults.
    res.json({ tier: "club", renders_used: 0, render_limit: TIER_LIMITS.club })
    return
  }

  const user = getUserByEmail(email)
  if (!user) {
    // Env-var user not in DB — no quota tracking.
    res.json({ email, tier: "club", renders_used: 0, render_limit: TIER_LIMITS.club })
    return
  }

  checkAndResetMonthlyCounter(user)
  const fresh = getUserByEmail(email)!
  const limit = TIER_LIMITS[fresh.tier] ?? TIER_LIMITS.free
  res.json({ email: fresh.email, tier: fresh.tier, renders_used: fresh.renders_this_month, render_limit: limit })
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

  // ── Per-user render quota ────────────────────────────────────────────────
  const jwtPayload = res.locals.jwtPayload as Record<string, unknown> | undefined
  const userEmail = typeof jwtPayload?.email === "string" ? jwtPayload.email.toLowerCase() : null
  if (userEmail) {
    const user = getUserByEmail(userEmail)
    if (user) {
      checkAndResetMonthlyCounter(user)
      const freshUser = getUserByEmail(userEmail)!
      const limit = TIER_LIMITS[freshUser.tier] ?? TIER_LIMITS.free
      if (freshUser.renders_this_month >= limit) {
        logger.warn({ email: userEmail, tier: freshUser.tier, renders_this_month: freshUser.renders_this_month, limit }, "render quota exceeded")
        res.status(402).json({ error: `You've used all ${limit} renders on the ${freshUser.tier} plan this month. Upgrade to continue.` } as ErrorResponse)
        return
      }
    }
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
  if (userEmail) incrementRendersThisMonth(userEmail)

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

// ── GET /api/music/search ─────────────────────────────────────────────────────
// Proxy to Jamendo so the client ID is kept server-side (Railway env var).
// Query params: q (search text), limit (max 50, default 20)
app.get("/api/music/search", async (req, res) => {
  const clientId = process.env.JAMENDO_CLIENT_ID
  if (!clientId) {
    res.status(503).json({ error: "JAMENDO_CLIENT_ID is not configured on the server" } as ErrorResponse)
    return
  }

  const q = typeof req.query.q === "string" ? req.query.q.trim() : ""
  const limit = Math.min(Number(req.query.limit ?? 20), 50)

  const params = new URLSearchParams({
    client_id: clientId,
    format: "json",
    limit: String(Number.isFinite(limit) && limit > 0 ? limit : 20),
    audioformat: "mp32",
    order: "popularity_total",
  })
  if (q) params.set("search", q)
  else params.set("tags", "energetic")

  try {
    const upstream = await fetch(`https://api.jamendo.com/v3.0/tracks/?${params}`)
    if (!upstream.ok) throw new Error(`Jamendo returned ${upstream.status}`)
    const data = await upstream.json()
    res.json(data)
  } catch (err) {
    logger.error({ err }, "Jamendo proxy request failed")
    res.status(502).json({ error: "Music search failed" } as ErrorResponse)
  }
})

// ── Start ──────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT, rendersDir }, "render server listening")
})
