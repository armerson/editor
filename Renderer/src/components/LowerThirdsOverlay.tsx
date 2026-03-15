import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { LowerThirdsOverlayData } from '../types/reel';

type LowerThirdsOverlayProps = LowerThirdsOverlayData;

export const LowerThirdsOverlay: React.FC<LowerThirdsOverlayProps> = ({
  visible = true,
  title,
  subtitle,
  imageUrl,
}) => {
  if (!visible) return null;

  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        justifyContent: 'flex-end',
        alignItems: 'flex-start',
        paddingBottom: 48,
        paddingLeft: 48,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          padding: '16px 24px',
          backgroundColor: 'rgba(0,0,0,0.8)',
          borderLeft: '4px solid #eab308',
          fontFamily: 'system-ui, sans-serif',
          color: '#fff',
          maxWidth: '80%',
        }}
      >
        {imageUrl ? (
          <Img
            src={imageUrl}
            style={{ width: 48, height: 48, borderRadius: 24, objectFit: 'cover' }}
          />
        ) : null}
        <div>
          {title ? (
            <div style={{ fontSize: 24, fontWeight: 700 }}>{title}</div>
          ) : null}
          {subtitle ? (
            <div style={{ fontSize: 16, opacity: 0.9, marginTop: 2 }}>
              {subtitle}
            </div>
          ) : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};
