// 直接从 CDN 加载 @ffmpeg/ffmpeg，并指定 corePath
import { createFFmpeg, fetchFile } from 'https://unpkg.com/@ffmpeg/ffmpeg@0.12.4/dist/ffmpeg.min.js';

const ffmpeg = createFFmpeg({
  log: true,
  corePath: 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/ffmpeg-core.js'
});

const uploader = document.getElementById('uploader');
const cutBtn = document.getElementById('cut');
const extractBtn = document.getElementById('extract');
const startInput = document.getElementById('start');
const durationInput = document.getElementById('duration');
const audioFmt = document.getElementById('audioFmt');
const logEl = document.getElementById('log');
const download = document.getElementById('download');

let file;

uploader.addEventListener('change', (e) => {
  file = e.target.files?.[0];
  log('Selected: ' + (file ? file.name : 'None'));
});

function log(msg) {
  logEl.innerText = msg;
}

async function ensureFFmpeg() {
  if (!ffmpeg.isLoaded()) {
    log('Loading FFmpeg (first time may take ~10s)…');
    await ffmpeg.load();
    log('FFmpeg loaded.');
  }
  if (!file) throw new Error('Please choose a video first.');
  // 把文件写进 FFmpeg 的内存文件系统
  ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(file));
}

cutBtn.onclick = async () => {
  try {
    await ensureFFmpeg();
    const start = startInput.value || '00:00:00';
    const duration = (durationInput.value || '10').toString();

    log('Cutting…');
    // 更通用的做法：重新编码，避免关键帧对齐问题
    await ffmpeg.run(
      '-ss', start,
      '-t', duration,
      '-i', 'input.mp4',
      '-c:v', 'libx264', '-c:a', 'aac',
      '-movflags', 'faststart',
      'output.mp4'
    );

    const data = ffmpeg.FS('readFile', 'output.mp4');
    const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
    download.href = url;
    download.download = 'cut.mp4';
    download.style.display = 'inline-block';
    log('Done. Click "Download result".');
  } catch (e) {
    console.error(e);
    log('Error: ' + e.message);
  }
};

extractBtn.onclick = async () => {
  try {
    await ensureFFmpeg();
    const fmt = audioFmt.value; // mp3/wav/aac
    const out = 'audio.' + fmt;

    log('Extracting audio…');
    // 直接提取音频，mp3 用 libmp3lame，wav 为 pcm_s16le，aac 用 aac
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
    log('Done. Click "Download result".');
  } catch (e) {
    console.error(e);
    log('Error: ' + e.message);
  }
};
