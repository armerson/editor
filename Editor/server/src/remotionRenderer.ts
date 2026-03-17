import path from "node:path"
import fs from "node:fs/promises"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"
import type { Project } from "./projectSchema"
import { localRenderedPath } from "./storageUploader"
import { logger } from "./logger"

// ── Lambda imports (only used when REMOTION_LAMBDA_FUNCTION_NAME is set) ───────
// We import from @remotion/lambda/client to avoid bundling Lambda execution
// internals (native AWS runtime code) into the server process.
import type { AwsRegion } from "@remotion/lambda"
import { renderMediaOnLambda, getRenderProgress } from "@remotion/lambda/client"

// ─────────────────────────────────────────────────────────────────────────────
//  Shared configuration
// ─────────────────────────────────────────────────────────────────────────────

/** Default: 20 minutes. Override with RENDER_TIMEOUT_MS env var. */
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 20 * 60 * 1000)

/** Per-frame render timeout. Default 60 s. Override: REMOTION_FRAME_TIMEOUT_MS */
const REMOTION_FRAME_TIMEOUT_MS = Number(process.env.REMOTION_FRAME_TIMEOUT_MS ?? 60_000)

/** Only emit an onProgress log/callback every N percentage points to reduce noise. */
const PROGRESS_THROTTLE_PCT = 5

// ─────────────────────────────────────────────────────────────────────────────
//  Lambda configuration (all required when REMOTION_LAMBDA_FUNCTION_NAME is set)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Name of the deployed Remotion Lambda function.
 * Example: "remotion-render-4-0-435-mem2048mb-disk2048mb-120sec"
 *
 * When this env var is set (along with REMOTION_SERVE_URL), the server uses
 * AWS Lambda for rendering instead of running Remotion locally.
 * Deploy with: cd Renderer && npx remotion lambda functions deploy --memory=2048 --disk=2048 --timeout=120
 */
const LAMBDA_FUNCTION_NAME = process.env.REMOTION_LAMBDA_FUNCTION_NAME ?? null

/**
 * S3 URL of the deployed Remotion site (the bundled Renderer project).
 * Example: "https://remotionlambda-xxxx.s3.us-east-1.amazonaws.com/sites/highlight-reel/..."
 *
 * Deploy with: cd Renderer && npx remotion lambda sites create --site-name=highlight-reel
 */
const LAMBDA_SERVE_URL = process.env.REMOTION_SERVE_URL ?? null

/**
 * AWS region where the Lambda function and S3 bucket live.
 * Must match the region used in `npx remotion lambda functions deploy`.
 */
const LAMBDA_REGION = (process.env.AWS_REGION ?? "us-east-1") as AwsRegion

/**
 * Number of video frames rendered per Lambda invocation.
 * 20 frames (~0.67 s at 30 fps) balances parallelism against Lambda overhead.
 * Override: REMOTION_FRAMES_PER_LAMBDA=40
 */
const FRAMES_PER_LAMBDA = Number(process.env.REMOTION_FRAMES_PER_LAMBDA ?? 20)

/** Whether Lambda mode is fully configured and should be used. */
const USE_LAMBDA = !!(LAMBDA_FUNCTION_NAME && LAMBDA_SERVE_URL)

// ─────────────────────────────────────────────────────────────────────────────
//  Local-render configuration (used only when USE_LAMBDA is false)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Remotion compositor concurrency.
 * Default: 1 — forces sequential frame rendering to stay within Railway's
 * memory limits (a SIGKILL on the compositor means the container OOMed).
 * Increase on machines with ≥4 GB RAM: REMOTION_CONCURRENCY=4
 */
const REMOTION_CONCURRENCY = Number(process.env.REMOTION_CONCURRENCY ?? 1)

/**
 * Maximum RAM Remotion's OffthreadVideo off-thread server may use for its
 * decoded-frame cache. Keep this small (default 32 MB) to leave headroom for
 * the compositor and Chrome on memory-constrained hosts (Railway 512 MB).
 * Override: REMOTION_VIDEO_CACHE_MB=128
 */
