import React from 'react';
import { AbsoluteFill, Img, useCurrentFrame, interpolate, spring } from 'remotion';
import type { IntroCardData } from '../types/reel';

/** Frames for overall card fade-in / fade-out — dissolves into first clip. */
const TRANSITION_FRAMES = 15;

type IntroCardProps = IntroCardData & {
  /** Total duration of the intro in frames — used to time the fade-out. */
  durationFrames: number;
  /**
   * Frames per second of the composition — passed as a prop rather than
   * read via useVideoConfig() to keep the component purely data-driven and
   * avoid any extra hook invocation overhead in the renderer.
   * Defaults to 30 when not provided (backward-compatible).
   */
  fps?: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function easeOpacity(frame: number, from: number, to: number): number {
  return interpolate(frame, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

function easeTranslate(frame: number, from: number, to: number, distance = 10): number {
  return interpolate(frame, [from, to], [distance, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
}

// ─── Badge placeholder ────────────────────────────────────────────────────────

function BadgePlaceholder({
  label,
  scale,
  opacity,
}: {
  label: string;
  scale: number;
  opacity: number;
}) {
  return (
    <div
      style={{
        width: 200,
        height: 200,
        borderRadius: '50%',
        border: '2px dashed rgba(255,255,255,0.15)',
        background: 'rgba(255,255,255,0.04)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transform: `scale(${scale})`,
        opacity,
        flexShrink: 0,
      }}
    >
      <span style={{ fontFamily: 'system-ui, sans-serif', fontSize: 16, color: 'rgba(255,255,255,0.3)' }}>
        {label}
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const IntroCard: React.FC<IntroCardProps> = ({
  title,
  subtitle,
  homeBadgeUrl,
  awayBadgeUrl,
  imageUrl,
  backgroundColor = '#0a0a0f',
  durationFrames,
  fps: fpsProp = 30,
}) => {
  const frame = useCurrentFrame();

  // ── Overall card fade-in/out ───────────────────────────────────────────────
  const cardOpacity = interpolate(
    frame,
    [0, TRANSITION_FRAMES, Math.max(TRANSITION_FRAMES, durationFrames - TRANSITION_FRAMES), durationFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // ── Per-element entrance animations (relative to card appearing) ──────────
  // At 30fps, 1.2 s = 36 frames. We start counting from TRANSITION_FRAMES when
  // the card is fully visible.
  const animFrame = Math.max(0, frame - TRANSITION_FRAMES);

  // Badges: spring scale (0.72 → 1) with slight stagger
  const homeBadgeScale = spring({
    frame: animFrame,
    fps: fpsProp,
    config: { damping: 18, stiffness: 160, mass: 0.9 },
    from: 0.72,
    to: 1,
  });
  const awayBadgeScale = spring({
    frame: Math.max(0, animFrame - 3),   // 3-frame stagger at 30fps ≈ 0.1 s
    fps: fpsProp,
    config: { damping: 18, stiffness: 160, mass: 0.9 },
    from: 0.72,
    to: 1,
  });

  // Opacity for badges (fade in faster than scale settles)
  const homeBadgeOpacity = easeOpacity(animFrame, 0, 10);
  const awayBadgeOpacity = easeOpacity(animFrame, 3, 13);

  // VS: fade in around frame 10-18
  const vsOpacity = easeOpacity(animFrame, 10, 18);

  // Team labels: fade-up around frame 12-22
  const homeLabelOpacity = easeOpacity(animFrame, 12, 22);
  const homeLabelY = easeTranslate(animFrame, 12, 22, 8);
  const awayLabelOpacity = easeOpacity(animFrame, 14, 24);
  const awayLabelY = easeTranslate(animFrame, 14, 24, 8);

  // Divider: fade in frame 18-24
  const dividerOpacity = easeOpacity(animFrame, 18, 24);

  // Subtitle block: fade-up frame 22-32
  const subtitleOpacity = easeOpacity(animFrame, 22, 34);
  const subtitleY = easeTranslate(animFrame, 22, 34, 10);

  // ── Badge URL resolution ───────────────────────────────────────────────────
  const effectiveHomeBadge = homeBadgeUrl || imageUrl || null;
  const effectiveAwayBadge = awayBadgeUrl || null;
  const hasBothBadges = Boolean(effectiveHomeBadge && effectiveAwayBadge);

  // In dual-badge mode: title = home team name, subtitle = "AwayTeam · Score · Date · AgeGroup"
  const homeName = title;
  const subtitleParts = subtitle ? subtitle.split(' · ') : [];
  const awayName = hasBothBadges ? subtitleParts[0] ?? '' : '';
  const metaLine = hasBothBadges
    ? subtitleParts.slice(1).join(' · ')
    : subtitle ?? '';

  // Decompose metaLine: assume "Score · Date · AgeGroup" ordering
  const metaParts = metaLine.split(' · ');
  const score = metaParts[0] ?? '';
  const matchDate = metaParts[1] ?? '';
  const ageGroup = metaParts[2] ?? '';

  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        opacity: cardOpacity,
        padding: 48,
        overflow: 'hidden',
      }}
    >
      {/* Radial gradient spotlight */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 72% 55% at 50% 46%, rgba(99,102,241,0.10) 0%, rgba(59,130,246,0.04) 40%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* ── Team badge row ────────────────────────────────────────────────── */}
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 56,
          marginBottom: 32,
          width: '100%',
          justifyContent: 'center',
        }}
      >
        {/* Home team */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            width: 220,
          }}
        >
          {effectiveHomeBadge ? (
            <Img
              src={effectiveHomeBadge}
              style={{
                width: 200,
                height: 200,
                objectFit: 'contain',
                borderRadius: '50%',
                boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 2.5px rgba(255,255,255,0.12)',
                background: 'rgba(255,255,255,0.03)',
                transform: `scale(${homeBadgeScale})`,
                opacity: homeBadgeOpacity,
                flexShrink: 0,
              }}
            />
          ) : (
            <BadgePlaceholder label="Home" scale={homeBadgeScale} opacity={homeBadgeOpacity} />
          )}
          {/* Team name: wraps rather than truncates */}
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 22,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.92)',
              textAlign: 'center',
              lineHeight: 1.3,
              letterSpacing: 0.3,
              opacity: homeLabelOpacity,
              transform: `translateY(${homeLabelY}px)`,
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
            }}
          >
            {homeName}
          </span>
        </div>

        {/* VS */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            paddingTop: 80,
            flexShrink: 0,
            opacity: vsOpacity,
          }}
        >
          <span
            style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 34,
              fontWeight: 900,
              color: 'rgba(255,255,255,0.50)',
              letterSpacing: 3,
              lineHeight: 1,
            }}
          >
            VS
          </span>
        </div>

        {/* Away team */}
        {hasBothBadges && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 14,
              width: 220,
            }}
          >
            {effectiveAwayBadge ? (
              <Img
                src={effectiveAwayBadge}
                style={{
                  width: 200,
                  height: 200,
                  objectFit: 'contain',
                  borderRadius: '50%',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 2.5px rgba(255,255,255,0.12)',
                  background: 'rgba(255,255,255,0.03)',
                  transform: `scale(${awayBadgeScale})`,
                  opacity: awayBadgeOpacity,
                  flexShrink: 0,
                }}
              />
            ) : (
              <BadgePlaceholder label="Away" scale={awayBadgeScale} opacity={awayBadgeOpacity} />
            )}
            {/* Team name: wraps rather than truncates */}
            <span
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 22,
                fontWeight: 700,
                color: 'rgba(255,255,255,0.92)',
                textAlign: 'center',
                lineHeight: 1.3,
                letterSpacing: 0.3,
                opacity: awayLabelOpacity,
                transform: `translateY(${awayLabelY}px)`,
                wordBreak: 'break-word',
                overflowWrap: 'anywhere',
              }}
            >
              {awayName}
            </span>
          </div>
        )}
      </div>

      {/* ── Divider ────────────────────────────────────────────────────────── */}
      <div
        style={{
          width: 220,
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.12) 30%, rgba(255,255,255,0.12) 70%, transparent 100%)',
          marginBottom: 24,
          opacity: dividerOpacity,
          flexShrink: 0,
        }}
      />

      {/* ── Subtitle / metadata block ───────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif',
          opacity: subtitleOpacity,
          transform: `translateY(${subtitleY}px)`,
        }}
      >
        {score && (
          <span
            style={{
              fontSize: 48,
              fontWeight: 800,
              color: '#facc15',
              lineHeight: 1,
              letterSpacing: -1,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {score}
          </span>
        )}
        {matchDate && (
          <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.45)' }}>
            {matchDate}
          </span>
        )}
        {ageGroup && (
          <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.32)' }}>
            {ageGroup}
          </span>
        )}
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: 'rgba(99,102,241,0.85)',
            marginTop: 6,
          }}
        >
          Match Highlights
        </span>
      </div>

      {/* Legacy: title-only mode (no badges at all) */}
      {!hasBothBadges && !effectiveHomeBadge && !effectiveAwayBadge && (
        <h1
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 64,
            fontWeight: 700,
            color: '#fff',
            margin: 0,
            textAlign: 'center',
            opacity: homeLabelOpacity,
          }}
        >
          {title}
        </h1>
      )}
    </AbsoluteFill>
  );
};
