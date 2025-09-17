// 全局 FFmpeg（来自 index.html 的 <script src="...ffmpeg.min.js">）
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
let isAudio = false;    // 新：是否为音频输入
let inputName = 'input';// 新：带扩展名的输入文件名

function setStatus(msg){ statusEl.textContent = msg; }
function setBar(ratio){ bar.style.width = Math.min(100, Math.round((ratio||0)*100)) + '%'; }
function enableActions(v){ cutBtn.disabled = !v; extractBtn.disabled = !v; }

uploader.addEventListener('change', (e) => {
  file = e.target.files?.[0] || null;
  if (file) {
    const ext = (file.name.split('.').pop() || 'dat').toLowerCase();
    isAudio = (file.type || '').startsWith('audio') || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
    inputName = `input.${ext}`;
    setStatus(`Selected: ${file.name} (${Math.round(file.size/1024/1024)} MB)`);
    enableActions(true);
  } else {
    setStatus('Waiting for file…');
    enableActions(false);
  }
});

ffmpeg.setProgress(({ ratio }) => setBar(ratio));
ffmpeg.setLogger(() => {});

async function ensureReady() {
  if (!file) throw new Error('Please choose a file first.');
  if (!ffmpeg.isLoaded()) {
    setStatus('Loading FFmpeg (first time may take 10–20s)…');
    await ffmpeg.load();
  }
  setStatus('Preparing file…');
  ffmpeg.FS('writeFile', inputName, await fetchFile(file));
  setBar(0);
}

// —— 剪裁（视频或音频都可） ——
cutBtn.onclick = async () => {
  try {
    enableActions(false);
    await ensureReady();

    const start = startInput.value || '00:00:00';
    const duration = (durationInput.value || '10').toString();

    setStatus(`Cutting ${isAudio ? 'audio' : 'video'}…`);

    if (isAudio) {
      // 音频剪裁：输出 mp3
      await ffmpeg.run(
        '-ss', start, '-t', duration, '-i', inputName,
        '-acodec', 'libmp3lame', '-q:a', '0',
        'output.mp3'
      );
      const data = ffmpeg.FS('readFile', 'output.mp3');
      const url = URL.createObjectURL(new Blob([data.buffer], { type: 'audio/mpeg' }));
      download.href = url; download.download = 'cut.mp3';
    } else {
      // 视频剪裁（重新编码更稳）
      await ffmpeg.run(
        '-ss', start, '-t', duration, '-i', inputName,
        '-c:v', 'libx264', '-preset', 'veryfast',
        '-c:a', 'aac', '-movflags', 'faststart',
        'output.mp4'
      );
      const data = ffmpeg.FS('readFile', 'output.mp4');
      const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
      download.href = url; download.download = 'cut.mp4';
    }

    download.style.display = 'inline-block';
    setStatus('Done. Click “Download result”.');
  } catch (e) {
    console.error(e); alert('Failed: ' + e.message); setStatus('Error: ' + e.message);
  } finally {
    enableActions(true); setBar(1);
  }
};

// —— 抽音频/转码（视频→音频 或 音频→另一种音频） ——
extractBtn.onclick = async () => {
  try {
    enableActions(false);
    await ensureReady();

    const fmt = audioFmt.value; // mp3 / wav / aac
    const out = 'audio.' + fmt;
    setStatus(isAudio ? `Converting to ${fmt}…` : 'Extracting audio…');

    // 视频：-vn；音频：直接转码
    if (isAudio) {
      const args = {
        mp3: ['-i',inputName,'-acodec','libmp3lame','-q:a','0', out],
        wav: ['-i',inputName,'-acodec','pcm_s16le','-ar','44100','-ac','2', out],
        aac: ['-i',inputName,'-acodec','aac','-b:a','192k', out],
      }[fmt];
      await ffmpeg.run(...args);
    } else {
      const args = {
        mp3: ['-i',inputName,'-vn','-acodec','libmp3lame','-q:a','0', out],
        wav: ['-i',inputName,'-vn','-acodec','pcm_s16le','-ar','44100','-ac','2', out],
        aac: ['-i',inputName,'-vn','-acodec','aac','-b:a','192k', out],
      }[fmt];
      await ffmpeg.run(...args);
    }

    const data = ffmpeg.FS('readFile', out);
    const mime = { mp3:'audio/mpeg', wav:'audio/wav', aac:'audio/aac' }[fmt];
    const url = URL.createObjectURL(new Blob([data.buffer], { type: mime }));
    download.href = url; download.download = out; download.style.display = 'inline-block';
    setStatus('Done. Click “Download result”.');
  } catch (e) {
    console.error(e); alert('Failed: ' + e.message); setStatus('Error: ' + e.message);
  } finally {
    enableActions(true); setBar(1);
  }
};
