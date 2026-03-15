import React from 'react';
import { AbsoluteFill, Sequence, Audio, useCurrentFrame, interpolate } from 'remotion';
import type { GoalEvent, HighlightReelData } from '../types/reel';
import { IntroCard } from '../components/IntroCard';
import { ClipSegment } from '../components/ClipSegment';
import { ScoreboardOverlay } from '../components/ScoreboardOverlay';
import { LowerThirdsOverlay } from '../components/LowerThirdsOverlay';

export type HighlightReelProps = HighlightReelData & {
  /** Output preset id: 'landscape' | 'square' | 'vertical' */
  presetId?: string;
};

const FPS = 30;

type AbsoluteGoal = GoalEvent & {
  /** Frame (in reel timeline) when the goal happens */
  atFrame: number;
};

function getClipDurationSeconds(clip: HighlightReelData['clips'][0]): number {
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

function buildAbsoluteGoals(params: {
  goals: GoalEvent[] | undefined;
  clips: HighlightReelData['clips'];
  clipStartFrames: number[];
  fps: number;
}): AbsoluteGoal[] {
  const { goals, clips, clipStartFrames, fps } = params;
  if (!goals?.length) return [];

  const clipIdToStartFrame = new Map<string, number>();
  for (let i = 0; i < clips.length; i++) {
    const id = clips[i]?.id;
    if (id) clipIdToStartFrame.set(id, clipStartFrames[i] ?? 0);
  }

  const out: AbsoluteGoal[] = [];
  for (const g of goals) {
    const start = clipIdToStartFrame.get(g.clipId);
    if (start == null) continue;
    const atFrame = start + Math.round(g.timeInClip * fps);
    out.push({ ...g, atFrame });
  }

  out.sort((a, b) => a.atFrame - b.atFrame);
  return out;
}

const CumulativeScoreboard: React.FC<{
  fps: number;
  clipStartFrames: number[];
  clips: HighlightReelData['clips'];
  goals: GoalEvent[] | undefined;
  scoreboard: HighlightReelData['scoreboard'] | undefined;
}> = ({ fps, clipStartFrames, clips, goals, scoreboard }) => {
  const frame = useCurrentFrame();

  const absoluteGoals = React.useMemo(
    () => buildAbsoluteGoals({ goals, clips, clipStartFrames, fps }),
    [goals, clips, clipStartFrames, fps]
  );

  const baseHome = scoreboard?.homeScore ?? 0;
  const baseAway = scoreboard?.awayScore ?? 0;

  let home = baseHome;
  let away = baseAway;
  let lastGoal: AbsoluteGoal | null = null;

  for (const g of absoluteGoals) {
    if (g.atFrame > frame) break;
    lastGoal = g;
    if (g.side === 'home') home += 1;
    if (g.side === 'away') away += 1;
  }

  // Show scorer callout for 5 seconds after the goal happens (matches editor preview).
  const showScorerForFrames = Math.round(5 * fps);
  const scorer =
    lastGoal && frame - lastGoal.atFrame >= 0 && frame - lastGoal.atFrame <= showScorerForFrames
      ? lastGoal
      : null;

  // Determine which clip is currently active at this frame to drive
  // per‑clip scoreboard behaviour (visibility, clock label, scorer callout).
  let currentClip: HighlightReelData['clips'][0] | null = null;
  for (let i = 0; i < clips.length; i++) {
    const start = clipStartFrames[i] ?? 0;
    const durationSeconds = getClipDurationSeconds(clips[i]!);
    const durationFrames = Math.ceil(durationSeconds * fps);
    const end = start + durationFrames;
    if (frame >= start && frame < end) {
      currentClip = clips[i]!;
      break;
    }
  }

  // Intro/outro clips must never show scoreboard or scorer — enforced here in
  // the renderer regardless of per-clip showScoreboard / showScorerAfterGoal flags.
  const isNonNormalClip =
    currentClip?.role === 'intro' || currentClip?.role === 'outro';

  const clipShowScoreboard = isNonNormalClip
    ? false
    : currentClip?.showScoreboard === undefined
      ? true
      : Boolean(currentClip.showScoreboard);
  const clipMinuteMarker = currentClip?.minuteMarker;
  const clipAllowsScorer = isNonNormalClip
    ? false
    : currentClip?.showScorerAfterGoal === undefined
      ? true
      : Boolean(currentClip.showScorerAfterGoal);

  // Default false: only show when the adapter explicitly set visible: true.
  // ?? true would render a blank overlay (0–0, no team names) when scoreboard is undefined.
  const visible = (scoreboard?.visible ?? false) && clipShowScoreboard;
  const clockOrPeriod = clipMinuteMarker ?? scoreboard?.clockOrPeriod;

  const effectiveScorer = clipAllowsScorer ? scorer : null;

  return (
    <ScoreboardOverlay
      {...(scoreboard ?? {})}
      visible={visible}
      clockOrPeriod={clockOrPeriod}
      homeScore={home}
      awayScore={away}
      scorerName={effectiveScorer?.scorerName}
      scorerSide={effectiveScorer?.side}
    />
  );
};

/**
 * Renders the music audio with fade-out support.
 * Must live inside a Sequence so useCurrentFrame() is relative to music start.
 */
const MusicTrack: React.FC<{
  music: HighlightReelData['music'] & {};
  fps: number;
  /** Total playback frames for this music Sequence (used for fade-out math) */
  durationFrames: number;
}> = ({ music, fps, durationFrames }) => {
  const frame = useCurrentFrame();
  const baseVolume = music!.volume ?? 0.6;
  const fadeFrames =
    music!.fadeOutDuration != null && music!.fadeOutDuration > 0
      ? Math.round(music!.fadeOutDuration * fps)
      : 0;

  const volume =
    fadeFrames > 0
      ? interpolate(
          frame,
          [Math.max(0, durationFrames - fadeFrames), durationFrames],
          [baseVolume, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        )
      : baseVolume;

  return (
    <Audio
      src={music!.src}
      volume={volume}
      loop={music!.loop ?? false}
      trimBefore={
        music!.trimStart != null ? Math.round(music!.trimStart * fps) : undefined
      }
    />
  );
};

export function getHighlightReelDurationInFrames(props: HighlightReelProps): number {
  const fps = props.fps ?? FPS;
  let total = 0;
  // durationSeconds === 0 means the intro was disabled by the editor.
  const introDuration = props.intro?.durationSeconds ?? 3;
  if (introDuration > 0) total += Math.ceil(introDuration * fps);
  const clips = (props.clips ?? []).filter((c) => c.src?.trim());
  for (const clip of clips) {
    total += Math.ceil(getClipDurationSeconds(clip) * fps);
  }
  return total;
}

export const HighlightReel: React.FC<HighlightReelProps> = (props) => {
  const fps = props.fps ?? FPS;
  const introDuration = props.intro?.durationSeconds ?? 3;
  const introDurationFrames = introDuration > 0 ? Math.ceil(introDuration * fps) : 0;

  const allClips = props.clips ?? [];
  const clips = allClips.filter((c) => c.src?.trim());
  const clipStartFrames: number[] = [];
  let acc = introDurationFrames;
  for (let i = 0; i < clips.length; i++) {
    clipStartFrames.push(acc);
    acc += Math.ceil(getClipDurationSeconds(clips[i]) * fps);
  }

  // Music timeline: startInReel/endInReel are reel positions (not source positions).
  const totalReelFrames = getHighlightReelDurationInFrames(props);
  const musicStartFrame = props.music?.startInReel != null
    ? Math.round(props.music.startInReel * fps)
    : 0;
  const musicEndFrame = props.music?.endInReel != null
    ? Math.round(props.music.endInReel * fps)
    : totalReelFrames;
  const musicDurationFrames = Math.max(0, musicEndFrame - musicStartFrame);

  return (
    <AbsoluteFill>
      {/* Intro card — skipped entirely when durationSeconds is 0 (disabled in editor) */}
      {introDurationFrames > 0 && (
        <Sequence from={0} durationInFrames={introDurationFrames} name="Intro">
          <IntroCard {...props.intro} durationFrames={introDurationFrames} />
        </Sequence>
      )}

      {/* Ordered video clips with trim — use clip.src from project JSON */}
      {clips.map((clip, index) => {
        const durationSeconds = getClipDurationSeconds(clip);
        const durationFrames = Math.ceil(durationSeconds * fps);
        const from = clipStartFrames[index];
        return (
          <Sequence
            key={clip.name ?? index}
            from={from}
            durationInFrames={durationFrames}
            name={clip.name ?? `Clip ${index + 1}`}
          >
            <ClipSegment
              src={clip.src!}
              trimStart={clip.trimStart ?? 0}
              trimEnd={clip.trimEnd}
              fps={fps}
              durationFrames={durationFrames}
              clipAudioOn={props.music?.clipAudioOn ?? false}
              muteAudio={clip.muteAudio ?? false}
            />
          </Sequence>
        );
      })}

      {/* Global music track: Sequence controls reel start/end; MusicTrack handles source trim + fade */}
      {props.music?.src && musicDurationFrames > 0 ? (
        <Sequence from={musicStartFrame} durationInFrames={musicDurationFrames} name="Music">
          <MusicTrack music={props.music} fps={fps} durationFrames={musicDurationFrames} />
        </Sequence>
      ) : null}

      {/* Overlay layers: scoreboard and lower-thirds; set visible: true and pass data to show. */}
      {/* Start after the intro so the scoreboard doesn't overlay the intro card. */}
      <Sequence from={introDurationFrames} durationInFrames={Infinity} name="Scoreboard" layout="none">
        <CumulativeScoreboard
          fps={fps}
          clipStartFrames={clipStartFrames}
          clips={clips}
          goals={props.goals}
          scoreboard={props.scoreboard}
        />
      </Sequence>
      <Sequence from={0} durationInFrames={Infinity} name="Lower thirds" layout="none">
        <LowerThirdsOverlay {...(props.lowerThirds ?? {})} />
      </Sequence>
    </AbsoluteFill>
  );
};
