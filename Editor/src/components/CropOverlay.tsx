import React, { useRef, useState } from 'react';

interface CropOverlayProps {
  videoWidth: number;
  videoHeight: number;
  crop: { x: number; y: number; width: number; height: number };
  setCrop: (crop: { x: number; y: number; width: number; height: number }) => void;
}

// Simple draggable & resizable crop overlay
const MIN_SIZE = 40;

export const CropOverlay: React.FC<CropOverlayProps> = ({
  videoWidth,
  videoHeight,
  crop,
  setCrop,
}) => {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState<null | 'br'>(null);
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);
  const [startCrop, setStartCrop] = useState<typeof crop | null>(null);

  // Drag
  const onMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDragging(true);
    setStart({ x: e.clientX, y: e.clientY });
    setStartCrop({ ...crop });
  };
  const onMouseMove = (e: MouseEvent) => {
    if (dragging && start && startCrop) {
      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      let newX = Math.max(0, Math.min(videoWidth - crop.width, startCrop.x + dx));
      let newY = Math.max(0, Math.min(videoHeight - crop.height, startCrop.y + dy));
      setCrop({ ...crop, x: newX, y: newY });
    }
    if (resizing && start && startCrop) {
      // Only bottom-right resize for simplicity
      let newWidth = Math.max(MIN_SIZE, Math.min(videoWidth - startCrop.x, startCrop.width + (e.clientX - start.x)));
      let newHeight = Math.max(MIN_SIZE, Math.min(videoHeight - startCrop.y, startCrop.height + (e.clientY - start.y)));
      setCrop({ ...crop, width: newWidth, height: newHeight });
    }
  };
  const onMouseUp = () => {
    setDragging(false);
    setResizing(null);
    setStart(null);
    setStartCrop(null);
  };

  React.useEffect(() => {
    if (dragging || resizing) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
      return () => {
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
      };
    }
  });

  // Only bottom-right resize handle for simplicity
  return (
    <div
      ref={overlayRef}
      style={{
        position: 'absolute',
        left: crop.x,
        top: crop.y,
        width: crop.width,
        height: crop.height,
        border: '2px solid #00eaff',
        boxSizing: 'border-box',
        cursor: dragging ? 'move' : 'pointer',
        zIndex: 10,
        background: 'rgba(0,0,0,0.05)',
        userSelect: 'none',
      }}
      onMouseDown={onMouseDown}
    >
      {/* Resize handle */}
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
        onMouseDown={e => {
          e.stopPropagation();
          setResizing('br');
          setStart({ x: e.clientX, y: e.clientY });
          setStartCrop({ ...crop });
        }}
      />
    </div>
  );
};
