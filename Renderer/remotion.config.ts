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
 * The server-side renderMedia() call already sets timeoutInMilliseconds: 60_000;
 * this config applies to Remotion Studio preview and CLI rendering.
 */
Config.setDelayRenderTimeoutInMilliseconds(90_000);
