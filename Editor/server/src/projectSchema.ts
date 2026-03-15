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
    clubBadgeUrl: z.string(),
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

