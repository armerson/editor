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
        paddingTop: Math.round(40 * s),
        paddingLeft: Math.round(40 * s),
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: Math.round(56 * s),
          padding: `${Math.round(22 * s)}px ${Math.round(52 * s)}px`,
          backgroundColor: 'rgba(0,0,0,0.75)',
          borderRadius: Math.round(16 * s),
          fontFamily: 'system-ui, sans-serif',
          color: '#fff',
          fontSize: Math.round(52 * s),
        }}
      >
        <span style={{ fontWeight: 600, minWidth: Math.round(160 * s), textAlign: 'right' }}>
          {homeTeamName}
        </span>
        <span
          style={{
            fontSize: Math.round(68 * s),
            fontWeight: 700,
            minWidth: Math.round(96 * s),
            textAlign: 'center',
          }}
        >
          {homeScore} – {awayScore}
        </span>
        <span style={{ fontWeight: 600, minWidth: Math.round(160 * s), textAlign: 'left' }}>
          {awayTeamName}
        </span>
        {clockOrPeriod ? (
          <span
            style={{
              marginLeft: Math.round(28 * s),
              paddingLeft: Math.round(28 * s),
              borderLeft: '1px solid rgba(255,255,255,0.3)',
              fontSize: Math.round(44 * s),
            }}
          >
            {clockOrPeriod}
          </span>
        ) : null}
        {label ? (
          <span style={{ opacity: 0.8, fontSize: Math.round(40 * s) }}>{label}</span>
        ) : null}
        {scorerName ? (
          <span
            style={{
              marginLeft: Math.round(28 * s),
              paddingLeft: Math.round(28 * s),
              borderLeft: '1px solid rgba(255,255,255,0.3)',
              fontSize: Math.round(40 * s),
              opacity: 0.95,
              whiteSpace: 'nowrap',
            }}
          >
            {scorerSide ? (scorerSide === 'home' ? `${homeTeamName}: ` : `${awayTeamName}: `) : ''}
            {scorerName}
          </span>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
