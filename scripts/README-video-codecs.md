# Fix Video Codecs Script

This script automatically scans a Supabase Storage bucket (`exercise-assets`) under the `exercises/` prefix for video files (like `.mp4`, `.webm`, `.mov`, `.m4v`). It probes each video to check its codec, and if it finds non-compliant codecs (e.g., HEVC/H.265 instead of safely web-playable H.264/VP8/VP9), it downloads, re-encodes it using `ffmpeg`, uploads the web-safe replacement, and outputs a summary report.

## Prerequisites

To run this script, the system running it must have:
1. **Node.js** (v16+) installed.
2. **ffmpeg** and **ffprobe** installed and available in the system `$PATH`.
3. The correct **Supabase Credentials**. You must possess the **Service Role Key** to be able to download/upload arbitrary items in storage.

## Dependencies

You need `@supabase/supabase-js` installed in your project.
If it's not installed in the workspace, run:
```bash
npm install @supabase/supabase-js
```

## How to Run

1. Open your terminal at the root of the repository.
2. Provide your actual Supabase URL and Service Role Key as environment variables, and run the script:

```bash
SUPABASE_URL="https://your-project-id.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
node scripts/fix-video-codecs.mjs
```

### What to expect

- The script will search for `.mp4`, `.webm`, `.mov`, and `.m4v` files.
- It will download each one to a temporary folder and probe it.
- Files encoded with web-safe codecs (like `h264`, `vp8`, `vp9`) will be skipped.
- Other formats (like `hevc`/`h265`) will be re-encoded to H.264 video with AAC audio in an MP4 container.
- The new files will be uploaded back to Supabase. (If the original file was not `.mp4`, it will be replaced by an `.mp4` and the old file deleted).
- At the end, a markdown table report is generated showing before/after details for any converted file.
