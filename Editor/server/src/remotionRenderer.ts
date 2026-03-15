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
 * Bundles the Remotion project once per process, then renders to MP4.
 *
 * Env:
 * - REMOTION_ROOT             Absolute path to the Renderer project folder
 * - REMOTION_COMPOSITION_ID   Composition id to render (default: "HighlightReel")
 * - RENDER_TIMEOUT_MS         Max ms allowed for a render (default: 1 200 000 = 20 min)
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

  logger.info({ jobId, compositionId, outPath }, "render starting")

  // ── Render with timeout ───────────────────────────────────────────────────
  let lastReportedPct = -1

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
    onProgress: ({ progress }) => {
      const pct = Math.floor(progress * 100)

      // Throttle: only fire callback and log every PROGRESS_THROTTLE_PCT points.
      if (pct - lastReportedPct >= PROGRESS_THROTTLE_PCT || pct === 100) {
        lastReportedPct = pct
        logger.debug({ jobId, progress_pct: pct }, "render progress")
        onProgress?.(progress)
      }
    },
  })

  await Promise.race([
    renderPromise,
    makeTimeoutPromise(RENDER_TIMEOUT_MS, jobId),
  ])

  logger.info({ jobId, outPath }, "render complete")
  return { localMp4Path: outPath }
}

/** Invalidate the bundle cache (useful for testing or forced re-bundle). */
export function clearBundleCache(): void {
  cachedBundle = null
}
