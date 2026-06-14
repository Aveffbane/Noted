// quick.js — логика окна быстрого ввода заметки (идентична редактору)

const noteContent    = document.getElementById('noteContent');
const btnClose       = document.getElementById('btnClose');
const btnSave        = document.getElementById('btnSave');
const btnPhoto       = document.getElementById('btnPhoto');
const btnAudio       = document.getElementById('btnAudio');
const btnStop        = document.getElementById('btnStop');
const photosSection  = document.getElementById('photosSection');
const photosToggle   = document.getElementById('photosToggle');
const photosLabel    = document.getElementById('photosLabel');
const photoGrid      = document.getElementById('photoGrid');
const audiosSection  = document.getElementById('audiosSection');
const audiosToggle   = document.getElementById('audiosToggle');
const audiosLabel    = document.getElementById('audiosLabel');
const audiosList     = document.getElementById('audiosList');
const audioIndicator = document.getElementById('audioIndicator');
const audioTimer     = document.getElementById('audioTimer');
const dropZone       = document.getElementById('dropZone');
const dropOverlay    = document.getElementById('dropOverlay');
const fmtBtns        = document.querySelectorAll('.fmt-btn[data-cmd]');
const fmtColorInput  = document.getElementById('fmtColorInput');
const colorBar       = document.getElementById('colorBar');

let attachedPhotos    = [];
let attachedAudios    = [];
let mediaRecorder     = null;
let audioChunks       = [];
let recordingInterval = null;
let recordingSeconds  = 0;

// ── Инициализация ────────────────────────────────────────────
(async function init() {
  const settings = await window.api.getSettings();
  applyTheme(settings.theme);
  colorBar.style.background = fmtColorInput.value;
  noteContent.focus();
})();

function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
}

window.api.onThemeChanged((theme) => applyTheme(theme));

window.api.onFocusInput(() => {
  noteContent.focus();
  const r = document.createRange(), s = window.getSelection();
  r.selectNodeContents(noteContent); r.collapse(false);
  s.removeAllRanges(); s.addRange(r);
});

// ── Форматирование ───────────────────────────────────────────
fmtBtns.forEach(btn => {
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    noteContent.focus();
    const cmd = btn.dataset.cmd;
    if (cmd.startsWith('formatBlock:')) {
      document.execCommand('formatBlock', false, cmd.split(':')[1]);
    } else {
      document.execCommand(cmd, false, null);
    }
    updateFmtBtns();
  });
});

noteContent.addEventListener('keyup', updateFmtBtns);
noteContent.addEventListener('mouseup', updateFmtBtns);

function updateFmtBtns() {
  fmtBtns.forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (['bold','italic','underline','strikeThrough'].includes(cmd)) {
      try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch(e) {}
    }
  });
}

fmtColorInput.addEventListener('input', () => { colorBar.style.background = fmtColorInput.value; });
fmtColorInput.addEventListener('change', () => {
  noteContent.focus();
  document.execCommand('foreColor', false, fmtColorInput.value);
});

noteContent.addEventListener('input', () => {
  noteContent.classList.toggle('is-empty',
    !noteContent.innerText.trim() && noteContent.innerHTML.replace(/<br\s*\/?>/gi,'').trim() === '');
});

// ── Фото ─────────────────────────────────────────────────────
function addPhotoToGrid(filename, src) {
  attachedPhotos.push(filename);
  const item = document.createElement('div');
  item.className = 'photo-item';
  item.innerHTML = `<img src="${src}" alt=""><button class="del-photo" title="Удалить">×</button>`;
  item.querySelector('.del-photo').addEventListener('click', () => {
    const idx = attachedPhotos.indexOf(filename);
    if (idx !== -1) attachedPhotos.splice(idx, 1);
    item.remove();
    if (!attachedPhotos.length) {
      photosSection.classList.remove('has-photos', 'expanded');
    } else {
      photosLabel.textContent = attachedPhotos.length + ' фото';
    }
  });
  photoGrid.appendChild(item);
  photosSection.classList.add('has-photos', 'expanded');
  photosLabel.textContent = attachedPhotos.length + ' фото';
}

photosToggle.addEventListener('click', () => photosSection.classList.toggle('expanded'));
audiosToggle.addEventListener('click', () => audiosSection.classList.toggle('expanded'));

btnPhoto.addEventListener('click', async () => {
  const result = await window.api.openFileDialog();
  if (result) addPhotoToGrid(result.filename, result.dataURL);
});

