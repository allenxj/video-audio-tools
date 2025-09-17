window.addEventListener('DOMContentLoaded', () => {
  // 安全获取 DOM
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

  const setStatus = (msg) => statusEl && (statusEl.textContent = msg);
  const setBar    = (ratio) => bar && (bar.style.width = Math.min(100, Math.round((ratio || 0) * 100)) + '%');
  const enableActions = (v) => {
    if (cutBtn) cutBtn.disabled = !v;
    if (extractBtn) extractBtn.disabled = !v;
  };

  // 基础校验：脚本和元素都加载到了吗？
  if (!uploader || !cutBtn || !extractBtn || !startInput || !durationInput || !audioFmt || !statusEl || !bar || !download) {
    alert('DOM 元素未加载完整，请刷新页面再试。');
    return;
  }

  // 关键：确认 FFmpeg 脚本是否可用
  if (!window.FFmpeg) {
    setStatus('Error: FFmpeg script not loaded. 请刷新页面（或检查网络拦截/广告插件）。');
    alert('FFmpeg 未加载成功。请刷新页面，或检查是否有插件/网络拦截了 https://unpkg.com 的脚本。');
    return;
  }

  const { createFFmpeg, fetchFile } = window.FFmpeg;

  const ffmpeg = createFFmpeg({
    log: true,
    corePath: 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/ffmpeg-core.js',
  });

  let file = null;
  let isAudio = false;
  let inputName = 'input.dat';

  uploader.addEventListener('change', (e) => {
    file = e.target.files && e.target.files[0] ? e.target.files[0] : null;
    if (!file) {
      setStatus('Waiting for file…');
      enableActions(false);
      return;
    }
    const ext = (file.name.split('.').pop() || 'dat').toLowerCase();
    isAudio = (file.type || '').startsWith('audio') || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
    inputName = `input.${ext}`;
    setStatus(`Selected: ${file.name} (${Math.round(file.size/1024/1024)} MB)`);
    enableActions(true); // 选中文件后启用按钮
    setBar(0);
  });

  ffmpeg.setProgress(({ ratio }) => setBar(ratio));
  ffmpeg.setLogger(() => {}); // 如需调试可输出日志

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

  // —— 剪裁：视频或音频都可 ——
  cutBtn.addEventListener('click', async () => {
    try {
      enableActions(false);
      await ensureReady();

      const start = (startInput.value || '00:00:00').trim();
      const duration = (durationInput.value || '10').toString();

      setStatus(`Cutting ${isAudio ? 'audio' : 'video'}…`);

      if (isAudio) {
        // 音频剪裁 -> mp3
        await ffmpeg.run('-ss', start, '-t', duration, '-i', inputName,
                         '-acodec','libmp3lame','-q:a','0', 'output.mp3');
        const data = ffmpeg.FS('readFile', 'output.mp3');
        const url  = URL.createObjectURL(new Blob([data.buffer], { type: 'audio/mpeg' }));
        download.href = url; download.download = 'cut.mp3';
      } else {
        // 视频剪裁（重编码更稳）
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
      enableActions(true); setBar(1);
    }
  });

  // —— 抽音频/转码：视频→音频；或音频→另一种音频 ——
  extractBtn.addEventListener('click', async () => {
    try {
      enableActions(false);
      await ensureReady();

      const fmt = audioFmt.value; // mp3 / wav / aac
      const out = 'audio.' + fmt;
      setStatus(isAudio ? `Converting to ${fmt}…` : 'Extracting audio…');

      const argsVideo = {
        mp3: ['-i',inputName,'-vn','-acodec','libmp3lame','-q:a','0', out],
        wav: ['-i',inputName,'-vn','-acodec','pcm_s16le','-ar','44100','-ac','2', out],
        aac: ['-i',inputName,'-vn','-acodec','aac','-b:a','192k', out],
      };
      const argsAudio = {
        mp3: ['-i',inputName,'-acodec','libmp3lame','-q:a','0', out],
        wav: ['-i',inputName,'-acodec','pcm_s16le','-ar','44100','-ac','2', out],
        aac: ['-i',inputName,'-acodec','aac','-b:a','192k', out],
      };

      await ffmpeg.run(...(isAudio ? argsAudio[fmt] : argsVideo[fmt]));

      const mime = { mp3:'audio/mpeg', wav:'audio/wav', aac:'audio/aac' }[fmt];
      const data = ffmpeg.FS('readFile', out);
      const url  = URL.createObjectURL(new Blob([data.buffer], { type: mime }));
      download.href = url; download.download = out; download.style.display = 'inline-block';
      setStatus('Done. Click “Download result”.');
    } catch (e) {
      console.error(e);
      alert('Extract failed: ' + e.message);
      setStatus('Error: ' + e.message);
    } finally {
      enableActions(true); setBar(1);
    }
  });

  // 初始禁用
  enableActions(false);
  setStatus('Waiting for file…');
});
