// v3 — scorer inside the scoreboard box, below the score row
import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import type { ScoreboardOverlayData } from '../types/reel';

type ScoreboardOverlayProps = ScoreboardOverlayData;

export const ScoreboardOverlay: React.FC<ScoreboardOverlayProps> = ({
  visible = true,
  homeTeamName = 'HOME',
  awayTeamName = 'AWAY',
  homeScore = 0,
  awayScore = 0,
  clockOrPeriod = '',
  label,
  scorerName,
  scorerSide,
}) => {
  const { width, height } = useVideoConfig();
  // Scale relative to 1080p reference so the overlay looks identical
  // proportionally on any preset (landscape / square / vertical).
  const s = Math.min(width, height) / 1080;

  if (!visible) return null;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        justifyContent: 'flex-start',
        alignItems: 'flex-start',
        paddingTop: Math.round(24 * s),
        paddingLeft: Math.round(24 * s),
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: Math.round(6 * s) }}>
        {/* Scoreboard box */}
        <div
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            padding: `${Math.round(10 * s)}px ${Math.round(22 * s)}px`,
            backgroundColor: 'rgba(0,0,0,0.75)',
            borderRadius: Math.round(8 * s),
            fontFamily: 'system-ui, sans-serif',
            color: '#fff',
            fontSize: Math.round(26 * s),
          }}
        >
          {/* Score row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: Math.round(16 * s) }}>
            <span style={{ fontWeight: 600, minWidth: Math.round(120 * s), textAlign: 'right' }}>
              {homeTeamName}
            </span>
            <span
              style={{
                fontSize: Math.round(34 * s),
                fontWeight: 700,
                minWidth: Math.round(72 * s),
                textAlign: 'center',
              }}
            >
              {homeScore} – {awayScore}
            </span>
            <span style={{ fontWeight: 600, minWidth: Math.round(120 * s), textAlign: 'left' }}>
              {awayTeamName}
            </span>
          </div>

          {/* Clock/period row — separate row below score, matching editor layout */}
          {clockOrPeriod ? (
            <div
              style={{
                marginTop: Math.round(6 * s),
                paddingTop: Math.round(6 * s),
                borderTop: '1px solid rgba(255,255,255,0.2)',
                fontSize: Math.round(22 * s),
                color: 'rgba(255,255,255,0.9)',
                whiteSpace: 'nowrap',
              }}
            >
              {clockOrPeriod}
            </div>
          ) : null}

          {/* Scorer row — inside the box, below the score row, matching editor layout */}
          {scorerName ? (
            <div
              style={{
                marginTop: Math.round(6 * s),
                paddingTop: Math.round(6 * s),
                borderTop: '1px solid rgba(255,255,255,0.2)',
                fontSize: Math.round(22 * s),
                fontFamily: 'system-ui, sans-serif',
                color: '#facc15',
                whiteSpace: 'nowrap',
              }}
            >
              ⚽ {scorerName}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
