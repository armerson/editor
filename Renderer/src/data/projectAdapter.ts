/**
 * Converts editor/project JSON into HighlightReelData for the Remotion composition.
 * Uses clip.src from each clip; when missing, resolves from clip.name + videoBasePath.
 * Respects trimStart/trimEnd, keeps intro, music, scoreboard, goals, and lower-third support.
 */

import type {
  HighlightReelData,
  IntroCardData,
  ClipData,
  MusicTrackData,
  ScoreboardOverlayData,
  LowerThirdsOverlayData,
  GoalEvent,
  GoalSide,
} from "../types/reel"

/** Project JSON clip shape (editor export) */
export type ProjectClip = {
  id?: string
  name?: string
  /** Video URL or path; if omitted, resolved from name + videoBasePath */
  src?: string
  duration?: number
  trimStart?: number
  trimEnd?: number
  /** Clip role: 'normal' | 'intro' | 'outro' — absent means 'normal' */
  role?: string
  showScoreboard?: boolean
  minuteMarker?: string
  showScorerAfterGoal?: boolean
  /** When true the clip's original audio track is silenced in the render. */
  muteAudio?: boolean
  [key: string]: unknown
}

/** Project JSON intro shape */
export type ProjectIntro = {
  teamName?: string
  opponent?: string
  score?: string
  matchDate?: string
  ageGroup?: string
  /** Legacy single-badge field — maps to homeBadgeUrl when homeBadgeUrl is absent */
  clubBadgeUrl?: string
  /** Home team badge URL */
  homeBadgeUrl?: string
  /** Away team badge URL */
  awayBadgeUrl?: string
  durationSeconds?: number
  [key: string]: unknown
}

/** Project JSON scoreboard shape */
export type ProjectScoreboard = {
  homeTeamName?: string
  awayTeamName?: string
  homeScore?: number
  awayScore?: number
  [key: string]: unknown
}

/** Project JSON music shape */
export type ProjectMusic = {
  /** Full download URL of the uploaded music file (Firebase Storage URL) */
  musicUrl?: string
  musicSrc?: string
  musicFileName?: string
  musicVolume?: number
  musicStartInReel?: number
  musicStartInTrack?: number
  musicEndInReel?: number | string
  fadeOutDuration?: number
  clipAudioOn?: boolean
  [key: string]: unknown
}

/** Project JSON root (editor export) */
export type ProjectJson = {
  version?: number
  projectTitle?: string
  clips?: ProjectClip[]
  intro?: ProjectIntro
  scoreboard?: ProjectScoreboard
  music?: ProjectMusic
  lowerThird?: Record<string, unknown>
  goals?: unknown[]
  transitions?: unknown[]
  [key: string]: unknown
}

type ProjectGoal = {
  id?: string
  clipId?: string
  timeInClip?: number
  side?: GoalSide
  scorerName?: string
  [key: string]: unknown
}

function isGoalSide(side: unknown): side is GoalSide {
  return side === "home" || side === "away"
}

function parseGoals(goals: unknown[] | undefined): GoalEvent[] {
  if (!Array.isArray(goals)) return []

  const out: GoalEvent[] = []

  for (const g of goals) {
    if (!g || typeof g !== "object") continue

    const pg = g as ProjectGoal

    if (typeof pg.clipId !== "string" || !pg.clipId.trim()) continue
    if (typeof pg.timeInClip !== "number" || !Number.isFinite(pg.timeInClip)) continue
    if (!isGoalSide(pg.side)) continue

    out.push({
      id: typeof pg.id === "string" ? pg.id : undefined,
      clipId: pg.clipId,
      timeInClip: pg.timeInClip,
      side: pg.side,
      scorerName: typeof pg.scorerName === "string" ? pg.scorerName : undefined,
    })
  }

  return out
}

