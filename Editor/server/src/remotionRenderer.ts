import path from "node:path"
import fs from "node:fs/promises"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"
import type { Project } from "./projectSchema"
import { localRenderedPath } from "./storageUploader"
import { logger } from "./logger"

/** Cached bundle — rebuilt only when the process restarts. */
let cachedBundle: { serveUrl: string } | null = null

/** Default: 20 minutes. Override with RENDER_TIMEOUT_MS env var. */
const RENDER_TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 20 * 60 * 1000)

/**
 * Remotion compositor concurrency.
 * Default: 1 — forces sequential frame rendering to stay within Railway's
 * memory limits (a SIGKILL on the compositor means the container OOMed).
 * Increase on machines with ≥4 GB RAM: REMOTION_CONCURRENCY=4
 */
const REMOTION_CONCURRENCY = Number(process.env.REMOTION_CONCURRENCY ?? 1)

/**
 * Per-frame render timeout passed to Remotion.
 * Default 60 s (Remotion's own default is 30 s, which is too tight when
 * a slow network must fetch a clip from Firebase Storage during rendering).
 * Override with REMOTION_FRAME_TIMEOUT_MS env var.
 */
const REMOTION_FRAME_TIMEOUT_MS = Number(process.env.REMOTION_FRAME_TIMEOUT_MS ?? 60_000)

/**
 * Maximum RAM Remotion's OffthreadVideo off-thread server may use for its
 * decoded-frame cache. Without a cap the cache is unbounded and will OOM-kill
 * the compositor process (SIGKILL) on memory-constrained hosts (Railway, Fly).
 *
 * NOTE: this cap controls only the in-Node.js frame buffer.  The compositor
 * subprocess (Rust + FFmpeg) and headless Chrome each allocate their own
 * memory on top of this.  On Railway's 512 MB starter plan the full budget is:
 *
 *   Node.js process         ~150 MB
 *   Frame cache             this setting
 *   Compositor (FFmpeg)      ~80–150 MB  (single thread via REMOTION_VIDEO_THREADS)
 *   Headless Chrome          ~120–180 MB  (single-process via chromiumOptions)
 *
 * Keep this small (default 32 MB) to leave headroom for the compositor and
 * Chrome.  Increase only on instances with ≥1 GB RAM.
 *
 * Sizing guide:
 *   • 1 decoded 1080p frame ≈ 8 MB  (1920 × 1080 × 4 bytes)
 *   •  32 MB ≈  4 frames of 1080p warm
 *   • 128 MB ≈ 15 frames of 1080p warm
 *
 * Override: REMOTION_VIDEO_CACHE_MB=128
 */
const REMOTION_VIDEO_CACHE_BYTES =
  (Number(process.env.REMOTION_VIDEO_CACHE_MB ?? 32)) * 1024 * 1024

/**
 * Number of FFmpeg threads the OffthreadVideo compositor may use per clip.
 *
 * Remotion's compositor binary runs FFmpeg in a subprocess.  FFmpeg defaults
 * to spawning one thread per logical CPU core, each of which holds its own
 * decode buffer (~10–30 MB for 1080p H.264).  On a constrained host this
 * multiplies peak RSS significantly.
 *
 * Setting this to 1 forces single-threaded decoding: slower per-frame but
 * dramatically lower peak RSS.  For a sequential render (concurrency = 1)
 * single-threaded decoding adds negligible wall-clock time because frames are
 * produced one at a time anyway.
 *
 * Override: REMOTION_VIDEO_THREADS=4  (on a 4 GB+ host)
 */
const REMOTION_VIDEO_THREADS =
  Number(process.env.REMOTION_VIDEO_THREADS ?? 1)

/** Only emit an onProgress log/callback every N percentage points to reduce noise. */
const PROGRESS_THROTTLE_PCT = 5

type RenderParams = {
  jobId: string
  project: Project
  rendersDir: string
  onProgress?: (progress01: number) => void
}

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

/**
 * Mask a Firebase Storage / S3 URL to just the filename for log readability.
 * e.g. "https://storage.googleapis.com/bucket/clips/foo.mp4?token=..." → "foo.mp4"
 */
function maskUrl(url: string | undefined | null): string {
  if (!url) return "(none)"
  try {
    const pathname = new URL(url).pathname
    return pathname.split("/").pop()?.split("?")[0] ?? "(unknown)"
  } catch {
    return url.slice(-40)  // fall back to last 40 chars if not parseable
  }
}

/**
 * Bundles the Remotion project once per process, then renders to MP4.
 *
 * Env:
 * - REMOTION_ROOT             Absolute path to the Renderer project folder
 * - REMOTION_COMPOSITION_ID   Composition id to render (default: "HighlightReel")
 * - RENDER_TIMEOUT_MS         Max ms allowed for a render (default: 1 200 000 = 20 min)
 * - REMOTION_CONCURRENCY      Compositor concurrency (default: 1)
 * - REMOTION_FRAME_TIMEOUT_MS Per-frame timeout (default: 60 000)
 * - REMOTION_VIDEO_CACHE_MB   OffthreadVideo frame cache size in MB (default: 32)
 * - REMOTION_VIDEO_THREADS    FFmpeg thread count per clip (default: 1)
 */
