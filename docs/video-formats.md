# Supported Video Formats

## Browser-Native Formats (Fully Supported)

These formats work directly in the HTML5 `<video>` element without conversion:

| Format | Extension | MIME Type | Browser Support | Notes |
|--------|-----------|-----------|-----------------|-------|
| MP4 | .mp4 | video/mp4 | ✅ Universal | Most compatible, recommended |
| WebM | .webm | video/webm | ✅ Chrome, Firefox, Edge | Open source, VP8/VP9 codec |
| Ogg Theora | .ogg, .ogv | video/ogg | ✅ Firefox, Chrome | Lower adoption |
| MOV | .mov | video/quicktime | ✅ Safari, Chrome | Apple format, good compatibility |
| AVI | .avi | video/x-msvideo | ⚠️ Limited | Older format, limited browser support |
| M4V | .m4v | video/x-m4v | ✅ Safari, Chrome | iTunes/Apple compatible |

## Formats Requiring Conversion

These formats are **not natively supported** by browsers and must be converted to MP4 or WebM:

| Format | Typical Use | Recommended Conversion |
|--------|------------|----------------------|
| **MKV** | Matroska container | → Convert to MP4 |
| **FLV** | Flash video (older) | → Convert to MP4 |
| **WMV** | Windows Media Video | → Convert to MP4 |
| **TS/M2TS** | MPEG-TS transport stream | → Convert to MP4 |
| **M3U8** | HTTP Live Streaming | → Download/convert to MP4 |
| **MXF** | Professional broadcast | → Convert to MP4 or ProRes |
| **MOD/TOD** | Camera recordings | → Convert to MP4 |

## Recommended Approach

### For MKV Files

MKV (Matroska) is a popular container format but not browser-supported. **Conversion to MP4 is required.**

**Using FFmpeg (command line):**
```bash
ffmpeg -i input.mkv -c:v libx264 -c:a aac -q:v 5 output.mp4
```

**Using HandBrake (GUI):**
1. Open HandBrake
2. Select input MKV file
3. Choose "Fast 1080p30" preset (or custom settings)
4. Set output format to MP4
5. Click "Start Encode"

### For Other Container Formats

Use the same tools:
- **FFmpeg**: Command-line tool, very flexible
- **HandBrake**: GUI tool, beginner-friendly
- **VLC**: Can convert videos via Media → Convert/Save

## Best Practices

1. **Default to MP4** for maximum compatibility
2. **Use H.264 video codec** for best compatibility
3. **Use AAC audio codec** for best compatibility
4. **Aim for bitrate 2-5 Mbps** for smooth streaming
5. **Ensure video URL is publicly accessible** (CORS may be required for some hosting)

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Video not playing" | Check file format support, try MP4 conversion |
| "Audio but no video" | Video codec not supported, re-encode with H.264 |
| "Stuttering/buffering" | Reduce bitrate, check server bandwidth |
| "CORS error" | Ensure video server has correct CORS headers |

## Verification

To verify your video file format:
```bash
ffprobe -v error -select_streams v:0 -show_entries stream=codec_type,codec_name,width,height,r_frame_rate -of default=noprint_wrappers=1 video.mp4
```
