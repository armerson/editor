import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { IntroCardData } from '../types/reel';

type IntroCardProps = IntroCardData;

export const IntroCard: React.FC<IntroCardProps> = ({
  title,
  subtitle,
  imageUrl,
  backgroundColor = '#0a0a0a',
}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 48,
      }}
    >
      {imageUrl ? (
        <div style={{ marginBottom: 24 }}>
          <Img
            src={imageUrl}
            style={{ maxWidth: 200, maxHeight: 120, objectFit: 'contain' }}
          />
        </div>
      ) : null}
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
      {subtitle ? (
        <p
          style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 24,
            color: 'rgba(255,255,255,0.8)',
            marginTop: 16,
            textAlign: 'center',
          }}
        >
          {subtitle}
        </p>
      ) : null}
    </AbsoluteFill>
  );
};
