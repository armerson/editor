import { z } from "zod"

export const ProjectSchema = z.object({
  version: z.number(),
  projectTitle: z.string(),
  presetId: z.enum(["landscape", "square", "vertical"]).optional(),
  clips: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        duration: z.number(),
        trimStart: z.number(),
        trimEnd: z.number(),
        showScoreboard: z.boolean(),
        minuteMarker: z.string(),
        showScorerAfterGoal: z.boolean(),
        /** "normal" if absent — backward compat */
        role: z.enum(["normal", "intro", "outro"]).optional(),
        /** When true the clip's original audio is silenced in the render. */
        muteAudio: z.boolean().optional(),
        src: z.string().url().optional(),
        thumbnail: z.string().url().optional(),
      })
    )
    .min(1),
  intro: z.object({
    teamName: z.string(),
    opponent: z.string(),
    score: z.string(),
    matchDate: z.string(),
    ageGroup: z.string(),
    /** Competition / tournament name, e.g. "Premier League". */
    competition: z.string().optional(),
    /** Sponsor logo URL — corner overlay on clip frames. May be empty string. */
    sponsorLogoUrl: z.string().optional(),
    /** Legacy single-badge field — kept for backward compat. Renderer should prefer homeBadgeUrl. */
    clubBadgeUrl: z.string().optional(),
    /** Home club badge (new). Takes precedence over clubBadgeUrl. */
    homeBadgeUrl: z.string().optional(),
    /** Away club badge (new). May be absent. */
    awayBadgeUrl: z.string().optional(),
    durationSeconds: z.number(),
  }),
  scoreboard: z.object({
    homeTeamName: z.string(),
    awayTeamName: z.string(),
    homeScore: z.number(),
    awayScore: z.number(),
  }),
  goals: z.array(
    z.object({
      id: z.string(),
      clipId: z.string(),
      timeInClip: z.number(),
      side: z.enum(["home", "away"]),
      scorerName: z.string(),
    })
  ),
  music: z.object({
    musicFileName: z.string(),
    musicVolume: z.number(),
    musicStartInReel: z.number(),
    musicStartInTrack: z.number(),
    musicEndInReel: z.union([z.number(), z.literal("")]),
    fadeOutDuration: z.number(),
    clipAudioOn: z.boolean(),
    musicUrl: z.string().url().optional(),
  }),
  lowerThird: z
    .object({
      defaultShowScoreboard: z.boolean().optional(),
      defaultShowScorerAfterGoal: z.boolean().optional(),
    })
    .optional(),
})

export type Project = z.infer<typeof ProjectSchema>
