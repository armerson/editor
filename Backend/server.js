/**
 * DEPRECATED — this file is an old prototype and is NOT the active backend.
 *
 * The real render server lives at:
 *   Editor/server/src/index.ts
 *
 * To run it:
 *   cd Editor/server
 *   cp .env.example .env        # fill in REMOTION_ROOT, PORT, etc.
 *   npm install
 *   npm run build && npm start
 *     — or —
 *   npx ts-node src/index.ts
 *
 * Problems with this file (kept for reference only):
 *  - Route was POST /render, Editor expects POST /api/render
 *  - Response was { success, file }, Editor expects { jobId } + async polling
 *  - Blocked the process synchronously until render completed (no job store)
 *  - Hardcoded entrypoint "../renderer/src/index.ts" (wrong case; should be ../Renderer)
 *  - Ignored all environment variables (PORT, REMOTION_ROOT, RENDERS_DIR, etc.)
 *  - Re-bundled the Remotion project on every request (no caching)
 */

console.error(
  "[Backend/server.js] This file is deprecated. " +
  "Run Editor/server instead. See the comment at the top of this file."
)
process.exit(1)
