import path from "node:path"
import fs from "node:fs/promises"
import { bundle } from "@remotion/bundler"
import { renderMedia, selectComposition } from "@remotion/renderer"
import type { Project } from "./projectSchema"
import { localRenderedPath } from "./storageUploader"

let cachedBundle: { serveUrl: string } | null = null

type RenderParams = {
  jobId: string
  project: Project
  rendersDir: string
  onProgress?: (progress01: number) => void
}

function mustGetEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

/**
 * Bundles the Remotion project once per process, then renders to MP4.
 *
 * Env:
 * - REMOTION_ROOT: path to the Remotion project folder (e.g. "../renderer")
 * - REMOTION_COMPOSITION_ID: the composition id to render (e.g. "HighlightReel")
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

  if (!cachedBundle) {
    const entryPoint = path.join(remotionRoot, "src", "index.ts")
    console.log("[render] bundling Remotion project:", { remotionRoot, entryPoint })
    const serveUrl = await bundle(entryPoint, undefined, {
      outDir: path.join(remotionRoot, ".remotion-bundle"),
    })
    cachedBundle = { serveUrl }
    console.log("[render] bundle ready:", { serveUrl })
  }

  // Pass project props flat — Root.tsx's calculateMetadata expects ProjectJson directly,
  // not wrapped in { project: ... }.
  const inputProps = project
  const composition = await selectComposition({
    serveUrl: cachedBundle.serveUrl,
    id: compositionId,
    inputProps,
  })

  console.log("[render] renderMedia starting:", { compositionId, outPath })
  await renderMedia({
    serveUrl: cachedBundle.serveUrl,
    composition,
    codec: "h264",
    outputLocation: outPath,
    inputProps,
    onProgress: ({ progress }) => onProgress?.(progress),
  })

  console.log("[render] renderMedia done:", { outPath })
  return { localMp4Path: outPath }
}