export async function renderProjectToMp4({
  jobId,
  project,
  rendersDir,
  onProgress,
}: RenderParams): Promise<{ localMp4Path: string }> {
  const compositionId = process.env.REMOTION_COMPOSITION_ID ?? "HighlightReel"
  const remotionRoot = mustGetEnv("REMOTION_ROOT")

  await fs.mkdir(rendersDir, { recursive: true })
  const outPath = localRenderedPath(rendersDir, jobId)

  // ── Pre-render diagnostics ───────────────────────────────────────────────
  const clips = project.clips ?? []
  const clipCount = clips.length
  const totalClipSeconds = clips.reduce(
    (sum, c) => sum + Math.max(0, (c.trimEnd ?? 0) - (c.trimStart ?? 0)),
    0
  )
  const introDuration = project.intro?.durationSeconds ?? 3

  logger.info(
    {
      jobId,
      clipCount,
      totalClipSeconds: Math.round(totalClipSeconds),
      introDurationSeconds: introDuration,
      hasMusic: !!project.music?.musicUrl,
      musicEndInReel: project.music?.musicEndInReel,
      cacheBytes: REMOTION_VIDEO_CACHE_BYTES,
      threads: REMOTION_VIDEO_THREADS,
      concurrency: REMOTION_CONCURRENCY,
    },
    "render pre-flight"
  )

  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i]
    logger.info(
      {
        jobId,
        clipIndex: i + 1,
        clipId: clip.id,
        name: clip.name,
        srcFile: maskUrl(clip.src),
        hasSrc: !!clip.src,
        trimStart: clip.trimStart,
        trimEnd: clip.trimEnd,
        durationSec: Math.round(((clip.trimEnd ?? 0) - (clip.trimStart ?? 0)) * 10) / 10,
        role: clip.role ?? "normal",
      },
      "clip pre-flight"
    )
  }

  // ── Bundle (cached per process) ──────────────────────────────────────────
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

  // ── Select composition ───────────────────────────────────────────────────
  // Pass props flat — Root.tsx calculateMetadata expects ProjectJson directly.
  const inputProps = project
  const composition = await selectComposition({
    serveUrl: cachedBundle.serveUrl,
    id: compositionId,
    inputProps,
  })

  logger.info(
    { jobId, compositionId, durationInFrames: composition.durationInFrames, outPath },
    "render starting"
  )

  // ── Render with timeout ───────────────────────────────────────────────────
  let lastReportedPct = -1
  let lastLoggedFrame = -1

  const renderPromise = renderMedia({
    serveUrl: cachedBundle.serveUrl,
    composition,
    codec: "h264",
    outputLocation: outPath,
    inputProps,

    // Keep memory under Railway's limits — 1 compositor at a time.
    // Increase REMOTION_CONCURRENCY env var on larger instances.
    concurrency: REMOTION_CONCURRENCY,

    // Give each frame more time to decode remote video (Firebase Storage).
    timeoutInMilliseconds: REMOTION_FRAME_TIMEOUT_MS,

    // Cap the OffthreadVideo decoded-frame cache to prevent SIGKILL OOM.
    // Without this limit Remotion holds every decoded frame in RAM forever,
    // which exhausts memory on restricted hosts (512 MB Railway containers).
    // Frames beyond the cap are evicted and re-decoded on demand.
    offthreadVideoCacheSizeInBytes: REMOTION_VIDEO_CACHE_BYTES,

    // Limit FFmpeg thread count inside the compositor subprocess.
    // Each FFmpeg thread holds its own decode buffer (~10–30 MB for 1080p H.264);
    // single-threaded decoding keeps compositor RSS ~80 MB vs ~300 MB at default.
    // At concurrency=1 there is no throughput penalty since frames are sequential.
    offthreadVideoThreads: REMOTION_VIDEO_THREADS,

    // ── Chrome memory hardening ────────────────────────────────────────────
    // On Linux, Chromium can run in multi-process mode (Zygote model) where
    // it spawns renderer subprocesses that each consume ~80–150 MB.  With
    // concurrency=1 there is no rendering benefit; explicitly disable
    // multi-process to keep Chrome's total footprint to ~120–180 MB.
    chromiumOptions: {
      enableMultiProcessOnLinux: false,
    },

    // ── Diagnostics ───────────────────────────────────────────────────────
    onStart: ({ frameCount, parallelEncoding }) => {
      logger.info(
        { jobId, frameCount, parallelEncoding, totalClipSeconds: Math.round(totalClipSeconds) },
        "compositor started"
      )
    },

    // Capture React-side console.error / console.warn output from the renderer.
    // These messages surface issues like missing clip srcs or bad data that would
    // otherwise be invisible — they show up with the job ID so they're traceable.
    onBrowserLog: ({ type, text, stackTrace }) => {
      if (type === "error") {
        logger.error({ jobId, text, stackTrace }, "renderer [browser error]")
      } else if (type === "warning") {
        logger.warn({ jobId, text }, "renderer [browser warning]")
      }
      // info / log / debug are suppressed to avoid noise; React DevTools etc.
    },

    onProgress: ({ progress, renderedFrames }) => {
      const pct = Math.floor(progress * 100)
      const frame = renderedFrames ?? -1

      // Throttle: only fire callback and log every PROGRESS_THROTTLE_PCT points.
      if (pct - lastReportedPct >= PROGRESS_THROTTLE_PCT || pct === 100) {
        lastReportedPct = pct
        lastLoggedFrame = frame
        logger.info({ jobId, progress_pct: pct, renderedFrames: frame }, "render progress")
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
    // Re-throw with richer context so the job error field shows exactly where
    // the failure occurred (last known frame, clip count, total duration).
    const base = err instanceof Error ? err.message : String(err)
    const augmented = new Error(
      `Render failed at frame ~${lastLoggedFrame} of ${composition.durationInFrames}` +
      ` (${clipCount} clips, ~${Math.round(totalClipSeconds)}s total): ${base}`
    )
    augmented.cause = err
    throw augmented
  }

  logger.info({ jobId, outPath }, "render complete")
  return { localMp4Path: outPath }
}

/** Invalidate the bundle cache (useful for testing or forced re-bundle). */
export function clearBundleCache(): void {
  cachedBundle = null
}
