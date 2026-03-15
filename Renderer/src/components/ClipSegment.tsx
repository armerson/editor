import React from 'react';
import { AbsoluteFill, OffthreadVideo, useCurrentFrame, interpolate } from 'remotion';
import type { ClipData } from '../types/reel';

/** Number of frames for fade-in at clip start and fade-out at clip end. */
const TRANSITION_FRAMES = 15; // 0.5 s at 30 fps

type ClipSegmentProps = ClipData & {
  /** FPS for frame-based trim */
  fps: number;
  /** Total duration of this clip in frames — used to time the fade-out. */
  durationFrames: number;
  /** If true, play the clip's original audio track (global setting). Default false. */
  clipAudioOn?: boolean;
};

/**
 * Renders a single clip with trimStart/trimEnd support.
 * Fades in over the first TRANSITION_FRAMES and out over the last TRANSITION_FRAMES
 * so consecutive clips dissolve through black rather than hard-cutting.
 */
export const ClipSegment: React.FC<ClipSegmentProps> = ({
  src,
  trimStart = 0,
  trimEnd,
  fps,
  durationFrames,
  clipAudioOn = false,
  muteAudio = false,
}) => {
  const frame = useCurrentFrame();
  const trimBeforeFrames = Math.round(trimStart * fps);
  const trimAfterFrames = trimEnd != null ? Math.round(trimEnd * fps) : undefined;

  // Fade in at start, fade out at end.
  const opacity = interpolate(
    frame,
    [0, TRANSITION_FRAMES, Math.max(TRANSITION_FRAMES, durationFrames - TRANSITION_FRAMES), durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // A clip is muted if the per-clip flag is set OR the global clipAudioOn is false.
  const isMuted = !clipAudioOn || muteAudio;

  return (
    <AbsoluteFill style={{ opacity }}>
      <OffthreadVideo
        src={src}
        trimBefore={trimBeforeFrames}
        trimAfter={trimAfterFrames}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        muted={isMuted}
      />
    </AbsoluteFill>
  );
};