document.addEventListener('paste', async (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;
      const buf = await blob.arrayBuffer();
      const ext = item.type.split('/')[1] || 'png';
      const fn = await window.api.savePhoto(Array.from(new Uint8Array(buf)), ext);
      if (fn) {
        const reader = new FileReader();
        reader.onload = ev => addPhotoToGrid(fn, ev.target.result);
        reader.readAsDataURL(blob);
      }
      break;
    }
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer.types.includes('Files')) dropOverlay.classList.add('visible');
});
dropZone.addEventListener('dragleave', (e) => {
  if (!dropZone.contains(e.relatedTarget)) dropOverlay.classList.remove('visible');
});
dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('visible');
  const images = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  for (const img of images) {
    const buf = await img.arrayBuffer();
    const ext = img.name.split('.').pop() || 'jpg';
    const fn = await window.api.savePhoto(Array.from(new Uint8Array(buf)), ext);
    if (fn) {
      const reader = new FileReader();
      reader.onload = ev => addPhotoToGrid(fn, ev.target.result);
      reader.readAsDataURL(img);
    }
  }
});

// ── Аудио ─────────────────────────────────────────────────────
function addAudioToList(filename, srcUrl) {
  attachedAudios.push(filename);
  const item = document.createElement('div');
  item.className = 'audio-item';
  const audioEl = document.createElement('audio');
  audioEl.controls = true;
  audioEl.src = srcUrl;
  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-audio-item';
  removeBtn.title = 'Удалить аудио';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', () => {
    const idx = attachedAudios.indexOf(filename);
    if (idx !== -1) attachedAudios.splice(idx, 1);
    audioEl.pause();
    item.remove();
    if (!attachedAudios.length) {
      audiosSection.classList.remove('has-audios', 'expanded');
    } else {
      audiosLabel.textContent = attachedAudios.length + ' аудио';
    }
  });
  item.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  item.appendChild(audioEl);
  item.appendChild(removeBtn);
  audiosList.appendChild(item);
  audiosSection.classList.add('has-audios', 'expanded');
  audiosLabel.textContent = attachedAudios.length + ' аудио';
}

btnAudio.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording(true);
  else await startRecording();
});

btnStop.addEventListener('click', () => stopRecording(true));

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = []; recordingSeconds = 0;
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(recordingInterval);
      audioIndicator.classList.remove('visible');
      btnAudio.classList.remove('recording');

      if (mediaRecorder._save && audioChunks.length > 0) {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const buf = await blob.arrayBuffer();
        const fn = await window.api.saveAudio(Array.from(new Uint8Array(buf)));
        if (fn) addAudioToList(fn, URL.createObjectURL(blob));
      }
      mediaRecorder = null;
    };

    mediaRecorder.start(200);
    audioIndicator.classList.add('visible');
    btnAudio.classList.add('recording');

    recordingInterval = setInterval(() => {
      recordingSeconds++;
      const m = Math.floor(recordingSeconds / 60), s = recordingSeconds % 60;
      audioTimer.textContent = `${m}:${s.toString().padStart(2,'0')}`;
    }, 1000);

  } catch (e) {
    if (e.name === 'NotAllowedError') alert('Нет доступа к микрофону.');
    else if (e.name === 'NotFoundError') alert('Микрофон не найден.');
    else alert('Ошибка: ' + e.message);
  }
}

function stopRecording(save) {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder._save = save;
    mediaRecorder.stop();
    clearInterval(recordingInterval);
  }
}

// ── Сохранение ───────────────────────────────────────────────
async function saveNote() {
  const html = noteContent.innerHTML;
  const isEmpty = !noteContent.innerText.trim() && attachedPhotos.length === 0 && attachedAudios.length === 0;
  if (isEmpty) {
    noteContent.focus();
    noteContent.style.outline = '2px solid var(--accent)';
    setTimeout(() => { noteContent.style.outline = ''; }, 800);
    return;
  }
  try {
    await window.api.saveNote({ text: html, photos: [...attachedPhotos], audios: [...attachedAudios] });
    window.api.closeQuickWindow();
  } catch (e) {
    console.error('Ошибка сохранения:', e);
    alert('Не удалось сохранить заметку.');
  }
}

btnSave.addEventListener('click', saveNote);

// ── Горячие клавиши ──────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); saveNote(); }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording(false);
    else window.api.closeQuickWindow();
  }
});

btnClose.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording(false);
  window.api.closeQuickWindow();
});
