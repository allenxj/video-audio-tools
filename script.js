// 直接从 ESM CDN 加载 ffmpeg ESM 包（国外快、稳定）
import { createFFmpeg, fetchFile } from "https://esm.sh/@ffmpeg/ffmpeg@0.12.6";

const $ = (id) => document.getElementById(id);
const uploader      = $('uploader');
const cutBtn        = $('cut');
const extractBtn    = $('extract');
const startInput    = $('start');
const durationInput = $('duration');
const audioFmt      = $('audioFmt');
const statusEl      = $('status');
const bar           = $('bar');
const download      = $('download');

const setStatus = (m) => statusEl.textContent = m;
const setBar    = (r) => bar.style.width = Math.min(100, Math.round((r || 0) * 100)) + '%';
const enable    = (ok) => { cutBtn.disabled = !ok; extractBtn.disabled = !ok; };

// —— 三个 corePath 候选：国外优先 unpkg，失败则 jsDelivr；再不行就用你网站本地 /ffmpeg/ ——
// 以后如果你把 core 三个文件（ffmpeg-core.js/.wasm/.worker.js）放到仓库 /ffmpeg/ 目录，第三个回退就会生效。
const CORE_UNPKG   = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js';
const CORE_JSDELIV = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/ffmpeg-core.js';
const CORE_LOCAL   = '/ffmpeg/ffmpeg-core.js';

let ffmpeg = null;

async function loadFFmpegWithFallback() {
  // 一次尝试一个 corePath
  const tries = [CORE_UNPKG, CORE_JSDELIV, CORE_LOCAL];
  for (const url of tries) {
    try {
      setStatus(`Loading FFmpeg core… (${url.includes('unpkg') ? 'unpkg' : url.includes('jsdelivr') ? 'jsDelivr' : 'local'})`);
      ffmpeg = createFFmpeg({ log: true, corePath: url });
      await ffmpeg.load();
      return; // 成功
    } catch (e) {
      console.warn('load failed, try next:', url, e);
    }
  }
  throw new Error('All FFmpeg core sources failed to load.');
}

// —— 文件选择状态 ——
let file = null, isAudio = false, inputName = 'input.dat';

uploader.addEventListener('change', (e) => {
  file = e.target.files?.[0] || null;
  if (!file) { setStatus('Waiting for file…'); enable(false); return; }
  const ext = (file.name.split('.').pop() || 'dat').toLowerCase();
  isAudio = (file.type || '').startsWith('audio') || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
  inputName = `input.${ext}`;
  setStatus(`Selected: ${file.name} (${Math.round(file.size/1024/1024)} MB)`);
  enable(true); setBar(0);
});

// —— 日志与进度条（在实例创建后挂上） ——
function attachMonitors() {
  ffmpeg.setProgress(({ ratio }) => setBar(ratio));
  ffmpeg.setLogger(() => {}); // 如需调试可输出日志
}

// —— 统一准备工作：加载 core + 写入文件 ——
async function ensureReady() {
  if (!file) throw new Error('Please choose a file first.');
  if (!ffmpeg || !ffmpeg.isLoaded()) {
    await loadFFmpegWithFallback();
    attachMonitors();
  }
  setStatus('Preparing file…');
  ffmpeg.FS('writeFile', inputName, await fetchFile(file));
  setBar(0);
}

// —— 剪裁：视频或音频都可 ——
cutBtn.addEventListener('click', async () => {
  try {
    enable(false);
    await ensureReady();

    const start = (startInput.value || '00:00:00').trim();
    const duration = (durationInput.value || '10').toString();

    setStatus(`Cutting ${isAudio ? 'audio' : 'video'}…`);

    if (isAudio) {
      await ffmpeg.run('-ss', start, '-t', duration, '-i', inputName,
                       '-acodec','libmp3lame','-q:a','0', 'output.mp3');
      const data = ffmpeg.FS('readFile', 'output.mp3');
      const url  = URL.createObjectURL(new Blob([data.buffer], { type: 'audio/mpeg' }));
      download.href = url; download.download = 'cut.mp3';
    } else {
      await ffmpeg.run('-ss', start, '-t', duration, '-i', inputName,
                       '-c:v','libx264','-preset','veryfast','-c:a','aac','-movflags','faststart',
                       'output.mp4');
      const data = ffmpeg.FS('readFile', 'output.mp4');
      const url  = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
      download.href = url; download.download = 'cut.mp4';
    }

    download.style.display = 'inline-block';
    setStatus('Done. Click “Download result”.');
  } catch (e) {
    console.error(e);
    alert('Cut failed: ' + e.message);
    setStatus('Error: ' + e.message);
  } finally {
    enable(true); setBar(1);
  }
});

// —— 抽取/转码：视频→音频；或音频→另一种音频 ——
extractBtn.addEventListener('click', async () => {
  try {
    enable(false);
    await ensureReady();

    const fmt = audioFmt.value;
    const out = 'audio.' + fmt;
    setStatus(isAudio ? `Conver
