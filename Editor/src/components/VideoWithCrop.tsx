import React, { useRef, useState, useEffect } from 'react';
import { CropOverlay } from './CropOverlay';

// Example video URL (replace with your own)
const VIDEO_URL = 'https://www.w3schools.com/html/mov_bbb.mp4';

export const VideoWithCrop: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [videoSize, setVideoSize] = useState({ width: 640, height: 360 });
  const [crop, setCrop] = useState({ x: 100, y: 50, width: 200, height: 300 });

  // Update video size on load/resize
  useEffect(() => {
    const updateSize = () => {
      if (videoRef.current) {
        setVideoSize({
          width: videoRef.current.videoWidth || 640,
          height: videoRef.current.videoHeight || 360,
        });
      }
    };
    if (videoRef.current) {
      videoRef.current.addEventListener('loadedmetadata', updateSize);
      window.addEventListener('resize', updateSize);
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.removeEventListener('loadedmetadata', updateSize);
        window.removeEventListener('resize', updateSize);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: videoSize.width,
        height: videoSize.height,
        margin: '40px auto',
        background: '#222',
      }}
    >
      <video
        ref={videoRef}
        src={VIDEO_URL}
        width={videoSize.width}
        height={videoSize.height}
        style={{ display: 'block' }}
        controls
      />
      <CropOverlay
        videoWidth={videoSize.width}
        videoHeight={videoSize.height}
        crop={crop}
        setCrop={setCrop}
      />
      <div style={{ color: '#fff', marginTop: 8 }}>
        Crop: x={crop.x}, y={crop.y}, width={crop.width}, height={crop.height}
      </div>
    </div>
  );
};
