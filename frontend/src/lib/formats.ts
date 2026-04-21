/**
 * Browser video format support matrix
 * Defines which containers and codecs are supported by modern browsers
 */

export const SUPPORTED_CONTAINERS = ['.mp4', '.webm', '.ogg', '.ogv', '.m4v', '.mov'];

export const SUPPORTED_MIME_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
];

/**
 * Unsupported formats with specific ffmpeg conversion hints
 */
export const UNSUPPORTED_HINTS: Record<string, { reason: string; command: string }> = {
  '.mkv': {
    reason: 'Matroska (.mkv) is not supported by browsers.',
    command: 'ffmpeg -i input.mkv -c copy output.mp4',
  },
  '.avi': {
    reason: 'AVI format is not supported by browsers.',
    command: 'ffmpeg -i input.avi -c:v libx264 -c:a aac output.mp4',
  },
  '.wmv': {
    reason: 'Windows Media Video (.wmv) is not supported by browsers.',
    command: 'ffmpeg -i input.wmv -c:v libx264 -c:a aac output.mp4',
  },
  '.flv': {
    reason: 'Flash Video (.flv) is not supported by browsers.',
    command: 'ffmpeg -i input.flv -c:v libx264 -c:a aac output.mp4',
  },
  '.ts': {
    reason: 'MPEG-TS streams (.ts) are not supported in <video> elements.',
    command: 'ffmpeg -i input.ts -c copy output.mp4',
  },
  '.m3u8': {
    reason: 'HTTP Live Streaming (.m3u8) is not supported directly.',
    command: 'Use ffmpeg to download and remux: ffmpeg -i input.m3u8 -c copy output.mp4',
  },
  '.srt': {
    reason: 'SRT subtitle format must be converted to WebVTT.',
    command: 'ffmpeg -i input.srt output.vtt',
  },
};

/**
 * Get the file extension from a filename
 */
export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1) return '';
  return filename.substring(lastDot).toLowerCase();
}

/**
 * Check if a file extension is in the unsupported hints list
 */
export function isExplicitlyUnsupported(ext: string): boolean {
  return ext in UNSUPPORTED_HINTS;
}

/**
 * Get unsupported hint for a file extension
 */
export function getUnsupportedHint(ext: string): { reason: string; command: string } | null {
  return UNSUPPORTED_HINTS[ext] || null;
}

/**
 * Get MIME type for a container format
 */
export function getMimeType(ext: string): string | null {
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.ogg': 'video/ogg',
    '.ogv': 'video/ogg',
    '.m4v': 'video/mp4',
    '.mov': 'video/quicktime',
  };
  return mimeMap[ext.toLowerCase()] || null;
}

/**
 * Parse codec info from canPlayType string
 * "probably" | "maybe" | "" (empty = not supported)
 */
export function parseCanPlayType(canPlayTypeResult: string): string {
  if (canPlayTypeResult === 'probably') {
    return 'probably';
  } else if (canPlayTypeResult === 'maybe') {
    return 'maybe';
  }
  return 'no';
}

/**
 * Format file size in human-readable form
 */
export function formatFileSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

/**
 * Format duration in human-readable form
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds)) return 'unknown';
  
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Format video dimensions
 */
export function formatDimensions(width: number, height: number): string {
  if (!width || !height) return 'unknown';
  return `${width}×${height}`;
}
