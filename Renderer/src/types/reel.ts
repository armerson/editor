/**
 * Types for highlight reel render data.
 * Designed to match editor export JSON so you can pass your editor output directly.
 */

/** Intro card shown at the start of the reel */
export type IntroCardData = {
  title: string;
  subtitle?: string;
  durationSeconds: number;
  /** Home team badge URL — shown beside the home team name */
  homeBadgeUrl?: string;
  /** Away team badge URL — shown beside the away team name */
  awayBadgeUrl?: string;
  /**
   * Legacy single-badge field — kept for backward compatibility.
   * If set and homeBadgeUrl is absent, this is used as the home badge.
   * @deprecated Use homeBadgeUrl instead.
   */
  imageUrl?: string;
  /** Optional background color hex */
  backgroundColor?: string;
  /** Away team / opponent name — preferred over parsing from subtitle */
  opponent?: string;
  /** Final score string e.g. "2 – 1" */
  score?: string;
  /** Match date string */
  matchDate?: string;
  /** Age group / competition label e.g. "U16 Girls" */
  ageGroup?: string;
  /** Competition / tournament name e.g. "Premier League" or "FA Cup Round 3" */
  competition?: string;
  /** Sponsor logo URL — shown at the bottom of the intro card and as a corner overlay on clips */
  sponsorLogoUrl?: string;
};

/** Role of a clip in the reel */
export type ClipRole = 'normal' | 'intro' | 'outro';

/** A single video clip with optional trim (in seconds) */
export type ClipData = {
  /** Stable ID from the editor project JSON (used to associate goals with clips). */
  id?: string;
  /** URL or path to the video file (staticFile() or full URL) */
  src: string;
  /** Trim start in seconds from the beginning of the source video */
  trimStart?: number;
  /** Trim end in seconds; clip plays from trimStart to trimEnd */
  trimEnd?: number;
  /** Duration to show this clip in the reel (seconds). If omitted, uses (trimEnd - trimStart) or full clip length */
  durationSeconds?: number;
  /** Optional label for timeline / debugging */
  name?: string;
  /**
   * Clip role. 'intro' and 'outro' clips never show scoreboard, scorer text, or
   * receive goal events. Defaults to 'normal' when absent.
   */
  role?: ClipRole;
  /**
   * When true the clip's original audio is silenced in the render,
   * regardless of the global clipAudioOn setting.
   */
  muteAudio?: boolean;
  /** Whether the scoreboard should be visible while this clip plays (defaults to true if undefined). */
  showScoreboard?: boolean;
  /** Label for the current match time/period while this clip plays, e.g. "12'" or "2nd half 34'". */
  minuteMarker?: string;
  /** Whether to show the scorer callout overlay after goals that occur in this clip (defaults to true if undefined). */
  showScorerAfterGoal?: boolean;
};

export type GoalSide = 'home' | 'away';

/** A goal event as authored in the editor project JSON. */
export type GoalEvent = {
  id?: string;
  /** References the clip that contains this goal. */
  clipId: string;
  /** Time (seconds) into the clip where the goal occurs. */
  timeInClip: number;
  side: GoalSide;
  scorerName?: string;
};

/** Global music track played across the whole reel */
export type MusicTrackData = {
  /** URL or path to the audio file */
  src: string;
  /** Volume 0–1 */
  volume?: number;
  /** Source-track offset in seconds (skips this many seconds into the audio file before playing) */
  trimStart?: number;
  /** Reel-timeline start in seconds (music begins this many seconds into the reel; default 0) */
  startInReel?: number;
  /** Reel-timeline end in seconds (music stops at this point in the reel; default: end of reel) */
  endInReel?: number;
  /** Seconds over which music fades to silence before endInReel (or end of reel) */
  fadeOutDuration?: number;
  /** If true, play original clip audio (unmute clips). Default false. */
  clipAudioOn?: boolean;
  /** If true, loop the music to fill the reel */
  loop?: boolean;
};

/** Scoreboard overlay (e.g. team names, score, clock) */
export type ScoreboardOverlayData = {
  visible?: boolean;
  homeTeamName?: string;
  awayTeamName?: string;
  homeScore?: number;
  awayScore?: number;
  /** e.g. "Q3 4:32" or "45'" */
  clockOrPeriod?: string;
  /** Custom label */
  label?: string;
  /** Optional: show a scorer callout when a goal happens. */
  scorerName?: string;
  scorerSide?: GoalSide;
};

/** Lower-thirds overlay (e.g. player name, title) */
export type LowerThirdsOverlayData = {
  visible?: boolean;
  title?: string;
  subtitle?: string;
  /** Optional image URL */
  imageUrl?: string;
};

/** Outro card shown at the end of the reel */
export type OutroCardData = {
  /** Final score string, e.g. "2 – 1" */
  finalScore?: string;
  /** Up to 8 sponsor logo URLs */
  sponsorLogoUrls?: string[];
  /** Duration in seconds */
  durationSeconds: number;
};

/** Full highlight reel input — matches editor export shape */
export type HighlightReelData = {
  /** Intro card shown first */
  intro: IntroCardData;
  /** Outro card shown last */
  outro?: OutroCardData;
  /** Ordered list of video clips */
  clips: ClipData[];
  /** Goal events (used for cumulative scoreboard) */
  goals?: GoalEvent[];
  /** Optional global music track */
  music?: MusicTrackData;
  /** Optional scoreboard overlay (can be shown per-clip later; here we have one global config) */
  scoreboard?: ScoreboardOverlayData;
  /** Optional lower-thirds overlay config */
  lowerThirds?: LowerThirdsOverlayData;
  /** Optional FPS override (default 30) */
  fps?: number;
};
