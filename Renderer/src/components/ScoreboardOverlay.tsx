// v2 — scorer on separate yellow row
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
            {clockOrPeriod ? (
              <span
                style={{
                  marginLeft: Math.round(16 * s),
                  paddingLeft: Math.round(16 * s),
                  borderLeft: '1px solid rgba(255,255,255,0.3)',
                  fontSize: Math.round(22 * s),
                }}
              >
                {clockOrPeriod}
              </span>
            ) : null}
            {label ? (
              <span style={{ opacity: 0.8, fontSize: Math.round(20 * s) }}>{label}</span>
            ) : null}
          </div>
        </div>

        {/* Scorer — below the scoreboard box */}
        {scorerName ? (
          <div
            style={{
              paddingLeft: Math.round(8 * s),
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
    </AbsoluteFill>
  );
};
