# Video Format Support Guide

## Overview

WatchParty supports various video formats through HTML5 video player. Some formats work directly in browsers, while others require conversion to MP4 or WebM.

## Quick Reference

### ✅ Works Directly (No Conversion Needed)

- **MP4** (Recommended) - Most compatible, H.264 video + AAC audio
- **WebM** - Open-source format, VP8/VP9 + Vorbis audio  
- **MOV** - Apple format, good compatibility
- **OGG/OGV** - Theora video codec
- **AVI** - Legacy format, limited modern support
- **M4V** - iTunes-compatible variant of MP4

### ⚠️ Requires Conversion to MP4

- **MKV** (Matroska) - Popular but not browser-supported
- **FLV** - Adobe Flash format (obsolete)
- **WMV** - Windows Media Video
- **TS/M2TS** - MPEG Transport Stream
- **M3U8** - HTTP Live Streaming (HLS)

## Recommended: Use MP4

MP4 is the best choice because:
- ✅ Supported by all modern browsers
- ✅ Good compression (smaller file size)
- ✅ Fast seeking
- ✅ Works on mobile devices
- ✅ H.264/AVC codec is widely adopted

## Converting Video Files

### If You Have MKV Files

**Option 1: Using FFmpeg (Command Line)**
```bash
# Basic conversion
ffmpeg -i input.mkv -c:v libx264 -c:a aac -q:v 5 output.mp4

# Faster encoding (trades quality for speed)
ffmpeg -i input.mkv -c:v libx264 -preset fast -c:a aac output.mp4

# Preserve high quality
ffmpeg -i input.mkv -c:v libx264 -crf 18 -c:a aac output.mp4
```

**Option 2: Using HandBrake (GUI - Recommended for Beginners)**
1. Download [HandBrake](https://handbrake.fr/)
2. Open the MKV file
3. Select "Fast 1080p30" preset (or customize)
4. Click Browse and save as `output.mp4`
5. Click "Start Encode"

**Option 3: Using VLC**
1. Open VLC Media Player
2. Go to Media → Convert/Save
3. Select your MKV file
4. Choose MP4 profile
5. Click "Start"

### For Other Formats

Use the same methods (FFmpeg, HandBrake, VLC) to convert to MP4. FFmpeg examples:

```bash
# FLV to MP4
ffmpeg -i video.flv -c:v libx264 -c:a aac output.mp4

# WMV to MP4
ffmpeg -i video.wmv -c:v libx264 -c:a aac output.mp4

# MOV to MP4
ffmpeg -i video.mov -c:v libx264 -c:a aac output.mp4
```

## File Upload Instructions

WatchParty uses **URL-based video streaming**, not direct file uploads:

1. **Upload your video to a server/CDN**
   - Options: AWS S3, Google Drive (shared link), your own server, Dropbox
   - Ensure file is publicly accessible
   - Video must support CORS (most hosting does automatically)

2. **Get the public URL** of your video file
   - Example: `https://mybucket.s3.amazonaws.com/movie.mp4`
   - Test the URL in your browser to confirm it works

3. **Create a room** in WatchParty
   - Select "Video file" option
   - Paste the video URL
   - WatchParty validates the format
   - Create room and share the code

## Verification Commands

Check your video file before uploading:

```bash
# Get detailed video info
ffprobe -v error -select_streams v:0 -show_entries stream=codec_type,codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 video.mp4

# Get file size
ls -lh video.mp4

# Get duration
ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 video.mp4
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Video won't play" | Ensure file is MP4 format. Try converting with FFmpeg/HandBrake. |
| "Only audio, no video" | Video codec not supported. Re-encode with H.264 (`-c:v libx264`). |
| "Stuttering/buffering" | Video bitrate too high. Re-encode with lower bitrate: `ffmpeg -i input.mkv -b:v 2000k output.mp4` |
| "CORS error in console" | Hosting server CORS headers missing. Try different hosting or server. |
| "Huge file size" | Compress further: `ffmpeg -i input.mp4 -c:v libx264 -crf 28 -c:a aac output.mp4` (higher CRF = smaller file) |

## Recommended Settings

For best results, use these FFmpeg settings:

```bash
# Balance quality and file size (RECOMMENDED)
ffmpeg -i input.mkv -c:v libx264 -crf 23 -c:a aac -b:a 128k output.mp4

# High quality (bigger file)
ffmpeg -i input.mkv -c:v libx264 -crf 18 -c:a aac -b:a 192k output.mp4

# Lower quality/size (streaming-friendly)
ffmpeg -i input.mkv -c:v libx264 -crf 28 -c:a aac -b:a 96k output.mp4

# 1080p with bitrate limiting
ffmpeg -i input.mkv -s 1920x1080 -c:v libx264 -b:v 3000k -c:a aac -b:a 128k output.mp4

# 720p for lower bandwidth
ffmpeg -i input.mkv -s 1280x720 -c:v libx264 -b:v 1500k -c:a aac -b:a 128k output.mp4
```

Where:
- `-crf` = quality (0-51, lower is better, default 23)
- `-b:v` = video bitrate (e.g., 2000k = 2 Mbps)
- `-b:a` = audio bitrate (e.g., 128k = 128 kbps)

## CORS Setup (If Hosting Your Own Server)

If hosting on your own server, add these headers:

```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

**Express.js example:**
```javascript
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  next();
});
```

## Performance Tips

1. **Use MP4** for fastest playback
2. **Keep file size reasonable** (under 1GB for streaming)
3. **Use H.264 + AAC** (most compatible codec combo)
4. **Bitrate 2-5 Mbps** good for most streams
5. **Host on CDN** for fast delivery (AWS CloudFront, Cloudflare, etc.)
6. **Test on mobile** - ensure it plays on phones too

## Still Having Issues?

- Confirm video plays in your browser directly (not through WatchParty)
- Check browser console for CORS or codec errors
- Try the same video URL in a different room
- Verify the file format with FFprobe
- Re-encode video with recommended FFmpeg settings
