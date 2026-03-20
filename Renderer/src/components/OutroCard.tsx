import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate, useVideoConfig } from 'remotion';
import type { OutroCardData } from '../types/reel';

const IMG_TIMEOUT_MS = 90_000;
const FADE_FRAMES = 15;

type OutroCardProps = OutroCardData & {
  durationFrames: number;
  fps?: number;
  homeTeam?: string;
  opponent?: string;
  homeBadgeUrl?: string;
  awayBadgeUrl?: string;
};

export const OutroCard: React.FC<OutroCardProps> = ({
  finalScore,
  sponsorLogoUrls = [],
  durationFrames,
  homeTeam,
  opponent,
  homeBadgeUrl,
  awayBadgeUrl,
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
  const teamsDelay = 2;
  const labelDelay = 8;
  const scoreDelay = 12;
  const dividerDelay = 18;
  const thanksDelay = 24;
  const sponsorsDelay = 32;

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
  const logoH = Math.round((validLogos.length > 4 ? 107 : 133) * s);
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

      {/* Score row: home badge | score | away badge */}
      <div style={{
        ...fadeUp(teamsDelay),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: Math.round(40 * s),
        marginBottom: Math.round(8 * s),
      }}>
        {/* Home side */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(8 * s), minWidth: Math.round(160 * s) }}>
          {homeBadgeUrl && (
            <Img
              src={homeBadgeUrl}
              delayRenderTimeoutInMilliseconds={IMG_TIMEOUT_MS}
              style={{ height: Math.round(96 * s), width: Math.round(96 * s), objectFit: 'contain' }}
            />
          )}
          {homeTeam && (
            <span style={{ fontSize: Math.round(22 * s), fontWeight: 700, color: 'rgba(255,255,255,0.9)', textAlign: 'center', maxWidth: Math.round(200 * s) }}>
              {homeTeam}
            </span>
          )}
        </div>

        {/* Centre: label + score */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
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
        </div>

        {/* Away side */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: Math.round(8 * s), minWidth: Math.round(160 * s) }}>
          {awayBadgeUrl && (
            <Img
              src={awayBadgeUrl}
              delayRenderTimeoutInMilliseconds={IMG_TIMEOUT_MS}
              style={{ height: Math.round(96 * s), width: Math.round(96 * s), objectFit: 'contain' }}
            />
          )}
          {opponent && (
            <span style={{ fontSize: Math.round(22 * s), fontWeight: 700, color: 'rgba(255,255,255,0.9)', textAlign: 'center', maxWidth: Math.round(200 * s) }}>
              {opponent}
            </span>
          )}
        </div>
      </div>

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
        fontSize: Math.round(37 * s),
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
