# Football Highlight Reel (Remotion)

React + TypeScript Remotion project for rendering football highlight reels from JSON data. Designed so you can pass your existing editor export JSON directly.

## Setup

```bash
npm install
npm run dev
```

Opens Remotion Studio. Use the **HighlightReel** composition and edit input props (or load your JSON).

## Render data (JSON)

The composition accepts a single JSON object matching `HighlightReelData` in `src/types/reel.ts`:

- **intro** – Intro card (title, subtitle, durationSeconds, optional imageUrl, backgroundColor).
- **clips** – Ordered array of video clips. Each clip supports:
  - `src` – Video URL or path (use `staticFile('file.mp4')` for files in `public/`).
  - `trimStart` – Start time in **seconds** (trimmed from source).
  - `trimEnd` – End time in **seconds** (trimmed from source).
  - Optional `durationSeconds` to force display length; otherwise uses `trimEnd - trimStart`.
  - Optional `name` for the timeline.
- **music** (optional) – Global music track: `src`, `volume` (0–1), `trimStart`/`trimEnd`, `loop`.
- **scoreboard** (optional) – Overlay: `visible`, `homeTeamName`, `awayTeamName`, `homeScore`, `awayScore`, `clockOrPeriod`, `label`.
- **lowerThirds** (optional) – Overlay: `visible`, `title`, `subtitle`, `imageUrl`.
- **presetId** (optional) – `"landscape"` | `"square"` | `"vertical"` for output dimensions.
- **fps** (optional) – Override FPS (default 30).

See `src/data/sample-reel.json` for an example.

## Output presets

| Preset     | ID         | Size        |
|-----------|------------|-------------|
| Landscape | `landscape`| 1920 × 1080 |
| Square    | `square`   | 1080 × 1080 |
| Vertical  | `vertical` | 1080 × 1920 |

Pass `presetId` in your input props (or in the JSON). Duration is computed from intro + clips.

## Connecting your editor

1. Export from your editor to a JSON that matches the shape above (same property names and types).
2. Render with that JSON as input props:

   ```bash
   npx remotion render src/index.ts HighlightReel --props="$(cat your-export.json)"
   ```

   Or from Node:

   ```ts
   import { renderMedia } from '@remotion/renderer';
   import reelData from './your-export.json';

   await renderMedia({
     composition: { id: 'HighlightReel', props: reelData },
     serveUrl: bundleLocation,
     codec: 'h264',
     outputLocation: 'out/highlight.mp4',
     inputProps: reelData,
   });
   ```

3. Types live in `src/types/reel.ts` – align your editor’s TypeScript types or schema with these for type-safe export.

## File structure

```
src/
  types/reel.ts           # HighlightReelData and related types
  presets/output.ts       # Landscape, square, vertical presets
  components/             # IntroCard, ClipSegment, overlays
  compositions/HighlightReel.tsx
  data/sample-reel.json   # Example input
  Root.tsx
  index.ts
public/                   # Static assets (videos, audio, images)
```

## Scripts

- `npm run dev` – Remotion Studio
- `npm run render` – Render HighlightReel with default props
- `npm run render:landscape` / `render:square` / `render:vertical` – Render with that preset

Put video and audio files in `public/` and reference them in your JSON with paths like `"/video.mp4"` or use Remotion’s `staticFile()` when building props in code.
