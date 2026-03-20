import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';
import type { OutroCardData } from '../types/reel';

const IMG_TIMEOUT_MS = 90_000;
const FADE_FRAMES = 15;

type OutroCardProps = OutroCardData & {
  durationFrames: number;
  fps?: number;
};

export const OutroCard: React.FC<OutroCardProps> = ({
  finalScore,
  sponsorLogoUrls = [],
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const s = Math.min(width, height) / 1080;

  // Fade in at start, fade out at end
  const fadeIn = interpolate(frame, [0, FADE_FRAMES], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationFrames - FADE_FRAMES), durationFrames],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );
  const opacity = Math.min(fadeIn, fadeOut);

  // Staggered fade-up animations
  const labelDelay = 4;
  const scoreDelay = 8;
  const dividerDelay = 14;
  const thanksDelay = 20;
  const sponsorsDelay = 28;

  function fadeUp(startFrame: number): React.CSSProperties {
    const op = interpolate(frame, [startFrame, startFrame + 12], [0, 1], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    const y = interpolate(frame, [startFrame, startFrame + 12], [10, 0], {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
    });
    return { opacity: op, transform: `translateY(${y}px)` };
  }

  const validLogos = sponsorLogoUrls.filter(Boolean);

  // Grid sizing — scale logo tiles based on count
  const logoH = Math.round((validLogos.length > 4 ? 80 : 100) * s);
  const logoMaxW = Math.round(logoH * 2.8);

  return (
    <AbsoluteFill
      style={{
        background: '#0a0a0f',
        opacity,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: Math.round(48 * s),
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Radial spotlight */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse 65% 50% at 50% 44%, rgba(99,102,241,0.10) 0%, rgba(250,204,21,0.04) 45%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* Final Score label */}
      {finalScore && (
        <span style={{
          ...fadeUp(labelDelay),
          fontSize: Math.round(30 * s),
          fontWeight: 700,
          letterSpacing: Math.round(4 * s),
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.35)',
        }}>
          Final Score
        </span>
      )}

      {/* Score value */}
      {finalScore && (
        <span style={{
          ...fadeUp(scoreDelay),
          fontSize: Math.round(160 * s),
          fontWeight: 800,
          color: '#facc15',
          lineHeight: 1.1,
          letterSpacing: -2,
          fontVariantNumeric: 'tabular-nums',
          marginTop: Math.round(4 * s),
        }}>
          {finalScore}
        </span>
      )}

      {/* Divider */}
      <div style={{
        ...fadeUp(dividerDelay),
        width: Math.round(280 * s),
        height: 1,
        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.10) 30%, rgba(255,255,255,0.10) 70%, transparent 100%)',
        margin: `${Math.round(28 * s)}px 0`,
        flexShrink: 0,
      }} />

      {/* Thanks heading */}
      <span style={{
        ...fadeUp(thanksDelay),
        fontSize: Math.round(28 * s),
        fontWeight: 600,
        color: 'rgba(255,255,255,0.65)',
        letterSpacing: Math.round(0.5 * s),
        marginBottom: Math.round(24 * s),
      }}>
        Thanks to our Sponsors
      </span>

      {/* Sponsor logos */}
      {validLogos.length > 0 && (
        <div style={{
          ...fadeUp(sponsorsDelay),
          display: 'flex',
          flexWrap: 'wrap' as const,
          gap: Math.round(16 * s),
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: Math.round(900 * s),
        }}>
          {validLogos.map((url, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.06)',
              borderRadius: Math.round(10 * s),
              padding: Math.round(10 * s),
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Img
                src={url}
                delayRenderTimeoutInMilliseconds={IMG_TIMEOUT_MS}
                style={{
                  height: logoH,
                  maxWidth: logoMaxW,
                  objectFit: 'contain',
                  opacity: 0.9,
                }}
              />
            </div>
          ))}
        </div>
      )}
    </AbsoluteFill>
  );
};
