import React from 'react';
import { AbsoluteFill, OffthreadVideo } from 'remotion';
import type { ClipData } from '../types/reel';

type ClipSegmentProps = ClipData & {
  /** FPS for frame-based trim */
  fps: number;
  /** If true, play the clip's original audio track. Default false. */
  clipAudioOn?: boolean;
};

/**
 * Renders a single clip with trimStart/trimEnd support.
 * trimStart/trimEnd are in seconds; we convert to frames for OffthreadVideo (trimBefore/trimAfter).
 */
export const ClipSegment: React.FC<ClipSegmentProps> = ({
  src,
  trimStart = 0,
  trimEnd,
  fps,
  clipAudioOn = false,
}) => {
  const trimBeforeFrames = Math.round(trimStart * fps);
  const trimAfterFrames = trimEnd != null ? Math.round(trimEnd * fps) : undefined;

  return (
    <AbsoluteFill>
      <OffthreadVideo
        src={src}
        trimBefore={trimBeforeFrames}
        trimAfter={trimAfterFrames}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        muted={!clipAudioOn}
      />
    </AbsoluteFill>
  );
};
