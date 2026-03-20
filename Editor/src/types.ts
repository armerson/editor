// ── Core domain types ─────────────────────────────────────────────────────────

/** Controls whether a clip shows scoreboard/scorer/goal overlay. */
export type ClipRole = "normal" | "intro" | "outro"

export type IntroData = {
  teamName: string
  opponent: string
  matchDate: string
  ageGroup: string
  /** Competition / tournament name, e.g. "Premier League" or "FA Cup" */
  competition: string
  /** Home club badge URL (replaces legacy clubBadgeUrl). */
  homeBadgeUrl: string
  /** Away club badge URL. Optional — may be empty. */
  awayBadgeUrl: string
  durationSeconds: number
}

export type OutroData = {
  enabled: boolean
  /** Final score string shown on outro card, e.g. "2 – 1" */
  finalScore: string
  /** Up to 8 sponsor logo URLs */
  sponsorLogoUrls: string[]
  durationSeconds: number
}

export type ScoreboardData = {
  homeTeamName: string
  awayTeamName: string
  homeScore: number
  awayScore: number
}

export type GoalEvent = {
  id: string
  clipId: string
  timeInClip: number
  side: "home" | "away"
  scorerName: string
}

/** Runtime clip — may have blob or http URL */
export type Clip = {
  id: string
  name: string
  url: string
  thumbnail: string
  duration: number
  trimStart: number
  trimEnd: number
  showScoreboard: boolean
  minuteMarker: string
  showScorerAfterGoal: boolean
  /** Defaults to "normal". intro/outro clips never show scoreboard, scorer or GOAL button. */
  role?: ClipRole
  /** When true the clip's original audio track is silenced in the final render. */
  muteAudio?: boolean
}

/** Output format preset sent to the renderer */
export type AspectRatioPreset = "landscape" | "square" | "vertical"

/** Serialisable project JSON — sent to backend for rendering */
export type ProjectData = {
  version: number
  projectTitle: string
  presetId?: AspectRatioPreset
  clips: Array<{
    id: string
    name: string
    thumbnail?: string
    duration: number
    trimStart: number
    trimEnd: number
    showScoreboard: boolean
    minuteMarker: string
    showScorerAfterGoal: boolean
    /** Defaults to "normal" if absent (backward compat). */
    role?: ClipRole
    /** When true the clip's original audio track is silenced in the final render. */
    muteAudio?: boolean
    src?: string
  }>
  intro: IntroData
  outro?: OutroData
  scoreboard: ScoreboardData
  goals: GoalEvent[]
  lowerThird?: {
    defaultShowScoreboard: boolean
    defaultShowScorerAfterGoal: boolean
  }
  music: {
    musicFileName: string
    musicVolume: number
    musicStartInReel: number
    musicStartInTrack: number
    musicEndInReel: number | ""
    fadeOutDuration: number
    clipAudioOn: boolean
    musicUrl?: string
  }
  transitions?: Array<{ type?: string; durationSeconds?: number }>
}

// ── Render state ──────────────────────────────────────────────────────────────

export type RenderStatus = "idle" | "submitting" | "queued" | "rendering" | "done" | "error"

export type RenderState = {
  status: RenderStatus
  jobId: string | null
  progress: number
  downloadUrl: string | null
  error: string | null
}
