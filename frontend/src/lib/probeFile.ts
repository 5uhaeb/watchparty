/**
 * File probing utility - tests if a video file is actually playable
 */

import {
  getExtension,
  isExplicitlyUnsupported,
  getUnsupportedHint,
  getMimeType,
  parseCanPlayType,
} from './formats';

export interface ProbeResult {
  success: boolean;
  error?: string;
  ffmpegCommand?: string;
  metadata?: {
    duration: number;
    width: number;
    height: number;
    canPlayTypeResult: string;
  };
}

/**
 * Probe a video file to check if it can be played
 * Returns: { success: true, metadata: {...} } or { success: false, error: string, ffmpegCommand?: string }
 *
 * Flow:
 * 1. Check extension against unsupported list (e.g., .mkv, .avi)
 * 2. If not explicitly unsupported, check canPlayType MIME type
 * 3. If canPlayType returns "" (not supported), reject
 * 4. Otherwise, probe by loading metadata in a hidden <video> element
 * 5. If metadata loads within 5s, success
 * 6. If error or timeout, reject with codec error hint
 */
export async function probeVideoFile(file: File): Promise<ProbeResult> {
  const ext = getExtension(file.name);

  // 1. Check for explicitly unsupported formats
  if (isExplicitlyUnsupported(ext)) {
    const hint = getUnsupportedHint(ext);
    return {
      success: false,
      error: hint?.reason || `${ext} is not supported by browsers.`,
      ffmpegCommand: hint?.command,
    };
  }

  // 2. Check canPlayType MIME type
  const mimeType = getMimeType(ext);
  if (!mimeType) {
    return {
      success: false,
      error: `Unknown file format: ${ext}. Supported formats: .mp4, .webm, .ogg, .m4v, .mov`,
    };
  }

  const canPlayTypeResult = await checkCanPlayType(mimeType);
  if (canPlayTypeResult === 'no') {
    return {
      success: false,
      error: `Your browser does not support ${mimeType}. Try a modern browser (Chrome, Firefox, Safari, Edge).`,
    };
  }

  // 3. Probe by loading the actual file
  const probeResult = await probeMetadata(file, canPlayTypeResult);
  return probeResult;
}

/**
 * Check canPlayType for a MIME type
 */
async function checkCanPlayType(mimeType: string): Promise<string> {
  try {
    const video = document.createElement('video');
    const result = video.canPlayType(mimeType);
    return parseCanPlayType(result);
  } catch {
    return 'no';
  }
}

/**
 * Probe metadata by loading file into a hidden <video>
 */
async function probeMetadata(
  file: File,
  canPlayTypeResult: string
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.style.display = 'none';
    video.preload = 'metadata';

    const url = URL.createObjectURL(file);
    let timeoutId: NodeJS.Timeout;
    let resolved = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      if (video.parentNode) {
        video.parentNode.removeChild(video);
      }
      clearTimeout(timeoutId);
    };

    const resolveOnce = (result: ProbeResult) => {
      if (!resolved) {
        resolved = true;
        cleanup();
        resolve(result);
      }
    };

    const onLoadedMetadata = () => {
      const duration = video.duration || 0;
      const width = video.videoWidth || 0;
      const height = video.videoHeight || 0;

      resolveOnce({
        success: true,
        metadata: {
          duration,
          width,
          height,
          canPlayTypeResult,
        },
      });
    };

    const onError = () => {
      const errorMsg =
        "This file's codec isn't supported by your browser. Common fix: re-encode to H.264 + AAC in an MP4 container.";
      resolveOnce({
        success: false,
        error: errorMsg,
        ffmpegCommand: 'ffmpeg -i input.mp4 -c:v libx264 -c:a aac output.mp4',
      });
    };

    video.addEventListener('loadedmetadata', onLoadedMetadata, { once: true });
    video.addEventListener('error', onError, { once: true });

    // 5-second timeout
    timeoutId = setTimeout(() => {
      video.removeEventListener('loadedmetadata', onLoadedMetadata);
      video.removeEventListener('error', onError);
      resolveOnce({
        success: false,
        error: "File is taking too long to load. It may be corrupt or incompatible.",
      });
    }, 5000);

    document.body.appendChild(video);
    video.src = url;
  });
}
