/**
 * Sample highlight reel data (JSON-like) for the first working composition.
 * Replace with your editor export or load from JSON later.
 *
 * For local assets: put files in public/ and use paths like "/music.mp4" for video
 * or staticFile('music.mp3') when building props in code.
 */
import type { HighlightReelProps } from '../compositions/HighlightReel';

export const SAMPLE_REEL_DATA: HighlightReelProps = {
  intro: {
    title: 'Game Highlights',
    subtitle: 'Season 2024',
    durationSeconds: 3,
    backgroundColor: '#0a0a0a',
  },
  clips: [
    {
      src: 'https://remotion.media/BigBuckBunny.mp4',
      trimStart: 2,
      trimEnd: 8,
      name: 'Clip 1',
    },
    {
      src: 'https://remotion.media/BigBuckBunny.mp4',
      trimStart: 10,
      trimEnd: 16,
      name: 'Clip 2',
    },
  ],
  music: {
    src: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    volume: 0.5,
    loop: true,
  },
  // Overlay layers ready to enable later (keep structure, hide for now)
  scoreboard: { visible: false },
  lowerThirds: { visible: false },
  presetId: 'landscape',
};
