/**
 * Shared timing helpers used by both the renderer (HighlightReel composition)
 * and should mirror the logic in Editor/src/App.tsx so that the preview and
 * the final render stay in perfect sync.
 *
 * ## Timing contract
 *
 * `GoalEvent.timeInClip` is an **absolute source-video timestamp** (seconds
 * from the start of the original source file), NOT a clip-relative offset.
 * This matches the value stored by the editor when the user marks a goal:
 *   `setPendingGoal({ clipId, timeInClip: videoRef.current.currentTime })`
 *
 * To convert to a clip-relative playback offset:
 *   clip-relative offset = timeInClip - clip.trimStart
 *
 * To convert to an absolute reel frame:
 *   atFrame = clipStartFrame + Math.round((timeInClip - trimStart) * fps)
 *
 * ## Reel timeline layout
 *
 *   [intro-role clips] → [intro card] → [normal clips] → [outro card] → [outro-role clips]
 *
 * This layout is identical in the editor preview (App.tsx reelClipStartTimes)
 * and in the renderer (HighlightReel.tsx clipStartFrames).
 */

// ─── Types (minimal — callers supply their own full types) ────────────────────

export type TimingClip = {
  id?: string;
  trimStart?: number;
  trimEnd?: number;
  durationSeconds?: number;
};

export type TimingGoal = {
  clipId: string;
  timeInClip: number;
  side: 'home' | 'away';
  scorerName?: string;
  id?: string;
};

export type AbsoluteGoal = TimingGoal & {
  /** Absolute reel frame at which this goal occurs. */
  atFrame: number;
};

// ─── Clip duration ────────────────────────────────────────────────────────────

/**
 * Returns the reel-playback duration (seconds) for a clip.
 *
 * Priority:
 *   1. clip.durationSeconds (explicit override — rarely set)
 *   2. trimEnd − trimStart  (trimmed window)
 *   3. trimEnd alone         (clip plays from 0 to trimEnd)
 *   4. 5-second fallback     (last resort)
 *
 * IMPORTANT: never pass clip.duration (the source file length) as
 * durationSeconds; that causes the Sequence to span the full file length even
 * for trimmed clips, resulting in frozen last-frame video.
 */
export function getClipDurationSeconds(clip: TimingClip): number {
  if (clip.durationSeconds != null && clip.durationSeconds > 0) {
    return clip.durationSeconds;
  }
  if (clip.trimEnd != null && clip.trimStart != null) {
    return Math.max(0, clip.trimEnd - clip.trimStart);
  }
  if (clip.trimEnd != null) {
    return Math.max(0, clip.trimEnd - (clip.trimStart ?? 0));
  }
  return 5;
}

// ─── Reel start-frame map ─────────────────────────────────────────────────────

export type ClipStartFrameResult = {
  /** All clips in reel playback order: intro-role → normal → outro-role */
  allOrderedClips: TimingClip[];
  /**
   * clipStartFrames[i] is the absolute reel frame at which allOrderedClips[i]
   * begins playback.  Indices align 1-to-1 with allOrderedClips.
   */
  clipStartFrames: number[];
  /**
   * Frame at which normal-clip content starts (after intro-role clips + intro
   * card).  Used to suppress the scoreboard overlay during the intro card.
   */
  normalClipsStartFrame: number;
};

/**
 * Builds the per-clip start-frame map for a reel composed of:
 *
 *   [introRoleClips] [introDurationFrames gap] [normalClips]
 *   [outroDurationFrames gap] [outroRoleClips]
 *
 * This exactly mirrors the layout in Editor/src/App.tsx (`reelClipStartTimes`).
 */
