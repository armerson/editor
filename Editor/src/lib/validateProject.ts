import type { ProjectData } from "../types"

/**
 * Validate a project before export.
 *
 * Returns an array of human-readable error messages.
 * An empty array means the project is safe to export.
 */
export function validateProjectForExport(project: ProjectData): string[] {
  const errors: string[] = []

  if (!project.clips || project.clips.length === 0) {
    errors.push("Add at least one clip before exporting.")
    // still continue to look for other issues in case we want to show more detail
  }

  project.clips.forEach((clip, index) => {
    const hasSrc = typeof clip.src === "string" && clip.src.trim().length > 0
    if (!hasSrc) {
      const label = clip.name || `Clip ${index + 1}`
      errors.push(
        `Clip ${index + 1} (${label}) is missing src. Upload the video before exporting.`
      )
    }
  })

  const musicFileName = project.music?.musicFileName?.trim()
  const musicUrl = project.music?.musicUrl?.trim()
  if (musicFileName && !musicUrl) {
    errors.push("Music selected but not uploaded.")
  }

  return errors
}

