import React from 'react';
import { AbsoluteFill } from 'remotion';
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
  if (!visible) return null;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        justifyContent: 'flex-start',
        alignItems: 'center',
        paddingTop: 24,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          padding: '12px 32px',
          backgroundColor: 'rgba(0,0,0,0.75)',
          borderRadius: 8,
          fontFamily: 'system-ui, sans-serif',
          color: '#fff',
          fontSize: 20,
        }}
      >
        <span style={{ fontWeight: 600, minWidth: 120, textAlign: 'right' }}>
          {homeTeamName}
        </span>
        <span
          style={{
            fontSize: 28,
            fontWeight: 700,
            minWidth: 60,
            textAlign: 'center',
          }}
        >
          {homeScore} – {awayScore}
        </span>
        <span style={{ fontWeight: 600, minWidth: 120, textAlign: 'left' }}>
          {awayTeamName}
        </span>
        {clockOrPeriod ? (
          <span
            style={{
              marginLeft: 16,
              paddingLeft: 16,
              borderLeft: '1px solid rgba(255,255,255,0.3)',
              fontSize: 18,
            }}
          >
            {clockOrPeriod}
          </span>
        ) : null}
        {label ? (
          <span style={{ opacity: 0.8, fontSize: 14 }}>{label}</span>
        ) : null}
        {scorerName ? (
          <span
            style={{
              marginLeft: 16,
              paddingLeft: 16,
              borderLeft: '1px solid rgba(255,255,255,0.3)',
              fontSize: 14,
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
