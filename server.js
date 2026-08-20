const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const DOWNLOAD_DIR = path.join(os.tmpdir(), 'social-downloader');

function ensureDownloadDir() {
  if (!fs.existsSync(DOWNLOAD_DIR)) {
    fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
  }
}

function runYtDlp(args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn('yt-dlp', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs || 120000,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (err) => reject(err));
    child.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const err = new Error(stderr.trim() || `yt-dlp exited with code ${code}`);
        err.stdout = stdout;
        err.stderr = stderr;
        reject(err);
      }
    });
  });
}

app.post('/api/info', async (req, res) => {
  const url = (req.body && req.body.url || '').trim();
  if (!url) {
    return res.status(400).json({ error: 'Please provide a video URL' });
  }
  if (!/^https?:\/\//i.test(url)) {
    return res.status(400).json({ error: 'Please provide a valid URL (starting with http:// or https://)' });
  }

  try {
    const args = [
      '--dump-json',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--extractor-args',
      'youtube:skip=hls',
      url,
    ];
    const { stdout } = await runYtDlp(args, 45000);
    const info = JSON.parse(stdout);
    return res.json({
      title: info.title || 'Untitled',
      thumbnail: info.thumbnail || null,
      uploader: info.uploader || info.channel || info.uploader_id || null,
      duration: info.duration || null,
      durationString: info.duration ? formatDuration(info.duration) : null,
      ext: info.ext || null,
      webpageUrl: info.webpage_url || url,
      formats: buildFormatList(info.formats || []),
    });
  } catch (err) {
    console.error('Info error:', err.message);
    const friendly = friendlyError(err.message);
    return res.status(422).json({
      error: friendly,
      detail: err.message,
    });
  }
});

function buildFormatList(formats) {
  const hasAudio = (f) => f.audio_ext && f.audio_ext !== 'none';
  const hasVideo = (f) => f.video_ext && f.video_ext !== 'none';

  const hasSeparateAudioStreams = formats.some((f) => hasAudio(f) && !hasVideo(f));

  const combined = formats.filter((f) => hasVideo(f) && hasAudio(f));
  const videoOnly = formats.filter((f) => hasVideo(f) && !hasAudio(f));

  const toItem = (f) => ({
    format_id: f.format_id,
    ext: f.video_ext,
    resolution: f.format_note || `${f.width || '?'}x${f.height || '?'}`,
    height: f.height || 0,
    videoOnly: hasSeparateAudioStreams && !hasAudio(f),
    filesize: f.filesize || f.filesize_approx || null,
    filesizeString: f.filesize ? formatBytes(f.filesize) : (f.filesize_approx ? formatBytes(f.filesize_approx) : null),
  });

  const sortByHeight = (a, b) => b.height - a.height;

  const combinedItems = combined.map(toItem).sort(sortByHeight);
  const videoOnlyItems = videoOnly.map(toItem).sort(sortByHeight);

  const top = [...combinedItems, ...videoOnlyItems].slice(0, 8);
  if (combinedItems.length === 0 && videoOnlyItems.length === 0) {
    return [];
  }
  return top;
}

function friendlyError(msg) {
  const m = msg.toLowerCase();
  if (m.includes('sign in to confirm') || m.includes('bot') || m.includes('unavailable') && m.includes('youtube')) {
    return 'YouTube blocked this server IP (sign-in/bot check). This happens when the platform blocks datacenter IPs. Try from a normal home/office network.';
  }
  if (m.includes('404') || m.includes('not found')) {
    return 'Video not found. The link may be private, deleted, or incorrect.';
  }
  if (m.includes('private') || m.includes('members only') || m.includes('requires')) {
    return 'This video is private or restricted. It cannot be downloaded without login.';
  }
  if (m.includes('no video')) {
    return 'No playable video found in this link.';
  }
  return 'Could not fetch video info. Make sure the link is valid and the platform is supported.';
}

app.get('/api/download', async (req, res) => {
  const url = (req.query.url || '').trim();
  const formatId = (req.query.format || '').trim();
  if (!url) {
    return res.status(400).json({ error: 'Please provide a video URL' });
  }

  ensureDownloadDir();
  const jobDir = fs.mkdtempSync(path.join(DOWNLOAD_DIR, 'job-'));
  const outTemplate = path.join(jobDir, 'video.%(ext)s');

  const formatArg = formatId
    ? `bestvideo[format_id=${formatId}]+bestaudio/best[format_id=${formatId}]/best`
    : 'bv*+ba/best[ext=mp4]/best';

  try {
    const args = [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '-f', formatArg,
      '--merge-output-format', 'mp4',
      '--restrict-filenames',
      '-o', outTemplate,
      url,
    ];
    await runYtDlp(args, 300000);

    const files = fs.readdirSync(jobDir)
      .filter((f) => f.startsWith('video.') && !/\.f\d+\./.test(f));
    if (files.length === 0) {
      throw new Error('No output file was produced');
    }
    const file = files[0];
    const filePath = path.join(jobDir, file);

    let ext = path.extname(file).replace('.', '') || 'mp4';
    const safeTitle = sanitizeFilename(req.query.title) || 'video';
    const filename = `${safeTitle}.${ext}`;
    res.download(filePath, filename, () => {
      setTimeout(() => {
        fs.rmSync(jobDir, { recursive: true, force: true });
      }, 1000);
    });
  } catch (err) {
    console.error('Download error:', err.message);
    fs.rmSync(jobDir, { recursive: true, force: true });
    return res.status(422).json({
      error: 'Could not download the video. The platform may have restrictions.',
      detail: err.message,
    });
  }
});

app.get('/api/health', (req, res) => res.json({ ok: true }));

function formatDuration(seconds) {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function sanitizeFilename(name) {
  if (!name) return '';
  return name
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function formatBytes(bytes) {
  if (!bytes) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

app.listen(PORT, () => {
  console.log(`Social Downloader running on http://localhost:${PORT}`);
});
