window.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const uploader = $('uploader'), cutBtn = $('cut'), extractBtn = $('extract');
  const startInput = $('start'), durationInput = $('duration'), audioFmt = $('audioFmt');
  const statusEl = $('status'), bar = $('bar'), download = $('download');

  const setStatus = (m) => statusEl.textContent = m;
  const setBar = (r) => bar.style.width = Math.min(100, Math.round((r || 0) * 100)) + '%';
  const enable = (ok) => { cutBtn.disabled = !ok; extractBtn.disabled = !ok; };

  if (!window.FFmpeg) {
    setStatus('Error: FFmpeg script not loaded. 尝试刷新或检查网络/插件。');
    alert('FFmpeg 未加载成功（脚本被拦截或超时）。请刷新，或关闭拦截插件。');
    return;
  }

  const { createFFmpeg, fetchFile } = window.FFmpeg;
  const CORE_UNPKG   = 'https://unpkg.com/@ffmpeg/core@0.12.4/dist/ffmpeg-core.js';
  const CORE_JSDELIV = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.4/dist/ffmpeg-core.js';

  // 创建实例（支持失败后切换 corePath 重试）
  let ffmpeg = createFFmpeg({ log: true, corePath: CORE_UNPKG });

  async function ensureReady(file, inputName) {
    if (!file) throw new Error('Please choose a file first.');

    // 第一次尝试：unpkg
    try {
      if (!ffmpeg.isLoaded()) {
        setStatus('Loading FFmpeg (unpkg)…');
        await ffmpeg.load();
      }
    } catch (e) {
      // 回退：jsDelivr
      console.warn('unpkg load failed, fallback to jsDelivr', e);
      ffmpeg = createFFmpeg({ log: true, corePath: CORE_JSDELIV });
      setStatus('Loading FFmpeg (jsDelivr)…');
      await ffmpeg.load();
    }

    setStatus('Preparing file…');
    ffmpeg.FS('writeFile', inputName, await fetchFile(file));
    setBar(0);
  }

  let file = null, isAudio = false, inputName = 'input.dat';

  uploader.addEventListener('change', (e) => {
    file = e.target.files?.[0] || null;
    if (!file) { setStatus('Waiting for file…'); return enable(false); }
    const ext = (file.name.split('.').pop() || 'dat').toLowerCase();
    isAudio = (file.type || '').startsWith('audio') || ['mp3','wav','aac','flac','ogg','m4a'].includes(ext);
    inputName = `input.${ext}`;
    setStatus(`Selected: ${file.name} (${Math.round(file.size/1024/1024)} MB)`);
    enable(true); setBar(0);
  });

  ffmpeg.setProgress(({ ratio }) => setBar(ratio));
  ffmpeg.setLogger(() => {});

  // 剪裁
  cutBtn.addEventListener('click', async () => {
    try {
      enable(false);
      await ensureReady(file, inputName);

      const start = (startInput.value || '00:00:00').trim();
      const duration = (durationInput.value || '10').toString();
      setStatus(`Cutting ${isAudio ? 'audio' : 'video'}…`);

      if (isAudio) {
        await ffmpeg.run('-ss', start, '-t', duration, '-i', inputName, '-acodec','libmp3lame','-q:a','0', 'output.mp3');
        const data = ffmpeg.FS('readFile','output.mp3');
        download.href = URL.createObjectURL(new Blob([data.buffer], { type:'audio/mpeg' }));
        download.download = 'cut.mp3';
      } else {
        await ffmpeg.run('-ss', start, '-t', duration, '-i', inputName, '-c:v','libx264','-preset','veryfast','-c:a','aac','-movflags','faststart','output.mp4');
        const data = ffmpeg.FS('readFile','output.mp4');
        download.href = URL.createObjectURL(new Blob([data.buffer], { type:'video/mp4' }));
        download.download = 'cut.mp4';
      }

      download.style.display = 'inline-block';
      setStatus('Done. Click “Download result”.');
    } catch (e) {
      console.error(e); alert('Cut failed: ' + e.message); setStatus('Error: ' + e.message);
    } finally { enable(true); setBar(1); }
  });

  // 抽取/转码
  extractBtn.addEventListener('click', async () => {
    try {
      enable(false);
      await ensureReady(file, inputName);

      const fmt = audioFmt.value; const out = 'audio.' + fmt;
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
      download.href = URL.createObjectURL(new Blob([data.buffer], { type: mime }));
      download.download = out; download.style.display = 'inline-block';
      setStatus('Done. Click “Download result”.');
    } catch (e) {
      console.error(e); alert('Extract failed: ' + e.message); setStatus('Error: ' + e.message);
    } finally { enable(true); setBar(1); }
  });

  enable(false); setStatus('Waiting for file…');
});
