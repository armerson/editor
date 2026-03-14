import path from "node:path"
import { Storage } from "@google-cloud/storage"

export type UploadResult = {
  publicUrl: string
}

function mustGetEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing env var: ${name}`)
  return v
}

/**
 * Uploads `localFilePath` to a GCS bucket and returns a URL.
 *
 * Cloud Run recommended:
 * - authenticate via service account (no key file)
 * - keep bucket private, return a signed URL via your app (future step)
 *
 * Minimal first working implementation:
 * - if `RENDER_OUTPUT_PUBLIC_BASE_URL` is provided, we use that as the returned URL base
 * - otherwise we fall back to `https://storage.googleapis.com/<bucket>/<object>`
 */
export async function uploadRenderedMp4(localFilePath: string, jobId: string): Promise<UploadResult> {
  const bucketName = mustGetEnv("RENDER_OUTPUT_BUCKET")
  const outputPrefix = process.env.RENDER_OUTPUT_PREFIX ?? "renders"
  const objectName = `${outputPrefix}/${jobId}.mp4`

  const storage = new Storage()
  const bucket = storage.bucket(bucketName)

  await bucket.upload(localFilePath, {
    destination: objectName,
    contentType: "video/mp4",
    resumable: false,
    metadata: {
      cacheControl: "public, max-age=31536000, immutable",
    },
  })

  const publicBase = process.env.RENDER_OUTPUT_PUBLIC_BASE_URL
  const publicUrl = publicBase
    ? `${publicBase.replace(/\/$/, "")}/${objectName}`
    : `https://storage.googleapis.com/${bucketName}/${objectName}`

  return { publicUrl }
}

export function localRenderedPath(rendersDir: string, jobId: string) {
  return path.join(rendersDir, `${jobId}.mp4`)
}

