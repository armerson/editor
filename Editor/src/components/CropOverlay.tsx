import React, { useRef } from 'react';

interface CropOverlayProps {
  videoWidth: number;
  videoHeight: number;
  crop: { x: number; y: number; width: number; height: number };
  setCrop: (crop: { x: number; y: number; width: number; height: number }) => void;
}

const MIN_SIZE = 40;

export const CropOverlay: React.FC<CropOverlayProps> = ({
  videoWidth,
  videoHeight,
  crop,
  setCrop,
}) => {
  const dragRef = useRef<{ startX: number; startY: number; startCrop: typeof crop } | null>(null);
  const resizeRef = useRef<{ startX: number; startY: number; startCrop: typeof crop } | null>(null);

  return (
    <div
      style={{
        position: 'absolute',
        left: crop.x,
        top: crop.y,
        width: crop.width,
        height: crop.height,
        border: '2px solid #00eaff',
        boxSizing: 'border-box',
        cursor: 'move',
        zIndex: 10,
        background: 'rgba(0,0,0,0.05)',
        userSelect: 'none',
      }}
      onPointerDown={e => {
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragRef.current = { startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
      }}
      onPointerMove={e => {
        if (!dragRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        const { startCrop } = dragRef.current;
        const newX = Math.max(0, Math.min(videoWidth - startCrop.width, startCrop.x + dx));
        const newY = Math.max(0, Math.min(videoHeight - startCrop.height, startCrop.y + dy));
        setCrop({ ...startCrop, x: newX, y: newY });
      }}
      onPointerUp={e => {
        dragRef.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
    >
      {/* Resize handle - bottom-right */}
      <div
        style={{
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 16,
          height: 16,
          background: '#00eaff',
          borderRadius: 8,
          cursor: 'nwse-resize',
        }}
        onPointerDown={e => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          resizeRef.current = { startX: e.clientX, startY: e.clientY, startCrop: { ...crop } };
        }}
        onPointerMove={e => {
          if (!resizeRef.current) return;
          const { startX, startY, startCrop } = resizeRef.current;
          const newWidth = Math.max(MIN_SIZE, Math.min(videoWidth - startCrop.x, startCrop.width + (e.clientX - startX)));
          const newHeight = Math.max(MIN_SIZE, Math.min(videoHeight - startCrop.y, startCrop.height + (e.clientY - startY)));
          setCrop({ ...startCrop, width: newWidth, height: newHeight });
        }}
        onPointerUp={e => {
          resizeRef.current = null;
          e.currentTarget.releasePointerCapture(e.pointerId);
        }}
      />
    </div>
  );
};
