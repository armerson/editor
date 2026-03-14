/**
 * Output presets for different aspect ratios.
 * Use these with Remotion CLI or programmatic render.
 */
export type OutputPreset = {
  width: number;
  height: number;
  name: string;
  id: string;
};

export const OUTPUT_PRESETS: Record<string, OutputPreset> = {
  landscape: {
    id: 'landscape',
    name: 'Landscape (16:9)',
    width: 1920,
    height: 1080,
  },
  square: {
    id: 'square',
    name: 'Square (1:1)',
    width: 1080,
    height: 1080,
  },
  vertical: {
    id: 'vertical',
    name: 'Vertical (9:16)',
    width: 1080,
    height: 1920,
  },
};

export const DEFAULT_PRESET_ID = 'landscape';
