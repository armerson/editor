import type { Project } from "./projectSchema"

export function validateProjectForRender(project: Project): string[] {
  const errors: string[] = []

  if (!project.clips || project.clips.length === 0) {
    errors.push("Add at least one clip before rendering.")
    return errors
  }

  project.clips.forEach((clip, idx) => {
    if (!clip.src) {
      errors.push(`Clip ${idx + 1} (${clip.name}) is missing src.`)
    }
  })

  if (project.music.musicFileName && !project.music.musicUrl) {
    errors.push("Music selected but not uploaded.")
  }

  return errors
}

