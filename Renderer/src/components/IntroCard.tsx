import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate } from 'remotion';
import type { IntroCardData } from '../types/reel';

/** Frames for fade-in/out — matches ClipSegment for seamless dissolves. */
const TRANSITION_FRAMES = 15;

type IntroCardProps = IntroCardData & {
  /** Total duration of the intro in frames — used to time the fade-out. */
  durationFrames: number;
};

export const IntroCard: React.FC<IntroCardProps> = ({
  title,
  subtitle,
  homeBadgeUrl,
  awayBadgeUrl,
  imageUrl,
  backgroundColor = '#0a0a0a',
  durationFrames,
}) => {
  const frame = useCurrentFrame();

  // Fade in at the very start, fade out at the end into the first clip.
  const opacity = interpolate(
    frame,
    [0, TRANSITION_FRAMES, Math.max(TRANSITION_FRAMES, durationFrames - TRANSITION_FRAMES), durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Prefer explicit homeBadgeUrl; fall back to legacy imageUrl for old projects.
  const effectiveHomeBadge = homeBadgeUrl || imageUrl || null;
  const effectiveAwayBadge = awayBadgeUrl || null;

  const hasBothBadges = Boolean(effectiveHomeBadge && effectiveAwayBadge);
  const hasOneBadge = !hasBothBadges && Boolean(effectiveHomeBadge || effectiveAwayBadge);
  const singleBadge = effectiveHomeBadge || effectiveAwayBadge || null;

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 48,
        flexDirection: 'column',
        opacity,
      }}
    >
      {/* Dual badge layout */}
      {hasBothBadges ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 40,
            marginBottom: 28,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Img
              src={effectiveHomeBadge!}
              style={{ width: 96, height: 96, objectFit: 'contain' }}
            />
            <span
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 18,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.85)',
                textAlign: 'center',
              }}
            >
              {title}
            </span>
          </div>

          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 32,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.4)',
            }}
          >
            vs
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <Img
              src={effectiveAwayBadge!}
              style={{ width: 96, height: 96, objectFit: 'contain' }}
            />
            {subtitle && (
              <span
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: 18,
                  fontWeight: 600,
                  color: 'rgba(255,255,255,0.85)',
                  textAlign: 'center',
                  // Subtitle in dual-badge mode is the opponent name — pull first segment
                  // (split on · separator that the adapter joins).
                }}
              >
                {subtitle.split(' · ')[0]}
              </span>
            )}
          </div>
        </div>
      ) : hasOneBadge ? (
        /* Single badge (legacy / home-only) */
        <div style={{ marginBottom: 24 }}>
          <Img
            src={singleBadge!}
            style={{ maxWidth: 200, maxHeight: 120, objectFit: 'contain' }}
          />
        </div>
      ) : null}

      {/* Main title — hidden in dual-badge mode (shown inline above each badge) */}
      {!hasBothBadges && (
        <h1
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 56,
            fontWeight: 700,
            color: '#fff',
            margin: 0,
            textAlign: 'center',
          }}
        >
          {title}
        </h1>
      )}

      {/* Subtitle (match date, score, age group…) */}
      {subtitle ? (
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 24,
            color: 'rgba(255,255,255,0.8)',
            marginTop: hasBothBadges ? 12 : 16,
            textAlign: 'center',
          }}
        >
          {/* In dual-badge mode the first segment (opponent name) is shown above,
              so show the rest of the subtitle (score, date, age group). */}
          {hasBothBadges
            ? subtitle.split(' · ').slice(1).join(' · ')
            : subtitle}
        </p>
      ) : null}
    </AbsoluteFill>
  );
};
