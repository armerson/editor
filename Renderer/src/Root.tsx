import React from 'react';
import { Composition } from 'remotion';
import {
  HighlightReel,
  HighlightReelProps,
  getHighlightReelDurationInFrames,
} from './compositions/HighlightReel';
import { OUTPUT_PRESETS } from './presets/output';
import { projectJsonToHighlightReelData, ProjectJson } from './data/projectAdapter';

const FPS = 30;

/** Minimal default project JSON for Studio when no props are passed. */
const DEFAULT_PROJECT_JSON: ProjectJson = {
  version: 1,
  projectTitle: 'Sample Highlight Reel',
  intro: {
    teamName: 'Sample Team',
    opponent: 'Opponent',
    score: '',
    matchDate: '',
    ageGroup: '',
    clubBadgeUrl: '',
    durationSeconds: 3,
  },
  clips: [],
  scoreboard: {},
  music: {},
  lowerThird: {},
  goals: [],
  transitions: [],
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="HighlightReel"
        component={HighlightReel}
        fps={FPS}
        width={OUTPUT_PRESETS.landscape.width}
        height={OUTPUT_PRESETS.landscape.height}
        /** Default props are project JSON; calculateMetadata transforms them to HighlightReelProps at runtime. */
        defaultProps={DEFAULT_PROJECT_JSON as unknown as HighlightReelProps}
        calculateMetadata={({ props }) => {
          // 1) Coerce incoming props (from backend or Studio) to ProjectJson.
          const projectProps = (props ?? {}) as ProjectJson;

          // 2) Resolve output dimensions from the project's presetId (default: landscape).
          const presetId = typeof projectProps.presetId === 'string' && projectProps.presetId in OUTPUT_PRESETS
            ? projectProps.presetId
            : 'landscape';
          const preset = OUTPUT_PRESETS[presetId]!;

          // 3) Safely transform to HighlightReelData using the adapter.
          let reelProps: HighlightReelProps;
          try {
            const transformed = projectJsonToHighlightReelData(projectProps, {
              videoBasePath: '/',
            });
            reelProps = { ...transformed, presetId };
            if (!Array.isArray(reelProps.clips)) {
              reelProps.clips = [];
            }
          } catch {
            // Defensive fallback: use a minimal, known‑good reel derived
            // from DEFAULT_PROJECT_JSON if runtime props are malformed.
            const fallbackTransformed = projectJsonToHighlightReelData(
              DEFAULT_PROJECT_JSON,
              { videoBasePath: '/' }
            );
            reelProps = { ...fallbackTransformed, presetId: 'landscape' };
          }

          // 4) Duration and fps are calculated from the transformed reel props.
          const fps = reelProps.fps ?? FPS;
          const durationInFrames = getHighlightReelDurationInFrames(reelProps);

          // 5) Return updated metadata with correct dimensions for the chosen preset.
          return {
            width: preset.width,
            height: preset.height,
            fps,
            durationInFrames,
            props: reelProps,
          };
        }}
      />
    </>
  );
};
