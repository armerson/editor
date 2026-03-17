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
        alignItems: 'flex-start',
        paddingTop: 24,
        paddingLeft: 24,
      }}
    >
      <div
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          gap: 40,
          padding: '20px 48px',
          backgroundColor: 'rgba(0,0,0,0.75)',
          borderRadius: 12,
          fontFamily: 'system-ui, sans-serif',
          color: '#fff',
          fontSize: 36,
        }}
      >
        <span style={{ fontWeight: 600, minWidth: 200, textAlign: 'right' }}>
          {homeTeamName}
        </span>
        <span
          style={{
            fontSize: 48,
            fontWeight: 700,
            minWidth: 100,
            textAlign: 'center',
          }}
        >
          {homeScore} – {awayScore}
        </span>
        <span style={{ fontWeight: 600, minWidth: 200, textAlign: 'left' }}>
          {awayTeamName}
        </span>
        {clockOrPeriod ? (
          <span
            style={{
              marginLeft: 24,
              paddingLeft: 24,
              borderLeft: '1px solid rgba(255,255,255,0.3)',
              fontSize: 32,
            }}
          >
            {clockOrPeriod}
          </span>
        ) : null}
        {label ? (
          <span style={{ opacity: 0.8, fontSize: 28 }}>{label}</span>
        ) : null}
        {scorerName ? (
          <span
            style={{
              marginLeft: 24,
              paddingLeft: 24,
              borderLeft: '1px solid rgba(255,255,255,0.3)',
              fontSize: 28,
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
