/**
 * Video format utilities for extracting and validating video file formats
 */

// Browser-natively supported formats (no conversion needed)
export const NATIVE_VIDEO_FORMATS = {
  mp4: { mimeType: 'video/mp4', codec: 'H.264/AAC', note: 'Universal, recommended' },
  webm: { mimeType: 'video/webm', codec: 'VP8/VP9/Vorbis', note: 'Open source' },
  ogg: { mimeType: 'video/ogg', codec: 'Theora/Vorbis', note: 'Lower adoption' },
  ogv: { mimeType: 'video/ogg', codec: 'Theora/Vorbis', note: 'Alternative OGG' },
  mov: { mimeType: 'video/quicktime', codec: 'H.264/AAC', note: 'Apple format' },
  avi: { mimeType: 'video/x-msvideo', codec: 'Various', note: 'Limited support' },
  m4v: { mimeType: 'video/x-m4v', codec: 'H.264/AAC', note: 'iTunes compatible' }
};

// Formats that require conversion to work in browsers
export const CONVERSION_REQUIRED_FORMATS = {
  mkv: { note: 'Convert to MP4', reason: 'Matroska container not supported' },
  flv: { note: 'Convert to MP4', reason: 'Flash video obsolete' },
  wmv: { note: 'Convert to MP4', reason: 'Windows Media not widely supported' },
  ts: { note: 'Convert to MP4', reason: 'MPEG-TS transport stream' },
  m3u8: { note: 'Download/convert to MP4', reason: 'HTTP Live Streaming index' },
  mxf: { note: 'Convert to MP4/ProRes', reason: 'Professional broadcast format' },
  mod: { note: 'Convert to MP4', reason: 'Camera recording format' }
};

/**
 * Extract file format from URL
 * @param {string} url - Video URL
 * @returns {string | null} - File extension without dot, or null if not found
 */
export function getFileFormatFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const extension = pathname.split('.').pop();
    
    if (!extension || extension.includes('?') || extension.includes('#')) {
      return null;
    }
    
    return extension;
  } catch {
    return null;
  }
}

/**
 * Get MIME type for a format
 * @param {string} format - File extension
 * @returns {string | null} - MIME type or null if unknown
 */
export function getMimeType(format: string): string | null {
  const normalized = format.toLowerCase();
  
  if (NATIVE_VIDEO_FORMATS[normalized as keyof typeof NATIVE_VIDEO_FORMATS]) {
    return NATIVE_VIDEO_FORMATS[normalized as keyof typeof NATIVE_VIDEO_FORMATS].mimeType;
  }
  
  return null;
}

/**
 * Check if format is natively supported in browsers
 * @param {string} format - File extension
 * @returns {boolean}
 */
export function isNativelySupported(format: string): boolean {
  const normalized = format.toLowerCase();
  return normalized in NATIVE_VIDEO_FORMATS;
}

/**
 * Check if format requires conversion
 * @param {string} format - File extension
 * @returns {boolean}
 */
export function requiresConversion(format: string): boolean {
  const normalized = format.toLowerCase();
  return normalized in CONVERSION_REQUIRED_FORMATS;
}

/**
 * Get format validation result with guidance
 * @param {string} url - Video URL
 * @returns {object} - { supported: boolean, format: string | null, message: string }
 */
export function validateVideoFormat(url: string): {
  supported: boolean;
  format: string | null;
  message: string;
} {
  const format = getFileFormatFromUrl(url);
  
  if (!format) {
    return {
      supported: false,
      format: null,
      message: 'Could not detect video format from URL. Ensure URL has a file extension.'
    };
  }
  
  if (isNativelySupported(format)) {
    return {
      supported: true,
      format,
      message: `✅ Format .${format} is natively supported (${NATIVE_VIDEO_FORMATS[format as keyof typeof NATIVE_VIDEO_FORMATS].codec})`
    };
  }
  
  if (requiresConversion(format)) {
    const conversionInfo = CONVERSION_REQUIRED_FORMATS[format as keyof typeof CONVERSION_REQUIRED_FORMATS];
    return {
      supported: false,
      format,
      message: `⚠️ Format .${format} requires conversion: ${conversionInfo.note}. Reason: ${conversionInfo.reason}`
    };
  }
  
  return {
    supported: false,
    format,
    message: `❓ Format .${format} is unknown. Try MP4, WebM, or Ogg for best compatibility.`
  };
}

/**
 * Get conversion recommendation for unsupported format
 * @param {string} format - File extension
 * @returns {string} - Recommendation message
 */
export function getConversionRecommendation(format: string): string {
  const normalized = format.toLowerCase();
  
  if (normalized === 'mkv') {
    return 'FFmpeg: `ffmpeg -i input.mkv -c:v libx264 -c:a aac -q:v 5 output.mp4` or use HandBrake GUI';
  }
  
  if (normalized === 'flv' || normalized === 'wmv') {
    return 'Use FFmpeg, HandBrake, or VLC to convert to MP4';
  }
  
  return 'Recommended: Convert to MP4 using FFmpeg or HandBrake';
}
