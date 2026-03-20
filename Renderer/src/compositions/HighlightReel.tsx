import React from 'react';
import { AbsoluteFill, Img, Sequence, Audio, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';
import type { GoalEvent, HighlightReelData } from '../types/reel';
import { IntroCard } from '../components/IntroCard';
import { ClipSegment } from '../components/ClipSegment';
import { ScoreboardOverlay } from '../components/ScoreboardOverlay';
import { LowerThirdsOverlay } from '../components/LowerThirdsOverlay';

// ─── Sponsor logo overlay ──────────────────────────────────────────────────────
const SPONSOR_IMG_TIMEOUT_MS = 90_000;

const SponsorLogoOverlay: React.FC<{ src: string }> = ({ src }) => {
  const { width, height } = useVideoConfig();
  const s = Math.min(width, height) / 1080;
  const logoPx = Math.round(120 * s);
  const pad = Math.round(24 * s);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute',
        bottom: pad,
        right: pad,
        background: 'rgba(0,0,0,0.45)',
        borderRadius: Math.round(8 * s),
        padding: Math.round(6 * s),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Img
          src={src}
          delayRenderTimeoutInMilliseconds={SPONSOR_IMG_TIMEOUT_MS}
          style={{ height: logoPx, maxWidth: Math.round(logoPx * 2.5), objectFit: 'contain' }}
        />
      </div>
    </AbsoluteFill>
  );
};

// ─── Renderer-side diagnostics ────────────────────────────────────────────────
// These console calls run inside headless Chrome during the render; the server
// captures them via onBrowserLog and writes them to the structured log with the
// job ID so failures can be traced to specific clips or frames.
function logOnce(frame: number, message: string): void {
  if (frame === 0) console.log(`[HighlightReel] ${message}`)
}
function warnOnce(frame: number, message: string): void {
  if (frame === 0) console.warn(`[HighlightReel] ${message}`)
}

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
    const start = clipIdToStartFrame.get(g.clipId);
    if (start == null) continue;
    // timeInClip is an absolute source-video timestamp; subtract trimStart to get
    // the clip-relative offset, then add the clip's start frame in the reel.
    const trimStart = clipIdToTrimStart.get(g.clipId) ?? 0;
    const atFrame = start + Math.round((g.timeInClip - trimStart) * fps);
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
  // Absolute frame at which the scoreboard becomes active (= intro duration in frames).
  introDurationFrames: number;
}> = ({ fps, clipStartFrames, clips, goals, scoreboard, introDurationFrames }) => {
  // CumulativeScoreboard is rendered without a parent Sequence so useCurrentFrame()
  // returns the ABSOLUTE composition frame — consistent with the absolute clipStartFrames
  // and goal atFrame values derived from the adapter.
  const frame = useCurrentFrame();

  const absoluteGoals = React.useMemo(
    () => buildAbsoluteGoals({ goals, clips, clipStartFrames, fps }),
    [goals, clips, clipStartFrames, fps]
  );

  // ── 1. Accumulate goals up to this frame ──────────────────────────────────
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

  // ── 2. Determine which clip is active at this absolute frame ───────────────
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

  // ── 3. Scorer callout ─────────────────────────────────────────────────────
  // Show for 5 seconds after a goal. Only show when the goal happened in the
  // current clip — the editor only shows the scorer within the clip that
  // contains the goal, not in subsequent clips.
  const showScorerForFrames = Math.round(5 * fps);
  const scorer =
    lastGoal &&
    frame - lastGoal.atFrame >= 0 &&
    frame - lastGoal.atFrame <= showScorerForFrames &&
    lastGoal.clipId === currentClip?.id
      ? lastGoal
      : null;

  // ── 4. Per-clip visibility flags ──────────────────────────────────────────
  // Hide everything during the intro (no clip active before clipStartFrames[0]).
  if (frame < introDurationFrames) return null;

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
  const frame = useCurrentFrame();
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

  // ── Diagnostics (captured by server onBrowserLog) ─────────────────────────
  logOnce(frame, `clips=${clips.length} intro=${introDurationFrames}f total=${acc}f fps=${fps}`)
  logOnce(frame, `scoreboard: home=${props.scoreboard?.homeTeamName ?? '(none)'} ${props.scoreboard?.homeScore ?? 0} – away=${props.scoreboard?.awayTeamName ?? '(none)'} ${props.scoreboard?.awayScore ?? 0} visible=${props.scoreboard?.visible ?? false}`)
  logOnce(frame, `goals=${props.goals?.length ?? 0} clipAudioOn=${props.music?.clipAudioOn ?? false}`)
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    logOnce(frame, `clip[${i + 1}] "${c.name ?? '?'}" src=${c.src ? 'ok' : 'MISSING'} trim=${c.trimStart ?? 0}-${c.trimEnd ?? '?'} role=${c.role ?? 'normal'} muteAudio=${c.muteAudio ?? false}`)
  }
  if (props.goals?.length) {
    for (const g of props.goals) {
      logOnce(frame, `goal: clipId=${g.clipId} t=${g.timeInClip}s side=${g.side} scorer=${g.scorerName ?? '(none)'}`)
    }
  }
  // Warn about dropped clips (had no src after filtering)
  const droppedCount = allClips.length - clips.length;
  if (droppedCount > 0) {
    warnOnce(frame, `${droppedCount} clip(s) dropped due to missing src`)
  }
  // Determine which clip is rendering right now (for per-frame diagnostics)
  React.useMemo(() => {
    for (let i = 0; i < clips.length; i++) {
      const start = clipStartFrames[i] ?? 0;
      const dur = Math.ceil(getClipDurationSeconds(clips[i]) * fps);
      if (frame >= start && frame < start + dur && frame === start) {
        console.log(`[HighlightReel] → starting clip[${i + 1}] "${clips[i].name ?? '?'}" at frame ${frame}`)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame])

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
          <IntroCard {...props.intro} durationFrames={introDurationFrames} fps={fps} />
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

      {/* Scoreboard overlay: rendered from frame 0 without a Sequence offset so that
          useCurrentFrame() inside CumulativeScoreboard returns absolute frames (matching
          clipStartFrames and goal atFrame values). Intro hiding is handled internally. */}
      <CumulativeScoreboard
        fps={fps}
        clipStartFrames={clipStartFrames}
        clips={clips}
        goals={props.goals}
        scoreboard={props.scoreboard}
        introDurationFrames={introDurationFrames}
      />
      <Sequence from={0} durationInFrames={Infinity} name="Lower thirds" layout="none">
        <LowerThirdsOverlay {...(props.lowerThirds ?? {})} />
      </Sequence>

      {/* Sponsor logo — bottom-right corner, shown only on clip frames (not intro) */}
      {props.intro?.sponsorLogoUrl && introDurationFrames < totalReelFrames && (
        <Sequence from={introDurationFrames} durationInFrames={totalReelFrames - introDurationFrames} name="Sponsor" layout="none">
          <SponsorLogoOverlay src={props.intro.sponsorLogoUrl} />
        </Sequence>
      )}
    </AbsoluteFill>
  );
};