export type ProjectAdapterOptions = {
  /** Base path for video files when clip.src is missing (e.g. '/' or '/videos'). clip.name is appended. */
  videoBasePath?: string
}

/**
 * Resolves video src for a project clip: use clip.src if set, else basePath + clip.name.
 */
function resolveClipSrc(clip: ProjectClip, videoBasePath: string): string | null {
  if (clip.src && String(clip.src).trim()) {
    return String(clip.src).trim()
  }

  const name = clip.name?.trim()
  if (!name) return null

  const base = (videoBasePath ?? "/").replace(/\/$/, "")
  return `${base}/${name}`
}

/**
 * Converts project JSON to HighlightReelData.
 * - Reads clip.src (or resolves from name + videoBasePath)
 * - Respects trimStart and trimEnd per clip
 * - Sequences clips in array order
 * - Maps intro, music, scoreboard, lowerThirds for overlay support
 */
export function projectJsonToHighlightReelData(
  project: ProjectJson,
  options: ProjectAdapterOptions = {}
): HighlightReelData {
  const { videoBasePath = "/" } = options

  const clips: ClipData[] = []

  for (const pc of project.clips ?? []) {
    const src = resolveClipSrc(pc, videoBasePath)
    if (!src) continue

    // Normalise role — only pass through recognised values; absent/unknown → 'normal'
    const role =
      pc.role === "intro" || pc.role === "outro" ? pc.role : "normal"

    clips.push({
      id: pc.id,
      src,
      trimStart: typeof pc.trimStart === "number" ? pc.trimStart : 0,
      trimEnd: typeof pc.trimEnd === "number" ? pc.trimEnd : undefined,
      // Do NOT forward pc.duration (full source file length) as durationSeconds.
      // getClipDurationSeconds() derives the reel duration from trimEnd − trimStart,
      // which is the correct trimmed length. Passing the raw file duration here
      // causes each Sequence to span the full source length even for trimmed clips,
      // resulting in frozen last-frame video for the remainder.
      durationSeconds: undefined,
      name: pc.name ?? undefined,
      role,
      showScoreboard: pc.showScoreboard,
      minuteMarker: pc.minuteMarker,
      showScorerAfterGoal: pc.showScorerAfterGoal,
      muteAudio: typeof pc.muteAudio === "boolean" ? pc.muteAudio : false,
    })
  }

  // Dual badge support: prefer homeBadgeUrl / awayBadgeUrl; fall back to legacy
  // clubBadgeUrl (which maps to homeBadgeUrl for backward compatibility).
  const homeBadge =
    project.intro?.homeBadgeUrl?.trim() || project.intro?.clubBadgeUrl?.trim() || undefined
  const awayBadge = project.intro?.awayBadgeUrl?.trim() || undefined
  const hasBothBadges = !!(homeBadge && awayBadge)

  // Build subtitle with POSITIONAL empty slots preserved so that legacy Lambda
  // builds (which don't receive individual opponent/score/matchDate/ageGroup
  // fields and fall back to subtitle parsing) assign fields to the correct
  // positions. Without empty slots, filtered-out fields shift later fields
  // into the wrong slot (e.g. ageGroup ends up parsed as score).
  //
  // Dual-badge format:  "opponent · score · matchDate · ageGroup"
  // Single-badge format: "score · matchDate · ageGroup"  (no opponent slot)
  let subtitle: string | undefined
  if (hasBothBadges) {
    const parts = [
      project.intro?.opponent ?? '',
      project.intro?.score ?? '',
      project.intro?.matchDate ?? '',
      project.intro?.ageGroup ?? '',
    ]
    subtitle = parts.some(Boolean) ? parts.join(' · ') : undefined
  } else {
    const parts = [
      project.intro?.score,
      project.intro?.matchDate,
      project.intro?.ageGroup,
    ].filter(Boolean)
    subtitle = parts.length > 0 ? parts.join(' · ') : undefined
  }

  const intro: IntroCardData = {
    title: project.intro?.teamName ?? "Highlights",
    subtitle,
    durationSeconds: project.intro?.durationSeconds ?? 3,
    homeBadgeUrl: homeBadge,
    awayBadgeUrl: awayBadge,
    // Keep legacy imageUrl populated so old renderer IntroCard builds still work.
    imageUrl: homeBadge,
    backgroundColor: "#0a0a0f",
    // Pass individual fields so IntroCard doesn't need to re-parse subtitle.
    // Use ?? (not ||) so empty strings pass through as "" rather than becoming
    // undefined — this keeps opponentProp !== undefined, forcing the renderer to
    // take the individual-fields path instead of legacy subtitle parsing.
    opponent: project.intro?.opponent ?? undefined,
    score: project.intro?.score ?? undefined,
    matchDate: project.intro?.matchDate ?? undefined,
    ageGroup: project.intro?.ageGroup ?? undefined,
  }

  let music: MusicTrackData | undefined
  const pm = project.music

  if (pm) {
    const explicitUrl =
      typeof pm.musicUrl === "string" && pm.musicUrl.trim() ? pm.musicUrl.trim() : null

    const explicitSrc =
      typeof pm.musicSrc === "string" && pm.musicSrc.trim() ? pm.musicSrc.trim() : null

    const fileName =
      typeof pm.musicFileName === "string" && pm.musicFileName.trim()
        ? pm.musicFileName.trim()
        : null

    const musicBase = (videoBasePath ?? "/").replace(/\/$/, "")
    const resolvedSrc = explicitUrl ?? explicitSrc ?? (fileName ? `${musicBase}/${fileName}` : null)

    // clipAudioOn must be preserved even when there is no music file so that
    // HighlightReel can correctly mute/unmute clip audio tracks.
    const clipAudioOn: boolean | undefined =
      typeof pm.clipAudioOn === "boolean" ? pm.clipAudioOn : undefined

    if (resolvedSrc) {
      const rawEndInReel =
        typeof pm.musicEndInReel === "number"
          ? pm.musicEndInReel
          : typeof pm.musicEndInReel === "string" && pm.musicEndInReel.trim()
            ? Number(pm.musicEndInReel)
            : undefined

      music = {
        src: resolvedSrc,
        volume: typeof pm.musicVolume === "number" ? pm.musicVolume : 0.6,
        trimStart: typeof pm.musicStartInTrack === "number" ? pm.musicStartInTrack : undefined,
        startInReel: typeof pm.musicStartInReel === "number" ? pm.musicStartInReel : undefined,
        endInReel: rawEndInReel,
        fadeOutDuration: typeof pm.fadeOutDuration === "number" ? pm.fadeOutDuration : undefined,
        clipAudioOn,
        loop: true,
      }
    } else if (clipAudioOn !== undefined) {
      // No music file but clipAudioOn is explicitly set. Create a minimal settings
      // object so HighlightReel can read the flag. The empty src prevents the
      // MusicTrack audio element from rendering (guarded by `props.music?.src`).
      music = { src: "", clipAudioOn }
    }
  }

  const sb = project.scoreboard
  const hasScoreboardData = sb && (sb.homeTeamName?.trim() || sb.awayTeamName?.trim())
  const scoreboard: ScoreboardOverlayData | undefined = hasScoreboardData
    ? {
        visible: true,
        homeTeamName: sb!.homeTeamName,
        awayTeamName: sb!.awayTeamName,
        homeScore: sb!.homeScore,
        awayScore: sb!.awayScore,
      }
    : undefined

  const lowerThirds: LowerThirdsOverlayData | undefined = project.lowerThird
    ? { visible: false, ...(project.lowerThird as LowerThirdsOverlayData) }
    : undefined

  const goals = parseGoals(project.goals)

  return {
    intro,
    clips,
    goals,
    music,
    scoreboard,
    lowerThirds,
  }
}