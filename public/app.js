const urlInput = document.getElementById('urlInput');
const fetchBtn = document.getElementById('fetchBtn');
const loading = document.getElementById('loading');
const errorBox = document.getElementById('errorBox');
const result = document.getElementById('result');
const thumbnail = document.getElementById('thumbnail');
const durationEl = document.getElementById('duration');
const videoTitle = document.getElementById('videoTitle');
const uploader = document.getElementById('uploader');
const formatSelect = document.getElementById('formatSelect');
const downloadBtn = document.getElementById('downloadBtn');

let currentUrl = '';

urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') fetchVideo();
});

fetchBtn.addEventListener('click', fetchVideo);

async function fetchVideo() {
  const url = urlInput.value.trim();
  if (!url) {
    showError('Please paste a video link first.');
    return;
  }
  resetState();
  loading.classList.remove('hidden');
  fetchBtn.disabled = true;
  errorBox.classList.add('hidden');

  try {
    const resp = await fetch('/api/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await resp.json();
    if (!resp.ok) {
      throw new Error(data.error || 'Something went wrong.');
    }

    currentUrl = url;
    videoTitle.textContent = data.title;
    uploader.textContent = data.uploader || '';
    durationEl.textContent = data.durationString || '';
    thumbnail.src = data.thumbnail || 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    thumbnail.style.display = data.thumbnail ? 'block' : 'none';

    populateFormats(data.formats);
    loading.classList.add('hidden');
    result.classList.remove('hidden');
  } catch (err) {
    loading.classList.add('hidden');
    showError(err.message || 'Could not fetch video info.');
  } finally {
    fetchBtn.disabled = false;
  }
}

function populateFormats(formats) {
  formatSelect.innerHTML = '';
  if (!formats || formats.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Best available quality';
    formatSelect.appendChild(opt);
    return;
  }
  for (const f of formats) {
    const opt = document.createElement('option');
    opt.value = f.format_id;
    const size = f.filesizeString ? ` (${f.filesizeString})` : '';
    const note = f.videoOnly ? ' [video only, no audio]' : '';
    opt.textContent = `${f.resolution} - ${f.ext.toUpperCase()}${size}${note}`;
    formatSelect.appendChild(opt);
  }
}

downloadBtn.addEventListener('click', () => {
  if (!currentUrl) return;
  const format = formatSelect.value || '';
  const params = new URLSearchParams({ url: currentUrl });
  if (format) params.set('format', format);
  if (videoTitle.textContent) params.set('title', videoTitle.textContent);
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Preparing download...';

  const a = document.createElement('a');
  a.href = `/api/download?${params.toString()}`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => {
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Download Video';
  }, 8000);
});

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('hidden');
}

function resetState() {
  result.classList.add('hidden');
  errorBox.classList.add('hidden');
  loading.classList.add('hidden');
}
