// Register the service worker so the app keeps working with no connection
// after the very first visit.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  });
}

(function(){
  const $ = id => document.getElementById(id);
  const picker = $('picker'), playerEl = $('player'), video = $('video');
  const fileInput = $('fileInput'), fileName = $('fileName');
  const chrome = $('chrome'), gestureLayer = $('gestureLayer');
  const boostRing = $('boostRing');
  const seek = $('seek'), timeCur = $('timeCur'), timeDur = $('timeDur');
  const playPauseBtn = $('playPause');
  const speedChips = document.querySelectorAll('#speedChips .chip');
  const volumeSlider = $('volume'), muteBtn = $('muteBtn');
  const brightnessSlider = $('brightness'), contrastSlider = $('contrast');
  const loopBtn = $('loopBtn');
  const fullscreenBtn = $('fullscreenBtn'), changeBtn = $('changeBtn');
  const flashes = document.querySelectorAll('#seekFlash');
  const flashLeft = flashes[0], flashRight = flashes[1];
  const skipChips = document.querySelectorAll('#skipChips .chip');
  const audioMode = $('audioMode'), audioTitle = $('audioTitle');

  let baseRate = 1;
  let skipSeconds = 10;
  let isSeeking = false;
  let hideTimer = null;
  let holdTimer = null;
  let isHolding = false;
  let pointerDownTime = 0;

  function fmt(s){
    if(!isFinite(s)) return '0:00';
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s/60), sec = s%60;
    return m + ':' + String(sec).padStart(2,'0');
  }

  function loadSettings(){
    try{
      const raw = localStorage.getItem('offlinePlayerSettings');
      if(!raw) return;
      const s = JSON.parse(raw);
      if(s.brightness) brightnessSlider.value = s.brightness;
      if(s.contrast) contrastSlider.value = s.contrast;
      if(s.volume !== undefined) volumeSlider.value = s.volume;
      if(s.skipSeconds){
        skipSeconds = s.skipSeconds;
        skipChips.forEach(c => c.classList.toggle('active', parseFloat(c.dataset.skip) === skipSeconds));
      }
      applyFilter();
    }catch(e){}
  }
  function saveSettings(){
    try{
      localStorage.setItem('offlinePlayerSettings', JSON.stringify({
        brightness: brightnessSlider.value, contrast: contrastSlider.value, volume: volumeSlider.value,
        skipSeconds: skipSeconds
      }));
    }catch(e){}
  }

  function applyFilter(){
    video.style.filter = `brightness(${brightnessSlider.value}%) contrast(${contrastSlider.value}%)`;
  }

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file) return;
    const url = URL.createObjectURL(file);
    video.src = url;
    fileName.textContent = file.name;
    picker.style.display = 'none';
    playerEl.classList.add('active');

    const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|flac)$/i.test(file.name);
    audioMode.classList.toggle('active', isAudio);
    audioTitle.textContent = file.name;

    loadSettings();
    video.volume = parseFloat(volumeSlider.value);
    video.play().catch(()=>{});
  });

  changeBtn.addEventListener('click', () => fileInput.click());

  // Play / pause
  function togglePlay(){
    if(video.paused){ video.play(); } else { video.pause(); }
  }
  video.addEventListener('play', () => { playPauseBtn.textContent = '❚❚'; scheduleHide(); });
  video.addEventListener('pause', () => { playPauseBtn.textContent = '▶︎'; showChrome(); });
  playPauseBtn.addEventListener('click', togglePlay);

  // Time / seek
  video.addEventListener('loadedmetadata', () => { timeDur.textContent = fmt(video.duration); });
  video.addEventListener('timeupdate', () => {
    if(isSeeking) return;
    timeCur.textContent = fmt(video.currentTime);
    const pct = video.duration ? (video.currentTime/video.duration)*1000 : 0;
    seek.value = pct;
    seek.style.setProperty('--seekPct', (pct/10) + '%');
  });
  seek.addEventListener('input', () => {
    isSeeking = true;
    const t = (seek.value/1000) * (video.duration || 0);
    timeCur.textContent = fmt(t);
    seek.style.setProperty('--seekPct', (seek.value/10) + '%');
  });
  seek.addEventListener('change', () => {
    const t = (seek.value/1000) * (video.duration || 0);
    video.currentTime = t;
    isSeeking = false;
  });

  function flash(el, text){
    if(text !== undefined) el.textContent = text;
    el.classList.add('show');
    setTimeout(()=> el.classList.remove('show'), 500);
  }

  $('back10').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime-skipSeconds); flash(flashLeft, '-'+skipSeconds+'s'); });
  $('fwd10').addEventListener('click', () => { video.currentTime = Math.min(video.duration||0, video.currentTime+skipSeconds); flash(flashRight, '+'+skipSeconds+'s'); });

  skipChips.forEach(chip => {
    chip.addEventListener('click', () => {
      skipChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      skipSeconds = parseFloat(chip.dataset.skip);
      saveSettings();
    });
  });

  // Speed chips
  speedChips.forEach(chip => {
    chip.addEventListener('click', () => {
      speedChips.forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      baseRate = parseFloat(chip.dataset.speed);
      video.playbackRate = baseRate;
    });
  });

  // Volume / mute
  volumeSlider.addEventListener('input', () => {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = false;
    muteBtn.classList.remove('on'); muteBtn.textContent = 'Mute';
    saveSettings();
  });
  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    muteBtn.classList.toggle('on', video.muted);
    muteBtn.textContent = video.muted ? 'Muted' : 'Mute';
  });

  // Brightness / contrast
  brightnessSlider.addEventListener('input', () => { applyFilter(); saveSettings(); });
  contrastSlider.addEventListener('input', () => { applyFilter(); saveSettings(); });

  // Loop
  loopBtn.addEventListener('click', () => {
    video.loop = !video.loop;
    loopBtn.classList.toggle('on', video.loop);
    loopBtn.textContent = video.loop ? 'On' : 'Off';
  });

  // Fullscreen
  fullscreenBtn.addEventListener('click', () => {
    if(video.webkitEnterFullscreen){ video.webkitEnterFullscreen(); }
    else if(playerEl.requestFullscreen){ playerEl.requestFullscreen(); }
  });

  // Chrome show/hide
  function showChrome(){
    chrome.classList.remove('hidden');
    clearTimeout(hideTimer);
    if(!video.paused){
      hideTimer = setTimeout(()=> chrome.classList.add('hidden'), 3000);
    }
  }
  function scheduleHide(){ showChrome(); }

  // Gesture layer: tap to toggle chrome/play, double-tap sides to seek, hold to boost speed
  let lastTap = 0;
  gestureLayer.addEventListener('pointerdown', e => {
    pointerDownTime = Date.now();
    holdTimer = setTimeout(() => {
      isHolding = true;
      video.playbackRate = Math.max(baseRate*2, 2);
      boostRing.textContent = Math.max(baseRate*2,2).toFixed(2).replace(/\.00$/,'') + '×';
      boostRing.classList.add('show');
    }, 350);
  });

  function endHold(){
    clearTimeout(holdTimer);
    if(isHolding){
      isHolding = false;
      video.playbackRate = baseRate;
      boostRing.classList.remove('show');
    }
  }

  gestureLayer.addEventListener('pointerup', e => {
    const heldFor = Date.now() - pointerDownTime;
    const wasHolding = isHolding;
    endHold();
    if(!wasHolding && heldFor < 350){
      const now = Date.now();
      const width = gestureLayer.clientWidth;
      const x = e.clientX;
      if(now - lastTap < 300){
        if(x < width*0.4){ video.currentTime = Math.max(0, video.currentTime-skipSeconds); flash(flashLeft, '-'+skipSeconds+'s'); }
        else if(x > width*0.6){ video.currentTime = Math.min(video.duration||0, video.currentTime+skipSeconds); flash(flashRight, '+'+skipSeconds+'s'); }
        lastTap = 0;
      } else {
        lastTap = now;
        if(chrome.classList.contains('hidden')){ showChrome(); }
        else { togglePlay(); showChrome(); }
      }
    }
    showChrome();
  });
  gestureLayer.addEventListener('pointercancel', endHold);
  gestureLayer.addEventListener('pointerleave', endHold);

  document.addEventListener('visibilitychange', () => { if(document.hidden) endHold(); });
})();
