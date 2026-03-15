# ─────────────────────────────────────────────────────────────────────────────
# Highlight Reel — Render Server
# Includes: Express API  +  Remotion renderer project
#
# Build from the repo root:
#   docker build -t highlight-render-server .
#
# Run locally:
#   docker run -p 3001:3001 \
#     -e PUBLIC_BASE_URL=http://localhost:3001 \
#     -e BETA_TOKEN=changeme \
#     -v highlight-renders:/app/renders \
#     -v highlight-data:/app/data \
#     highlight-render-server
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm

# ── System packages ───────────────────────────────────────────────────────────
# ffmpeg        — video encoding
# chromium libs — required by Remotion's headless Chrome renderer
# build tools   — needed to compile better-sqlite3 native module
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    fonts-liberation \
    fonts-noto-color-emoji \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdrm2 \
    libgbm1 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxkbcommon0 \
    libxrandr2 \
    xdg-utils \
    libasound2 \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache the puppeteer/Chrome download inside the image layer so it is not
# re-downloaded on every container start.
ENV PUPPETEER_CACHE_DIR=/app/.puppeteer-cache

# ── Renderer project — install deps (triggers Chrome download via puppeteer) ──
COPY Renderer/package*.json Renderer/
RUN cd Renderer && npm ci

# Copy Remotion composition source (TypeScript + assets)
COPY Renderer/src           Renderer/src
COPY Renderer/remotion.config.ts Renderer/remotion.config.ts
COPY Renderer/tsconfig.json     Renderer/tsconfig.json
# Copy public assets if the folder exists (badges, fonts, etc.)
COPY Renderer/public        Renderer/public

# ── Render server — install deps (compiles better-sqlite3 native module) ──────
COPY Editor/server/package*.json server/
RUN cd server && npm ci

# Copy server source and compile TypeScript → dist/
COPY Editor/server/src      server/src
COPY Editor/server/tsconfig.json server/tsconfig.json
RUN cd server && npm run build

# ── Runtime directories (override with volume mounts in production) ───────────
RUN mkdir -p /app/renders /app/data

# ── Default environment ───────────────────────────────────────────────────────
ENV REMOTION_ROOT=/app/Renderer
ENV REMOTION_COMPOSITION_ID=HighlightReel
ENV RENDERS_DIR=/app/renders
ENV SQLITE_DB_PATH=/app/data/render-jobs.db
ENV PORT=3001
ENV NODE_ENV=production

EXPOSE 3001

WORKDIR /app/server
CMD ["node", "dist/index.js"]
