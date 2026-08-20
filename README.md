# SnapSave - Social Media Video Downloader

Paste any social media video link and download it instantly.

## Supported Platforms

YouTube, Facebook, Instagram, TikTok, X (Twitter), Reddit, Pinterest, Vimeo, Dailymotion and 1000+ sites (powered by yt-dlp).

## Features

- Paste a link, get video preview (title, thumbnail, duration)
- Choose quality from available formats
- Downloads a playable MP4 (video + audio merged with ffmpeg)

## Tech Stack

- Backend: Node.js + Express
- Download engine: yt-dlp
- Frontend: Vanilla HTML/CSS/JS

## Run Locally

```bash
# Install dependencies
npm install

# Make sure yt-dlp and ffmpeg are installed
#   pip install yt-dlp
#   apt-get install ffmpeg  (or your OS package manager)

# Start the server
npm start
```

Open http://localhost:3001

## API

- `POST /api/info` — body: `{ "url": "..." }` → returns video metadata + format list
- `GET /api/download?url=...&format=<format_id>` — downloads the video as MP4

## Note

Platforms like YouTube may block datacenter/server IPs (sign-in / bot check). On a normal home or office connection all platforms generally work.

## Disclaimer

Respect copyright and the terms of service of each platform. Download only content you are allowed to download.
