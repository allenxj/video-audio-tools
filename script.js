// 使用全局 FFmpeg 对象（来自 index.html 中的 <script src="...ffmpeg.min.js">）
const { createFFmpeg, fetchFile } = FFmpeg;

const ffmpeg = createFFmpeg({
  log: true,
  corePath: 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/ffmpeg-core.js'
});

const $ = (id) => document.getElementById(id);
const uploader   = $('uploader');
const cutBtn     = $('cut');
const extractBtn = $('extract');
const startInput = $('start');
const durationInput = $('duration');
const audioFmt   = $('audioFmt');
const statusEl   = $('status');
const bar        = $('bar');
const download   = $('download');

let file = null;

function setStatus(msg){ statusEl.textContent = msg; }
function setBar(ratio){ bar.style.width = Math.min(100, Math.round(ratio*100)) + '%'; }
function enableActions(v){ cutBtn.disabled = !v; extractBtn.disabled = !v; }

uploader.addEventListener('change', (e) => {
  file = e.target.files?.[0] || null;
  if (file) {
    setStatus(`Selected: ${file.name} (${Math.round(file.size/1024/1024)} MB)`);
    enableActions(true);
  } else {
    setStatus('Waiting for file…');
    enableActions(false);
  }
});

ffmpeg.setProgress(({ ratio }) => setBar(ratio || 0));
ffmpeg.setLogger(({ type, message }) => {
  // 需要可视日志可以打开下一行
  // console.log(`[${type}] ${message}`);
});

async function ensureReady() {
  if (!file) throw new Error('Please choose a video first.');
  if (!ffmpeg.isLoaded()) {
    setStatus('Loading FFmpeg (first time may take 10–20s)…');
    await ffmpeg.load();
  }
  setStatus('Preparing file…');
  ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
  setBar(0);
}

cutBtn.onclick = async () => {
  try {
    enableActions(false);
    await ensureReady();

    const start = startInput.value || '00:00:00';
    const duration = (durationInput.value || '10').toString();
    setStatus('Cutting video…');

    await ffmpeg.run(
      '-ss', start,
      '-t', duration,
      '-i', 'input.mp4',
      '-c:v', 'libx264', '-preset', 'veryfast',
      '-c:a', 'aac',
      '-movflags', 'faststart',
      'output.mp4'
    );

    const data = ffmpeg.FS('readFile', 'output.mp4');
    const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    download.href = url;
    download.download = 'cut.mp4';
    download.style.display = 'inline-block';
    setStatus('Done. Click “Download result”.');
  } catch (e) {
    console.error(e);
    alert('Failed: ' + e.message);
    setStatus('Error: ' + e.message);
  } finally {
    enableActions(true);
    setBar(1);
  }
};

extractBtn.onclick = async () => {
  try {
    enableActions(false);
    await ensureReady();

    const fmt = audioFmt.value; // mp3 / wav / aac
    const out = 'audio.' + fmt;
    setStatus('Extracting audio…');

    const args = {
      mp3: ['-i','input.mp4','-vn','-acodec','libmp3lame','-q:a','0', out],
      wav: ['-i','input.mp4','-vn','-acodec','pcm_s16le','-ar','44100','-ac','2', out],
      aac: ['-i','input.mp4','-vn','-acodec','aac','-b:a','192k', out],
    }[fmt];

    await ffmpeg.run(...args);

    const data = ffmpeg.FS('readFile', out);
    const mime = { mp3:'audio/mpeg', wav:'audio/wav', aac:'audio/aac' }[fmt];
    const url = URL.createObjectURL(new Blob([data.buffer], { type: mime }));
    download.href = url;
    download.download = out;
    download.style.display = 'inline-block';
    setStatus('Done. Click “Download result”.');
  } catch (e) {
    console.error(e);
    alert('Failed: ' + e.message);
    setStatus('Error: ' + e.message);
  } finally {
    enableActions(true);
    setBar(1);
  }
};