const REMOTION_VIDEO_CACHE_BYTES =
  (Number(process.env.REMOTION_VIDEO_CACHE_MB ?? 32)) * 1024 * 1024

/**
 * Number of FFmpeg threads per clip. Single-threaded (default 1) dramatically
 * reduces compositor RSS (~80 MB vs ~300 MB). No penalty at concurrency=1.
 * Override: REMOTION_VIDEO_THREADS=4
 */
const REMOTION_VIDEO_THREADS = Number(process.env.REMOTION_VIDEO_THREADS ?? 1)

/** Cached bundle — rebuilt only when the process restarts. */
let cachedBundle: { serveUrl: string } | null = null

// ─────────────────────────────────────────────────────────────────────────────
//  Types
// ─────────────────────────────────────────────────────────────────────────────

type RenderParams = {
  jobId: string
  project: Project
  rendersDir: string
  onProgress?: (progress01: number) => void
}

/**
 * Lambda path returns a direct S3 download URL.
 * Local path returns the local MP4 file path (caller uploads or serves it).
 */
type RenderResult =
  | { localMp4Path: string; downloadUrl?: never }
  | { downloadUrl: string; localMp4Path?: never }

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

function mustGetEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

function makeTimeoutPromise(ms: number, jobId: string): Promise<never> {
  return new Promise((_, reject) =>
    setTimeout(
      () => reject(new Error(`Render timed out after ${ms / 1000}s (job ${jobId})`)),
      ms
    )
  )
}

