import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);

/**
 * Increase the per-frame delayRender timeout from the default 30 s to 90 s.
 *
 * OffthreadVideo frames fetched from remote storage (Firebase / S3) can take
 * several seconds to download + FFmpeg-decode on first access. 30 s is too
 * tight for large clips; 90 s gives comfortable headroom without masking
 * genuine infinite loops (those would still fail eventually).
 *
 * NOTE: Remotion Studio must be RESTARTED after this file changes for the
 * new timeout to take effect. "33000ms exceeded" in the UI = the old default
 * (30 s + 3 s Studio overhead) is still running from before the restart.
 *
 * The server-side renderMedia() call uses timeoutInMilliseconds: 60_000
 * separately; this config applies to Remotion Studio preview only.
 */
Config.setDelayRenderTimeoutInMilliseconds(90_000);

/**
 * Cap the OffthreadVideo frame cache used by the Studio's off-thread video
 * server. Decoded frames are kept in memory up to this limit so that
 * subsequent seeks to nearby frames don't re-decode from scratch.
 *
 * 512 MB ≈ 60 frames of 1080p (8 MB/frame) — enough to warm the sliding
 * window for Studio scrubbing without starving the machine.
 *
 * The server-side render already caps this separately via
 * offthreadVideoCacheSizeInBytes in remotionRenderer.ts.
 */
Config.setOffthreadVideoCacheSizeInBytes(512 * 1024 * 1024);
