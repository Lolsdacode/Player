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
  const seek = $('seekTrack'), seekFill = $('seekFill'), seekThumb = $('seekThumb');
  const seekSpinner = $('seekSpinner');
  const timeCur = $('timeCur'), timeDur = $('timeDur');
  const playPauseBtn = $('playPause'), playPauseUse = $('playPauseUse');
  const speedSelect = $('speedSelect'), skipSelect = $('skipSelect');
  const volumeSlider = $('volume'), muteBtn = $('muteBtn'), muteUse = $('muteUse');
  const brightnessSlider = $('brightness'), contrastSlider = $('contrast');
  const loopBtn = $('loopBtn');
  const fullscreenBtn = $('fullscreenBtn'), changeBtn = $('changeBtn');
  const flashes = document.querySelectorAll('#seekFlash');
  const flashLeft = flashes[0], flashRight = flashes[1];
  const audioMode = $('audioMode'), audioTitle = $('audioTitle');
  const toast = $('toast');
  const lockBtn = $('lockBtn'), unlockBtn = $('unlockBtn');
  const settingsBtn = $('settingsBtn'), settingsClose = $('settingsClose');
  const settingsPanel = $('settingsPanel'), settingsBackdrop = $('settingsBackdrop');
  const resetExposureBtn = $('resetExposureBtn');
  const accentColor = $('accentColor'), accentColorLabel = $('accentColorLabel'), resetAccentBtn = $('resetAccentBtn');

  let baseRate = 1;
  let skipSeconds = 10;
  let hideTimer = null;
  let holdTimer = null;
  let isHolding = false;
  let isLocked = false;
  let seekDragging = false;
  let pointerDownTime = 0;
  let toastTimer = null;

  const DEFAULT_ACCENT = '#f2a93b';

  function hexToRgb(hex){
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if(!m) return '242,169,59';
    return `${parseInt(m[1],16)}, ${parseInt(m[2],16)}, ${parseInt(m[3],16)}`;
  }
  function applyAccent(hex){
    document.documentElement.style.setProperty('--amber', hex);
    document.documentElement.style.setProperty('--amber-rgb', hexToRgb(hex));
    accentColor.value = hex;
    accentColorLabel.textContent = hex.toUpperCase();
  }

  function fmt(s){
    if(!isFinite(s)) return '0:00';
    s = Math.max(0, Math.floor(s));
    const m = Math.floor(s/60), sec = s%60;
    return m + ':' + String(sec).padStart(2,'0');
  }

  function showToast(msg){
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function loadSettings(){
    try{
      const raw = localStorage.getItem('offlinePlayerSettings');
      if(!raw) return;
      const s = JSON.parse(raw);
      if(s.brightness) brightnessSlider.value = s.brightness;
      if(s.contrast) contrastSlider.value = s.contrast;
      if(s.volume !== undefined) volumeSlider.value = s.volume;
      if(s.skipSeconds){ skipSeconds = s.skipSeconds; skipSelect.value = String(skipSeconds); }
      if(s.accent){ applyAccent(s.accent); }
      applyFilter();
    }catch(e){}
  }
  function saveSettings(){
    try{
      localStorage.setItem('offlinePlayerSettings', JSON.stringify({
        brightness: brightnessSlider.value, contrast: contrastSlider.value, volume: volumeSlider.value,
        skipSeconds: skipSeconds, accent: accentColor.value
      }));
    }catch(e){}
  }
  loadSettings(); // apply persisted accent color etc. right away, not just after picking a file

  function applyFilter(){
    video.style.filter = `brightness(${brightnessSlider.value}%) contrast(${contrastSlider.value}%)`;
  }

  fileInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if(!file){ return; }
    const url = URL.createObjectURL(file);
    video.pause();
    video.src = url;
    fileName.textContent = file.name;
    picker.style.display = 'none';
    playerEl.classList.add('active');
    resetZoom();

    const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|flac|ogg)$/i.test(file.name);
    audioMode.classList.toggle('active', isAudio);
    audioTitle.textContent = file.name;

    loadSettings();
    video.volume = parseFloat(volumeSlider.value);
    video.load();
    video.play().catch(() => showToast('Tap ▶ to start playback'));

    // Reset so choosing the same file again (or a new one) always fires 'change'
    e.target.value = '';
  });

  changeBtn.addEventListener('click', () => fileInput.click());

  video.addEventListener('error', () => showToast('Could not play this file — format may be unsupported'));

  // Play / pause
  function togglePlay(){
    if(video.paused){ video.play().catch(() => showToast('Tap ▶ to start playback')); }
    else { video.pause(); }
  }
  video.addEventListener('play', () => { playPauseUse.setAttribute('href', '#icon-pause'); scheduleHide(); });
  video.addEventListener('pause', () => { playPauseUse.setAttribute('href', '#icon-play'); showChrome(); });
  playPauseBtn.addEventListener('click', togglePlay);

  // Time / seek — custom scrubber: dragging the thumb is the only way to seek,
  // tapping elsewhere on the track does nothing.
  video.addEventListener('loadedmetadata', () => { timeDur.textContent = fmt(video.duration); });
  video.addEventListener('timeupdate', () => {
    if(seekDragging) return;
    timeCur.textContent = fmt(video.currentTime);
    const pct = video.duration ? (video.currentTime/video.duration)*100 : 0;
    seekFill.style.width = pct + '%';
    seekThumb.style.left = pct + '%';
  });

  function pctFromPointer(e){
    const rect = seek.getBoundingClientRect();
    let pct = ((e.clientX - rect.left) / rect.width) * 100;
    return Math.max(0, Math.min(100, pct));
  }

  seekThumb.addEventListener('pointerdown', e => {
    seekDragging = true;
    seekThumb.setPointerCapture(e.pointerId);
  });
  seekThumb.addEventListener('pointermove', e => {
    if(!seekDragging) return;
    const pct = pctFromPointer(e);
    seekFill.style.width = pct + '%';
    seekThumb.style.left = pct + '%';
    timeCur.textContent = fmt((pct/100) * (video.duration || 0));
  });
  function finishSeekDrag(e){
    if(!seekDragging) return;
    seekDragging = false;
    const pct = pctFromPointer(e);
    video.currentTime = (pct/100) * (video.duration || 0);
  }
  seekThumb.addEventListener('pointerup', finishSeekDrag);
  seekThumb.addEventListener('pointercancel', () => { seekDragging = false; });

  // Loading indicator for the brief stall that can happen on seek
  video.addEventListener('seeking', () => seekSpinner.classList.add('show'));
  video.addEventListener('seeked', () => seekSpinner.classList.remove('show'));
  video.addEventListener('waiting', () => seekSpinner.classList.add('show'));
  video.addEventListener('playing', () => seekSpinner.classList.remove('show'));
  video.addEventListener('canplay', () => seekSpinner.classList.remove('show'));

  function flash(el, text){
    if(text !== undefined) el.textContent = text;
    el.classList.add('show');
    setTimeout(()=> el.classList.remove('show'), 500);
  }

  $('back10').addEventListener('click', () => { video.currentTime = Math.max(0, video.currentTime-skipSeconds); flash(flashLeft, '-'+skipSeconds+'s'); });
  $('fwd10').addEventListener('click', () => { video.currentTime = Math.min(video.duration||0, video.currentTime+skipSeconds); flash(flashRight, '+'+skipSeconds+'s'); });

  skipSelect.addEventListener('change', () => {
    skipSeconds = parseFloat(skipSelect.value);
    saveSettings();
  });

  speedSelect.addEventListener('change', () => {
    baseRate = parseFloat(speedSelect.value);
    video.playbackRate = baseRate;
  });

  // Volume / mute
  volumeSlider.addEventListener('input', () => {
    video.volume = parseFloat(volumeSlider.value);
    video.muted = false;
    muteBtn.classList.remove('on');
    muteUse.setAttribute('href', '#icon-volume');
    saveSettings();
  });
  muteBtn.addEventListener('click', () => {
    video.muted = !video.muted;
    muteBtn.classList.toggle('on', video.muted);
    muteUse.setAttribute('href', video.muted ? '#icon-mute' : '#icon-volume');
  });

  // Brightness / contrast
  brightnessSlider.addEventListener('input', () => { applyFilter(); saveSettings(); });
  contrastSlider.addEventListener('input', () => { applyFilter(); saveSettings(); });
  resetExposureBtn.addEventListener('click', () => {
    brightnessSlider.value = 100;
    contrastSlider.value = 100;
    applyFilter();
    saveSettings();
  });

  accentColor.addEventListener('input', () => { applyAccent(accentColor.value); saveSettings(); });
  resetAccentBtn.addEventListener('click', () => { applyAccent(DEFAULT_ACCENT); saveSettings(); });

  // Settings menu
  function openSettings(){ clearTimeout(hideTimer); settingsPanel.classList.add('open'); }
  function closeSettings(){ settingsPanel.classList.remove('open'); showChrome(); }
  settingsBtn.addEventListener('click', openSettings);
  settingsClose.addEventListener('click', closeSettings);
  settingsBackdrop.addEventListener('click', closeSettings);

  // Loop
  loopBtn.addEventListener('click', () => {
    video.loop = !video.loop;
    loopBtn.classList.toggle('on', video.loop);
    loopBtn.querySelector('span').textContent = video.loop ? 'On' : 'Off';
  });

  // Fullscreen
  fullscreenBtn.addEventListener('click', () => {
    try{
      if(video.webkitEnterFullscreen){ video.webkitEnterFullscreen(); }
      else if(playerEl.requestFullscreen){ playerEl.requestFullscreen().catch(() => showToast('Fullscreen not supported here')); }
      else{ showToast('Fullscreen not supported here'); }
    }catch(err){ showToast('Fullscreen not supported here'); }
  });

  // Lock screen
  let lockFadeTimer = null;
  function scheduleLockFade(){
    clearTimeout(lockFadeTimer);
    lockFadeTimer = setTimeout(() => unlockBtn.classList.add('faded'), 3000);
  }
  function revealLockIndicator(){
    unlockBtn.classList.remove('faded');
    scheduleLockFade();
  }

  lockBtn.addEventListener('click', () => {
    isLocked = true;
    playerEl.classList.add('locked');
    chrome.classList.add('hidden');
    clearTimeout(hideTimer);
    revealLockIndicator();
  });
  const lockOverlay = $('lockOverlay');
  lockOverlay.addEventListener('pointerdown', e => {
    const wasFaded = unlockBtn.classList.contains('faded');
    revealLockIndicator();
    if(wasFaded){ e.preventDefault(); } // first tap while faded just brings it back, doesn't unlock
  }, true);
  unlockBtn.addEventListener('click', () => {
    if(unlockBtn.classList.contains('faded')) return;
    isLocked = false;
    playerEl.classList.remove('locked');
    clearTimeout(lockFadeTimer);
    showChrome();
  });

  // Chrome show/hide
  function showChrome(){
    if(isLocked) return;
    chrome.classList.remove('hidden');
    clearTimeout(hideTimer);
    if(!video.paused){
      hideTimer = setTimeout(()=> chrome.classList.add('hidden'), 3000);
    }
  }
  function scheduleHide(){ showChrome(); }

  // Gesture layer: tap to toggle chrome, double-tap sides to seek, hold to boost speed,
  // two-finger pinch to zoom into the video, one-finger drag to pan once zoomed.
  let lastTap = 0;
  const activePointers = new Map();
  let zoomScale = 1, originX = 50, originY = 50;
  let pinchStartDist = 0, pinchStartScale = 1;
  let panPointerId = null, panStartX = 0, panStartY = 0, panStartOriginX = 50, panStartOriginY = 50;
  let dragMoved = false;

  function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }
  function dist(a, b){ return Math.hypot(a.x - b.x, a.y - b.y); }
  function applyZoomTransform(){
    video.style.transformOrigin = originX + '% ' + originY + '%';
    video.style.transform = zoomScale === 1 ? '' : `scale(${zoomScale})`;
  }
  function resetZoom(){
    zoomScale = 1; originX = 50; originY = 50;
    video.style.transform = '';
    video.style.transformOrigin = '';
  }

  gestureLayer.addEventListener('pointerdown', e => {
    activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

    if(activePointers.size === 2){
      // a second finger just landed — this is now a pinch, not a tap/hold
      clearTimeout(holdTimer);
      isHolding = false;
      boostRing.classList.remove('show');
      panPointerId = null;
      const pts = [...activePointers.values()];
      pinchStartDist = dist(pts[0], pts[1]) || 1;
      pinchStartScale = zoomScale;
      return;
    }
    if(activePointers.size > 2) return;

    if(isLocked) return;
    pointerDownTime = Date.now();
    dragMoved = false;
    if(zoomScale > 1){
      panPointerId = e.pointerId;
      panStartX = e.clientX; panStartY = e.clientY;
      panStartOriginX = originX; panStartOriginY = originY;
    } else {
      holdTimer = setTimeout(() => {
        isHolding = true;
        video.playbackRate = Math.max(baseRate*2, 2);
        boostRing.textContent = Math.max(baseRate*2,2).toFixed(2).replace(/\.00$/,'') + '×';
        boostRing.classList.add('show');
      }, 350);
    }
  });

  gestureLayer.addEventListener('pointermove', e => {
    if(!activePointers.has(e.pointerId)) return;
    activePointers.set(e.pointerId, {x: e.clientX, y: e.clientY});

    if(activePointers.size >= 2){
      const pts = [...activePointers.values()];
      const newDist = dist(pts[0], pts[1]) || 1;
      zoomScale = clamp(pinchStartScale * (newDist / pinchStartDist), 1, 4);
      const rect = gestureLayer.getBoundingClientRect();
      const midX = (pts[0].x + pts[1].x) / 2, midY = (pts[0].y + pts[1].y) / 2;
      originX = clamp(((midX - rect.left) / rect.width) * 100, 0, 100);
      originY = clamp(((midY - rect.top) / rect.height) * 100, 0, 100);
      applyZoomTransform();
      return;
    }

    if(panPointerId === e.pointerId && zoomScale > 1){
      const dx = e.clientX - panStartX, dy = e.clientY - panStartY;
      if(Math.abs(dx) > 6 || Math.abs(dy) > 6) dragMoved = true;
      const rect = gestureLayer.getBoundingClientRect();
      originX = clamp(panStartOriginX - (dx / rect.width) * 100 / zoomScale, 0, 100);
      originY = clamp(panStartOriginY - (dy / rect.height) * 100 / zoomScale, 0, 100);
      applyZoomTransform();
    }
  });

  function endHold(){
    clearTimeout(holdTimer);
    if(isHolding){
      isHolding = false;
      video.playbackRate = baseRate;
      boostRing.classList.remove('show');
    }
  }

  function releasePointer(e){
    activePointers.delete(e.pointerId);
    if(panPointerId === e.pointerId) panPointerId = null;
  }

  gestureLayer.addEventListener('pointerup', e => {
    const wasPanning = panPointerId === e.pointerId && dragMoved;
    const stillMultiTouch = activePointers.size > 1;
    releasePointer(e);

    if(stillMultiTouch) return; // a pinch is still in progress with the remaining finger

    const heldFor = Date.now() - pointerDownTime;
    const wasHolding = isHolding;
    endHold(); // always clean up the speed-boost state, even if locked mid-hold
    if(isLocked || wasPanning) return;
    if(wasHolding || heldFor >= 350) return;

    const now = Date.now();
    const width = gestureLayer.clientWidth;
    const x = e.clientX;
    if(now - lastTap < 300){
      if(x < width*0.4){ video.currentTime = Math.max(0, video.currentTime-skipSeconds); flash(flashLeft, '-'+skipSeconds+'s'); }
      else if(x > width*0.6){ video.currentTime = Math.min(video.duration||0, video.currentTime+skipSeconds); flash(flashRight, '+'+skipSeconds+'s'); }
      else if(zoomScale > 1){ resetZoom(); }
      lastTap = 0;
      return;
    }
    lastTap = now;
    // single tap: only shows/hides the controls, never plays or pauses
    if(chrome.classList.contains('hidden')){ showChrome(); }
    else { chrome.classList.add('hidden'); clearTimeout(hideTimer); }
  });
  gestureLayer.addEventListener('pointercancel', e => { releasePointer(e); endHold(); });
  gestureLayer.addEventListener('pointerleave', e => { releasePointer(e); endHold(); });

  document.addEventListener('visibilitychange', () => { if(document.hidden) endHold(); });
})();
