# Highlight Reel — Private Beta Deployment Guide

This guide walks you through deploying the full system for 2–3 private testers.
Total time: **≈ 25 minutes**.

## Architecture

```
Testers → Vercel (React frontend)
               ↓  POST /api/render
          Railway (Express + Remotion render server, Docker)
               ↓  writes
          /app/renders  (Railway persistent volume)
               ↓  serves
          GET /renders/:jobId.mp4  (same Railway service)
```

---

## Step 1 — Choose a beta token

Pick any secret string. You will use it in **both** services.

```
BETA_TOKEN=reel-beta-2026
```

Testers paste this into the password screen when they first open the app.

---

## Step 2 — Deploy the backend to Railway (~10 min)

### 2a. Create a new Railway project

1. Go to [railway.app](https://railway.app) and create an account / log in.
2. Click **New Project → Deploy from GitHub repo**.
3. Select `armerson/editor` (or your fork).
4. Railway detects `railway.toml` and uses the root `Dockerfile` automatically.

### 2b. Add a persistent volume

Rendered MP4s must survive container restarts.

1. In your Railway service → **Volumes** tab → **Add Volume**.
2. Mount path: `/app/renders`
3. Repeat for `/app/data` (SQLite database).

### 2c. Set environment variables

In **Settings → Variables**, add:

| Variable | Value |
|---|---|
| `PORT` | `3001` |
| `PUBLIC_BASE_URL` | *(leave blank for now — fill in after first deploy)* |
| `BETA_TOKEN` | `reel-beta-2026` *(your token)* |
| `CORS_ORIGIN` | *(leave blank for now — fill in after Vercel deploy)* |
| `REMOTION_ROOT` | `/app/Renderer` |
| `REMOTION_COMPOSITION_ID` | `HighlightReel` |
| `RENDERS_DIR` | `/app/renders` |
| `SQLITE_DB_PATH` | `/app/data/render-jobs.db` |
| `RENDER_TIMEOUT_MS` | `1200000` |
| `LOG_LEVEL` | `info` |

### 2d. Deploy & get the URL

1. Click **Deploy**. First build takes ~5–8 minutes (downloads Chrome + compiles deps).
2. Once green, Railway shows a URL like `https://highlight-render-xxxx.up.railway.app`.
3. Verify it works: `curl https://highlight-render-xxxx.up.railway.app/healthz`
   - Expected: `{"ok":true,"db":"sqlite",...}`
4. Go back to Railway Variables and set:
   - `PUBLIC_BASE_URL` = `https://highlight-render-xxxx.up.railway.app`

---

## Step 3 — Deploy the frontend to Vercel (~10 min)

### 3a. Import the project

1. Go to [vercel.com](https://vercel.com) and log in.
2. Click **Add New → Project → Import Git Repository**.
3. Select `armerson/editor`.
4. Set **Root Directory** to `Editor`.
5. Vercel detects `vercel.json` automatically (Vite framework, `dist` output).

### 3b. Set environment variables

In the Vercel project **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `VITE_RENDER_API_BASE` | `https://highlight-render-xxxx.up.railway.app` |
| `VITE_BETA_TOKEN` | `reel-beta-2026` *(same token)* |
| `VITE_FIREBASE_API_KEY` | *(from Firebase Console)* |
| `VITE_FIREBASE_AUTH_DOMAIN` | *(from Firebase Console)* |
| `VITE_FIREBASE_PROJECT_ID` | *(from Firebase Console)* |
| `VITE_FIREBASE_STORAGE_BUCKET` | *(from Firebase Console)* |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | *(from Firebase Console)* |
| `VITE_FIREBASE_APP_ID` | *(from Firebase Console)* |

> **Firebase vars are optional.** Without them, uploaded clips use temporary blob
> URLs that don't persist across browser sessions. For the beta this is fine as
> long as testers render in the same session they upload.

### 3c. Deploy & finish CORS config

1. Click **Deploy**. Build takes ~1 minute.
2. Vercel gives you a URL like `https://highlight-reel-xxxx.vercel.app`.
3. Go back to **Railway Variables** and set:
   - `CORS_ORIGIN` = `https://highlight-reel-xxxx.vercel.app`
4. Redeploy the Railway service (click **Redeploy** in Railway dashboard).

---

## Step 4 — Verify end-to-end (~5 min)

1. Open `https://highlight-reel-xxxx.vercel.app`.
2. You should see the **beta token gate**. Enter `reel-beta-2026`.
3. Upload a test clip, configure the project, click **Render Video**.
4. Wait for the progress bar to complete.
5. Download the MP4 and confirm it plays.

---

## Environment variables reference

### Frontend (Vercel)

| Variable | Required | Description |
|---|---|---|
| `VITE_RENDER_API_BASE` | ✅ | URL of the Railway render server |
| `VITE_BETA_TOKEN` | ✅ | Token shown to testers; must match backend `BETA_TOKEN` |
| `VITE_FIREBASE_*` | Optional | Firebase Storage for persistent media uploads |

### Backend (Railway)

| Variable | Required | Description |
|---|---|---|
| `PORT` | ✅ | HTTP port (3001) |
| `PUBLIC_BASE_URL` | ✅ | Public URL of this service (for MP4 download links) |
| `BETA_TOKEN` | ✅ | Rejects API calls without matching `X-Beta-Token` header |
| `CORS_ORIGIN` | ✅ | Vercel frontend URL (prevents cross-origin abuse) |
| `REMOTION_ROOT` | ✅ | `/app/Renderer` (set by Dockerfile default) |
| `REMOTION_COMPOSITION_ID` | ✅ | `HighlightReel` |
| `RENDERS_DIR` | ✅ | `/app/renders` (mount a volume here) |
| `SQLITE_DB_PATH` | ✅ | `/app/data/render-jobs.db` (mount a volume here) |
| `RENDER_TIMEOUT_MS` | Optional | Max ms per render (default: 1 200 000 = 20 min) |
| `LOG_LEVEL` | Optional | `trace\|debug\|info\|warn\|error` (default: `info`) |

---

## How testers access the app

Send testers:

```
URL:   https://highlight-reel-xxxx.vercel.app
Token: reel-beta-2026
```

They will see a password screen on first load, enter the token, and the app
unlocks. The unlock is stored in their browser's `localStorage` so they only
need to enter it once per device.

---

## Updating the deployment

### Frontend change
```bash
git push origin main   # Vercel auto-deploys on push
```

### Backend change
```bash
git push origin main   # Railway auto-deploys on push
```

### Force a Railway redeploy without a code change
- Railway dashboard → your service → **Redeploy** button.

### Rotating the beta token
1. Update `BETA_TOKEN` in Railway Variables.
2. Update `VITE_BETA_TOKEN` in Vercel Environment Variables.
3. Trigger redeploy on both services.
4. Tell testers the new token (their localStorage will be invalidated automatically).

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Health check fails | `curl .../healthz` — look at Railway logs for startup errors |
| `REMOTION_ROOT` fatal on startup | Verify the env var is set; it must be `/app/Renderer` in the container |
| Render hangs indefinitely | Increase `RENDER_TIMEOUT_MS`; check Railway logs for Chromium errors |
| CORS errors in browser | Make sure `CORS_ORIGIN` in Railway matches exactly the Vercel URL (no trailing slash) |
| 401 Unauthorized from API | `BETA_TOKEN` in Railway and `VITE_BETA_TOKEN` in Vercel must be identical |
| MP4 URL 404 after render | Confirm the Railway volume is mounted at `/app/renders` |

---

## Alternative: Render.com instead of Railway

If you prefer [render.com](https://render.com):

1. Create a **Web Service** → Docker → point at the repo root.
2. Set the same environment variables as above.
3. Add a **Disk** (persistent storage) mounted at `/app/renders` and `/app/data`.
4. Note: free-tier Render services **sleep after 15 min of inactivity** — the first
   render after a sleep takes an extra 1–2 minutes for cold start. Upgrade to a
   paid plan to avoid this for beta testing.