export function buildClipStartFrames(params: {
  introRoleClips: TimingClip[];
  normalClips: TimingClip[];
  outroRoleClips: TimingClip[];
  introDurationFrames: number;
  outroDurationFrames: number;
  fps: number;
}): ClipStartFrameResult {
  const { introRoleClips, normalClips, outroRoleClips, introDurationFrames, outroDurationFrames, fps } = params;

  const allOrderedClips: TimingClip[] = [
    ...introRoleClips,
    ...normalClips,
    ...outroRoleClips,
  ];
  const clipStartFrames: number[] = [];
  let acc = 0;

  for (const c of introRoleClips) {
    clipStartFrames.push(acc);
    acc += Math.ceil(getClipDurationSeconds(c) * fps);
  }

  // Gap: intro card
  const introCardStartFrame = acc;
  acc += introDurationFrames;

  const normalClipsStartFrame = acc;

  for (const c of normalClips) {
    clipStartFrames.push(acc);
    acc += Math.ceil(getClipDurationSeconds(c) * fps);
  }

  // Gap: outro card
  acc += outroDurationFrames;

  for (const c of outroRoleClips) {
    clipStartFrames.push(acc);
    acc += Math.ceil(getClipDurationSeconds(c) * fps);
  }

  void introCardStartFrame; // used externally via normalClipsStartFrame

  return { allOrderedClips, clipStartFrames, normalClipsStartFrame };
}

// ─── Goal → reel frame mapping ────────────────────────────────────────────────

/**
 * Maps each goal to the absolute reel frame at which it fires.
 *
 * `goal.timeInClip` is an absolute source timestamp; subtracting `trimStart`
 * gives the clip-relative offset, which is then added to the clip's reel
 * start frame.
 *
 * Goals whose clipId is not found in the provided clips are silently dropped.
 * The result is sorted chronologically by atFrame.
 */
export function buildAbsoluteGoals(params: {
  goals: TimingGoal[] | undefined;
  clips: TimingClip[];
  clipStartFrames: number[];
  fps: number;
}): AbsoluteGoal[] {
  const { goals, clips, clipStartFrames, fps } = params;
  if (!goals?.length) return [];

  const clipIdToStartFrame = new Map<string, number>();
  const clipIdToTrimStart = new Map<string, number>();
  for (let i = 0; i < clips.length; i++) {
    const clip = clips[i];
    const id = clip?.id;
    if (id) {
      clipIdToStartFrame.set(id, clipStartFrames[i] ?? 0);
      clipIdToTrimStart.set(id, clip?.trimStart ?? 0);
    }
  }

  const out: AbsoluteGoal[] = [];
  for (const g of goals) {
    const startFrame = clipIdToStartFrame.get(g.clipId);
    if (startFrame == null) continue;
    const trimStart = clipIdToTrimStart.get(g.clipId) ?? 0;
    // timeInClip is absolute source time; subtract trimStart for clip-relative offset.
    const atFrame = startFrame + Math.round((g.timeInClip - trimStart) * fps);
    out.push({ ...g, atFrame });
  }

  out.sort((a, b) => a.atFrame - b.atFrame);
  return out;
}

// ─── Debug logging helpers ────────────────────────────────────────────────────

export type GoalDebugInfo = {
  goalId: string | undefined;
  clipId: string;
  timeInClip: number;
  trimStart: number;
  clipStartFrame: number;
  atFrame: number;
  atSeconds: number;
  scorerVisibleFromFrame: number;
  scorerVisibleToFrame: number;
  fps: number;
};

/**
 * Produces a structured debug record for each absolute goal, suitable for
 * console logging during a render.  Call this once (at frame 0) to avoid
 * flooding the log.
 */
export function buildGoalDebugInfo(params: {
  absoluteGoals: AbsoluteGoal[];
  clips: TimingClip[];
  clipStartFrames: number[];
  fps: number;
  scorerDisplaySeconds?: number;
}): GoalDebugInfo[] {
  const { absoluteGoals, clips, clipStartFrames, fps, scorerDisplaySeconds = 5 } = params;
  const showFrames = Math.round(scorerDisplaySeconds * fps);

  const clipIdToTrimStart = new Map<string, number>();
  const clipIdToStartFrame = new Map<string, number>();
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    if (c?.id) {
      clipIdToTrimStart.set(c.id, c.trimStart ?? 0);
      clipIdToStartFrame.set(c.id, clipStartFrames[i] ?? 0);
    }
  }

  return absoluteGoals.map((g) => ({
    goalId: g.id,
    clipId: g.clipId,
    timeInClip: g.timeInClip,
    trimStart: clipIdToTrimStart.get(g.clipId) ?? 0,
    clipStartFrame: clipIdToStartFrame.get(g.clipId) ?? 0,
    atFrame: g.atFrame,
    atSeconds: g.atFrame / fps,
    scorerVisibleFromFrame: g.atFrame,
    scorerVisibleToFrame: g.atFrame + showFrames,
    fps,
  }));
}
