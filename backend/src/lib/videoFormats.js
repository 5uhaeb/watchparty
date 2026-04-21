/**
 * Video format utilities for backend (Node.js)
 */

// Browser-natively supported formats
const NATIVE_VIDEO_FORMATS = {
  mp4: { mimeType: 'video/mp4', codec: 'H.264/AAC', note: 'Universal, recommended' },
  webm: { mimeType: 'video/webm', codec: 'VP8/VP9/Vorbis', note: 'Open source' },
  ogg: { mimeType: 'video/ogg', codec: 'Theora/Vorbis', note: 'Lower adoption' },
  ogv: { mimeType: 'video/ogg', codec: 'Theora/Vorbis', note: 'Alternative OGG' },
  mov: { mimeType: 'video/quicktime', codec: 'H.264/AAC', note: 'Apple format' },
  avi: { mimeType: 'video/x-msvideo', codec: 'Various', note: 'Limited support' },
  m4v: { mimeType: 'video/x-m4v', codec: 'H.264/AAC', note: 'iTunes compatible' }
};

// Formats requiring conversion
const CONVERSION_REQUIRED_FORMATS = {
  mkv: { note: 'Convert to MP4', reason: 'Matroska container not supported' },
  flv: { note: 'Convert to MP4', reason: 'Flash video obsolete' },
  wmv: { note: 'Convert to MP4', reason: 'Windows Media not widely supported' },
  ts: { note: 'Convert to MP4', reason: 'MPEG-TS transport stream' },
  m3u8: { note: 'Download/convert to MP4', reason: 'HTTP Live Streaming index' }
};

/**
 * Extract file format from URL
 */
function getFileFormatFromUrl(url) {
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
 */
function getMimeType(format) {
  const normalized = format.toLowerCase();
  return NATIVE_VIDEO_FORMATS[normalized]?.mimeType || null;
}

/**
 * Check if format is natively supported
 */
function isNativelySupported(format) {
  return format.toLowerCase() in NATIVE_VIDEO_FORMATS;
}

/**
 * Check if format requires conversion
 */
function requiresConversion(format) {
  return format.toLowerCase() in CONVERSION_REQUIRED_FORMATS;
}

/**
 * Validate video format with guidance
 */
function validateVideoFormat(url) {
  const format = getFileFormatFromUrl(url);
  
  if (!format) {
    return {
      supported: false,
      format: null,
      message: 'Could not detect video format from URL'
    };
  }
  
  if (isNativelySupported(format)) {
    return {
      supported: true,
      format,
      message: `Format .${format} is natively supported`
    };
  }
  
  if (requiresConversion(format)) {
    return {
      supported: false,
      format,
      message: `Format .${format} requires conversion to MP4`
    };
  }
  
  return {
    supported: false,
    format,
    message: `Format .${format} is unknown`
  };
}

module.exports = {
  NATIVE_VIDEO_FORMATS,
  CONVERSION_REQUIRED_FORMATS,
  getFileFormatFromUrl,
  getMimeType,
  isNativelySupported,
  requiresConversion,
  validateVideoFormat
};
