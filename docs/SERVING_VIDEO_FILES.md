# Serving Video Files for WatchParty

## The Problem

Local file paths like `C:\Users\...` **cannot** be played directly in browsers due to security restrictions. Browsers require videos to be served over HTTP/HTTPS protocols.

## Solutions

### Option 1: Use a Public Video Hosting Service (Easiest)

Upload your video to a public service and use the shared link:

- **Amazon S3**: [aws.amazon.com/s3](https://aws.amazon.com/s3)
- **Google Drive**: Share publicly and get a direct link
- **YouTube**: Upload unlisted/private videos
- **Vimeo**: Free tier available
- **Cloudinary**: Media hosting with free tier

Example: `https://example.s3.amazonaws.com/video.mp4`

### Option 2: Run a Local HTTP Server

Serve files from your computer using Python or Node.js:

#### Python 3:
```bash
cd path/to/your/videos
python -m http.server 8000
```

Then use: `http://localhost:8000/video.mp4`

#### Python 2:
```bash
python -m SimpleHTTPServer 8000
```

#### Node.js (using http-server):
```bash
npm install -g http-server
cd path/to/your/videos
http-server -p 8000
```

**Important**: If accessing from another device, use your computer's local IP:
- Find IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Use: `http://192.168.x.x:8000/video.mp4`

### Option 3: Use CORS-Enabled Cloud Storage

Set up cloud storage with public access:

#### AWS S3:
1. Upload video to S3 bucket
2. Make bucket public
3. Enable CORS in bucket settings:
```json
[{
  "AllowedMethods": ["GET"],
  "AllowedOrigins": ["*"],
  "AllowedHeaders": ["*"]
}]
```
4. Use the S3 URL

#### Google Cloud Storage:
```bash
gsutil cors set cors.json gs://your-bucket
```

### Option 4: Implement File Upload in WatchParty (Future)

The app could add a file upload feature to:
1. Accept video files from users
2. Store temporarily on the backend
3. Serve via HTTP endpoint
4. Stream to browser

## Quick Test

To verify your server is working:

```bash
# Test from command line
curl -I http://localhost:8000/video.mp4

# Should return:
# HTTP/1.1 200 OK
# Content-Type: video/mp4
```

## CORS Issues

If you see "CORS policy" errors, the video host must include:
```
Access-Control-Allow-Origin: *
```

Solutions:
1. Use a CORS proxy (not recommended for security)
2. Configure CORS on your video hosting service
3. Use public storage services that support CORS

## Supported Formats

Once you have an HTTP URL, these formats work without conversion:
- **MP4** (.mp4) - Recommended
- **WebM** (.webm)
- **Ogg** (.ogg, .ogv)
- **MOV** (.mov)
- **AVI** (.avi)
- **M4V** (.m4v)

For **MKV**, **FLV**, **WMV**, convert to MP4 first (see VIDEO_FORMAT_GUIDE.md).

## Example Workflow

1. **Convert video** (if needed): `ffmpeg -i input.mkv -c:v libx264 -c:a aac output.mp4`
2. **Start local server**: `python -m http.server 8000`
3. **Get your IP**: `ipconfig`
4. **Share URL**: `http://192.168.1.100:8000/output.mp4`
5. **Create room** in WatchParty with that URL
6. **Share room code** with friends

---

**Still having issues?** Check:
- ✅ URL starts with `http://` or `https://`
- ✅ Video file exists and is readable
- ✅ Format is supported (MP4 recommended)
- ✅ CORS is enabled if hosting elsewhere
- ✅ Firewall isn't blocking the connection