/** Mask a Storage URL to just the filename for log readability. */
function maskUrl(url: string | undefined | null): string {
  if (!url) return "(none)"
  try {
    const pathname = new URL(url).pathname
    return pathname.split("/").pop()?.split("?")[0] ?? "(unknown)"
  } catch {
    return url.slice(-40)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/** Log a pre-render summary of all clips to aid post-mortem debugging. */
function logPreFlight(jobId: string, project: Project): {
  clipCount: number
  totalClipSeconds: number
} {
  const clips = project.clips ?? []
  const clipCount = clips.length
  const totalClipSeconds = clips.reduce(
    (sum, c) => sum + Math.max(0, (c.trimEnd ?? 0) - (c.trimStart ?? 0)),
    0
  )

  logger.info(
    {
      jobId,
      mode: USE_LAMBDA ? "lambda" : "local",
      clipCount,
      totalClipSeconds: Math.round(totalClipSeconds),
      introDurationSeconds: project.intro?.durationSeconds ?? 3,
      hasMusic: !!project.music?.musicUrl,
    },
    "render pre-flight"
  )

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    logger.info(
      {
        jobId,
        clipIndex: i + 1,
        name: clip.name,
        srcFile: maskUrl(clip.src),
        hasSrc: !!clip.src,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        role: clip.role ?? "normal",
        muteAudio: clip.muteAudio ?? false,
      },
      "clip pre-flight"
    )
  }

  // Log scoreboard, goals and audio settings so we can verify parity with the editor.
  logger.info(
    {
      jobId,
      scoreboard: {
        homeTeamName: project.scoreboard?.homeTeamName ?? "(none)",
        awayTeamName: project.scoreboard?.awayTeamName ?? "(none)",
        homeScore: project.scoreboard?.homeScore ?? 0,
        awayScore: project.scoreboard?.awayScore ?? 0,
      },
      goalCount: (project.goals ?? []).length,
      goals: (project.goals ?? []).map((g) => ({
        clipId: g.clipId,
        timeInClip: g.timeInClip,
        side: g.side,
        scorerName: g.scorerName,
      })),
      clipAudioOn: project.music?.clipAudioOn ?? true,
      mutedClips: clips.filter((c) => c.muteAudio).map((c) => c.name ?? c.id),
    },
    "render parity pre-flight"
  )

  return { clipCount, totalClipSeconds }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Lambda render path
// ─────────────────────────────────────────────────────────────────────────────

async function renderWithLambda({
  jobId,
  project,
  onProgress,
}: RenderParams): Promise<{ downloadUrl: string }> {
  const functionName = LAMBDA_FUNCTION_NAME!
  const serveUrl = LAMBDA_SERVE_URL!
  const compositionId = process.env.REMOTION_COMPOSITION_ID ?? "HighlightReel"

  logger.info(
    { jobId, functionName, region: LAMBDA_REGION, framesPerLambda: FRAMES_PER_LAMBDA },
    "starting Lambda render"
  )

  // Kick off the render — Lambda returns immediately with a renderId.
  const { renderId, bucketName } = await renderMediaOnLambda({
    region: LAMBDA_REGION,
    functionName,
    serveUrl,
    composition: compositionId,
    inputProps: project,
    codec: "h264",
    imageFormat: "jpeg",
    // Parallelism: each Lambda invocation renders this many consecutive frames.
    framesPerLambda: FRAMES_PER_LAMBDA,
    // Per-frame timeout: give Lambda enough time to download remote clips from Firebase.
    timeoutInMilliseconds: REMOTION_FRAME_TIMEOUT_MS,
    // Retry once on transient failures (cold-start timeout, S3 blip, etc).
    maxRetries: 1,
    // Output file name inside the Lambda-managed S3 bucket.
    outName: `${jobId}.mp4`,
    // Public: the rendered MP4 is accessible directly via its S3 URL.
    privacy: "public",
  })

  logger.info({ jobId, renderId, bucketName }, "Lambda render started — polling for progress")

  // Poll getRenderProgress until the render finishes or times out.
  let lastReportedPct = -1
  const deadline = Date.now() + RENDER_TIMEOUT_MS

  while (true) {
    if (Date.now() > deadline) {
      throw new Error(
        `Lambda render timed out after ${RENDER_TIMEOUT_MS / 1000}s (job ${jobId}, render ${renderId})`
      )
    }

    const progress = await getRenderProgress({
      renderId,
      bucketName,
      functionName,
      region: LAMBDA_REGION,
    })

    if (progress.fatalErrorEncountered) {
      const msg =
        progress.errors?.[0]?.message ??
        progress.errors?.[0]?.name ??
        "unknown Lambda error"
      throw new Error(`Lambda render failed (job ${jobId}): ${msg}`)
    }

    const pct = Math.floor((progress.overallProgress ?? 0) * 100)

    if (pct - lastReportedPct >= PROGRESS_THROTTLE_PCT || pct === 100) {
      lastReportedPct = pct
      logger.info(
        { jobId, renderId, progress_pct: pct, costs: progress.costs },
        "Lambda render progress"
      )
      onProgress?.(progress.overallProgress ?? 0)
    }

    if (progress.done) {
      const downloadUrl = progress.outputFile ?? ""
      logger.info({ jobId, renderId, downloadUrl }, "Lambda render complete")
      return { downloadUrl }
    }

    await sleep(2_000) // poll every 2 seconds
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Local render path (fallback when Lambda is not configured)
// ─────────────────────────────────────────────────────────────────────────────

async function renderLocally({
  jobId,
  project,
  rendersDir,
  onProgress,
}: RenderParams): Promise<{ localMp4Path: string }> {
  const compositionId = process.env.REMOTION_COMPOSITION_ID ?? "HighlightReel"
  const remotionRoot = mustGetEnv("REMOTION_ROOT")

  await fs.mkdir(rendersDir, { recursive: true })
  const outPath = localRenderedPath(rendersDir, jobId)

  // Bundle (cached per process)
  if (!cachedBundle) {
    const entryPoint = path.join(remotionRoot, "src", "index.ts")
    logger.info({ remotionRoot, entryPoint }, "bundling Remotion project")

    const serveUrl = await bundle(entryPoint, (progress) => {
      logger.debug({ bundle_progress: Math.round(progress * 100) }, "bundle progress")
    }, {
      outDir: path.join(remotionRoot, ".remotion-bundle"),
    })

    cachedBundle = { serveUrl }
    logger.info({ serveUrl }, "bundle ready")
  }

  const inputProps = project
  const composition = await selectComposition({
    serveUrl: cachedBundle.serveUrl,
    id: compositionId,
    inputProps,
  })

  logger.info(
    { jobId, compositionId, durationInFrames: composition.durationInFrames, outPath },
    "local render starting"
  )

  let lastReportedPct = -1
  let lastLoggedFrame = -1

  const renderPromise = renderMedia({
    serveUrl: cachedBundle.serveUrl,
    composition,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
    concurrency: REMOTION_CONCURRENCY,
    timeoutInMilliseconds: REMOTION_FRAME_TIMEOUT_MS,
    offthreadVideoCacheSizeInBytes: REMOTION_VIDEO_CACHE_BYTES,
    offthreadVideoThreads: REMOTION_VIDEO_THREADS,
    chromiumOptions: {
      enableMultiProcessOnLinux: false,
    },
    onStart: ({ frameCount, parallelEncoding }) => {
      logger.info({ jobId, frameCount, parallelEncoding }, "local compositor started")
    },
    onBrowserLog: ({ type, text, stackTrace }) => {
      if (type === "error") {
        logger.error({ jobId, text, stackTrace }, "renderer [browser error]")
      } else if (type === "warning") {
        logger.warn({ jobId, text }, "renderer [browser warning]")
      } else if (type === "log" || type === "info") {
        // Captures console.log / console.info from HighlightReel diagnostics.
        logger.info({ jobId, text }, "renderer [browser log]")
      }
    },
    onProgress: ({ progress, renderedFrames }) => {
      const pct = Math.floor(progress * 100)
      const frame = renderedFrames ?? -1

      if (pct - lastReportedPct >= PROGRESS_THROTTLE_PCT || pct === 100) {
        lastReportedPct = pct
        lastLoggedFrame = frame
        logger.info({ jobId, progress_pct: pct, renderedFrames: frame }, "local render progress")
        onProgress?.(progress)
      }
    },
  })

  try {
    await Promise.race([
      renderPromise,
      makeTimeoutPromise(RENDER_TIMEOUT_MS, jobId),
    ])
  } catch (err) {
    const base = err instanceof Error ? err.message : String(err)
    const augmented = new Error(
      `Local render failed at frame ~${lastLoggedFrame} of ${composition.durationInFrames}: ${base}`
    )
    augmented.cause = err
    throw augmented
  }

  logger.info({ jobId, outPath }, "local render complete")
  return { localMp4Path: outPath }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Renders the project to MP4 using either AWS Lambda (when configured) or
 * local Remotion renderMedia (fallback).
 *
 * Lambda mode env vars (all required together):
 *   AWS_ACCESS_KEY_ID              AWS IAM key with Lambda + S3 permissions
 *   AWS_SECRET_ACCESS_KEY          Matching secret
 *   AWS_REGION                     Region (default: us-east-1)
 *   REMOTION_LAMBDA_FUNCTION_NAME  From `npx remotion lambda functions deploy`
 *   REMOTION_SERVE_URL             From `npx remotion lambda sites create`
 *
 * Local mode env vars:
 *   REMOTION_ROOT              Absolute path to the Renderer folder
 *   REMOTION_CONCURRENCY       Compositor concurrency (default: 1)
 *   REMOTION_FRAME_TIMEOUT_MS  Per-frame timeout ms (default: 60 000)
 *   REMOTION_VIDEO_CACHE_MB    OffthreadVideo cache MB (default: 32)
 *   REMOTION_VIDEO_THREADS     FFmpeg thread count (default: 1)
 */
export async function renderProjectToMp4(params: RenderParams): Promise<RenderResult> {
  const { jobId, project } = params
  logPreFlight(jobId, project)

  if (USE_LAMBDA) {
    return renderWithLambda(params)
  }

  return renderLocally(params)
}

/** Invalidate the local bundle cache (useful for testing or forced re-bundle). */
export function clearBundleCache(): void {
  cachedBundle = null
}
