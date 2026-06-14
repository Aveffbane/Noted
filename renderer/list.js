// list.js — логика главного окна (список / редактор / настройки)

// ── DOM-элементы ──────────────────────────────────────────────
const notesList    = document.getElementById('notesList');
const searchInput  = document.getElementById('searchInput');
const searchClear  = document.getElementById('searchClear');
const btnNew       = document.getElementById('btnNew');
const btnSettings  = document.getElementById('btnSettings');
const btnClose     = document.getElementById('btnClose');

const editorArea         = document.getElementById('editorArea');
const editorTitle        = document.getElementById('editorTitle');
const editorBack         = document.getElementById('editorBack');
const editorClose        = document.getElementById('editorClose');
const editorDelete       = document.getElementById('editorDelete');
const editorSave         = document.getElementById('editorSave');
const editorPhotoGrid    = document.getElementById('editorPhotoGrid');
const editorPhotosSection = document.getElementById('editorPhotosSection');
const editorPhotosToggle  = document.getElementById('editorPhotosToggle');
const editorPhotosLabel   = document.getElementById('editorPhotosLabel');
const editorAudioIndicator = document.getElementById('editorAudioIndicator');
const editorAudioTimer   = document.getElementById('editorAudioTimer');
const editorBtnStop      = document.getElementById('editorBtnStop');
const editorAudiosSection = document.getElementById('editorAudiosSection');
const editorAudiosToggle  = document.getElementById('editorAudiosToggle');
const editorAudiosLabel   = document.getElementById('editorAudiosLabel');
const editorAudiosList   = document.getElementById('editorAudiosList');
const editorBtnPhoto     = document.getElementById('editorBtnPhoto');
const editorBtnAudio     = document.getElementById('editorBtnAudio');
const editorDropOverlay  = document.getElementById('editorDropOverlay');
const fmtBtns            = document.querySelectorAll('.fmt-btn[data-cmd]');
const fmtColorInput      = document.getElementById('fmtColorInput');
const colorBar           = document.getElementById('colorBar');
const photoZoomOverlay   = document.getElementById('photoZoomOverlay');
const photoZoomImg       = document.getElementById('photoZoomImg');

const settingsBack   = document.getElementById('settingsBack');
const settingsClose  = document.getElementById('settingsClose');
const settingsCancel = document.getElementById('settingsCancel');
const settingsSave   = document.getElementById('settingsSave');
const btnOpenFolder  = document.getElementById('btnOpenFolder');
const hotkeyQuickInput = document.getElementById('hotkeyQuick');
const hotkeyListInput  = document.getElementById('hotkeyList');
const autoLaunchCheck  = document.getElementById('autoLaunch');
const themeDarkBtn   = document.getElementById('themeDark');
const themeLightBtn  = document.getElementById('themeLight');

const dialogOverlay = document.getElementById('dialogOverlay');
const dialogTitle   = document.getElementById('dialogTitle');
const dialogMsg     = document.getElementById('dialogMsg');
const dialogYes     = document.getElementById('dialogYes');
const dialogNo      = document.getElementById('dialogNo');

// ── Состояние ─────────────────────────────────────────────────
let allNotes = [];
let currentSearchQuery = '';
let currentNoteId = null;

let editorPhotos   = [];  // массив имён файлов фото
let editorAudios   = [];  // массив имён файлов аудио
let editorDirty    = false;

let mediaRecorder    = null;
let audioChunks      = [];
let recordingInterval = null;
let recordingSeconds  = 0;

let savedSettings = {};

// ── Инициализация ─────────────────────────────────────────────
(async function init() {
  const settings = await window.api.getSettings();
  savedSettings = settings;
  applyTheme(settings.theme);
  colorBar.style.background = fmtColorInput.value;
  await loadAndRender();
})();

window.api.onNotesUpdated(async () => loadAndRender());
window.api.onThemeChanged((t) => applyTheme(t));
window.api.onNavigateSettings(() => navigateTo('settings'));

// ── Навигация между экранами ──────────────────────────────────
function navigateTo(view, data = {}) {
  ['viewList', 'viewEditor', 'viewSettings'].forEach(id => {
    document.getElementById(id).classList.remove('active');
  });
  document.getElementById('view' + view[0].toUpperCase() + view.slice(1)).classList.add('active');

  if (view === 'list') loadAndRender();
  else if (view === 'editor') openEditor(data.noteId || null);
  else if (view === 'settings') loadSettingsForm();
}

// ── Кастомный диалог подтверждения ───────────────────────────
function showConfirm(title, msg, yesLabel = 'Выйти', noLabel = 'Отмена') {
  return new Promise((resolve) => {
    dialogTitle.textContent = title;
    dialogMsg.textContent   = msg;
    dialogYes.textContent   = yesLabel;
    dialogNo.textContent    = noLabel;
    dialogOverlay.classList.add('visible');

    function done(result) {
      dialogOverlay.classList.remove('visible');
      dialogYes.removeEventListener('click', yes);
      dialogNo.removeEventListener('click', no);
      resolve(result);
      // Возвращаем фокус редактору если отмена
      if (!result) setTimeout(() => editorArea.focus(), 30);
    }
    const yes = () => done(true);
    const no  = () => done(false);
    dialogYes.addEventListener('click', yes);
    dialogNo.addEventListener('click', no);
  });
}

// Закрыть диалог по Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dialogOverlay.classList.contains('visible')) {
    dialogOverlay.classList.remove('visible');
  }
});

// ── Тема ──────────────────────────────────────────────────────
function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
}

// ── СПИСОК: загрузка и рендер ─────────────────────────────────
async function loadAndRender() {
  allNotes = await window.api.getNotes();
  renderNotes(filterNotes(currentSearchQuery));
}

function filterNotes(q) {
  if (!q.trim()) return allNotes;
  const lq = q.toLowerCase();
  return allNotes.filter(n => stripHtml(n.text || '').toLowerCase().includes(lq));
}

async function renderNotes(notes) {
  notesList.innerHTML = '';
  if (notes.length === 0) {
    const el = document.createElement('div');
    el.className = 'empty-state';
    el.innerHTML = currentSearchQuery
      ? `<div class="empty-icon">?</div><p>По запросу «${escHtml(currentSearchQuery)}» ничего не найдено</p>`
      : `<div class="empty-icon" style="opacity:.25"><svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></div><p>Нажмите <strong>+</strong> чтобы создать первую заметку</p>`;
    notesList.appendChild(el);
    return;
  }
  for (const note of notes) notesList.appendChild(await createCard(note));
}

async function createCard(note) {
  const card = document.createElement('div');
  card.className = 'note-card';

  const plain = stripHtml(note.text || '');
  const textEl = plain
    ? `<div class="note-text-preview">${escHtml(plain)}</div>`
    : `<div class="note-text-preview empty">Без текста</div>`;

  const photos = getPhotos(note);
  let thumbHtml = '';
  if (photos.length > 0) {
    thumbHtml = `<div class="note-thumb-wrap">
      <img class="note-thumb" data-fn="${escHtml(photos[0])}" src="" alt="">
      ${photos.length > 1 ? `<span class="note-thumb-count">+${photos.length - 1}</span>` : ''}
    </div>`;
  }

  const noteAudios = Array.isArray(note.audios) ? note.audios : (note.audio ? [note.audio] : []);
  const audioBadge = noteAudios.length > 0 ? `<span class="note-badge">${noteAudios.length > 1 ? noteAudios.length + ' аудио' : 'Аудио'}</span>` : '';
  const photoBadge = photos.length > 0 ? `<span class="note-badge">${photos.length} фото</span>` : '';

  card.innerHTML = `
    <div class="note-top">
      <div style="flex:1;min-width:0">${textEl}</div>
      ${thumbHtml}
    </div>
    <div class="note-meta">${audioBadge}${photoBadge}<span class="note-date">${fmtDate(note.createdAt)}</span></div>
    <button class="note-del" title="Удалить">
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
    </button>
  `;

  if (photos.length > 0) {
    const img = card.querySelector('.note-thumb');
    window.api.getAttachmentPath(photos[0]).then(p => { img.src = 'file://' + p; });
  }

  card.addEventListener('click', (e) => {
    if (e.target.closest('.note-del')) return;
    navigateTo('editor', { noteId: note.id });
  });

  card.querySelector('.note-del').addEventListener('click', async (e) => {
    e.stopPropagation();
    const ok = await showConfirm('Удаление', 'Удалить эту заметку?', 'Удалить', 'Отмена');
    if (ok) { await window.api.deleteNote(note.id); await loadAndRender(); }
  });

  return card;
}

// Поиск
searchInput.addEventListener('input', () => {
  currentSearchQuery = searchInput.value;
  searchClear.classList.toggle('visible', currentSearchQuery.length > 0);
  renderNotes(filterNotes(currentSearchQuery));
});
searchClear.addEventListener('click', () => {
  searchInput.value = ''; currentSearchQuery = '';
  searchClear.classList.remove('visible');
  renderNotes(allNotes); searchInput.focus();
});

btnNew.addEventListener('click', () => navigateTo('editor', { noteId: null }));
btnSettings.addEventListener('click', () => navigateTo('settings'));
btnClose.addEventListener('click', () => window.api.closeWindow());

// ── РЕДАКТОР: открытие ────────────────────────────────────────
async function openEditor(noteId) {
  currentNoteId = noteId;
  editorDirty   = false;
  editorPhotos  = [];
  editorAudios  = [];

  editorArea.innerHTML = '';
  editorArea.classList.add('is-empty');
  editorPhotoGrid.innerHTML = '';
  editorPhotosSection.classList.remove('has-photos', 'expanded');
  editorAudioIndicator.classList.remove('visible');
  editorAudiosList.innerHTML = '';
  editorAudiosSection.classList.remove('has-audios', 'expanded');
  stopRecording(false);

  if (noteId) {
    editorTitle.textContent = 'Заметка';
    editorDelete.style.display = '';
    const note = allNotes.find(n => n.id === noteId);
    if (!note) { navigateTo('list'); return; }

    if (note.text) { editorArea.innerHTML = note.text; editorArea.classList.remove('is-empty'); }

    const photos = getPhotos(note);
    for (const fn of photos) {
      const fp = await window.api.getAttachmentPath(fn);
      addPhotoToGrid(fn, 'file://' + fp);
    }

    const audios = note.audios || (note.audio ? [note.audio] : []);
    for (const fn of audios) {
      const fp = await window.api.getAttachmentPath(fn);
      addAudioToList(fn, 'file://' + fp);
    }
  } else {
    editorTitle.textContent = 'Новая заметка';
    editorDelete.style.display = 'none';
  }

  setTimeout(() => {
    editorArea.focus();
    const r = document.createRange(), s = window.getSelection();
    r.selectNodeContents(editorArea); r.collapse(false);
    s.removeAllRanges(); s.addRange(r);
  }, 50);
}

// Добавить фото в сетку
function addPhotoToGrid(filename, src) {
  editorPhotos.push(filename);
  const item = document.createElement('div');
  item.className = 'photo-item';
  item.innerHTML = `<img src="${src}" alt="Фото"><button class="del-photo" title="Удалить фото">×</button>`;
  const img = item.querySelector('img');
  img.addEventListener('click', () => { photoZoomImg.src = img.src; photoZoomOverlay.classList.add('visible'); });
  item.querySelector('.del-photo').addEventListener('click', () => {
    const idx = editorPhotos.indexOf(filename);
    if (idx !== -1) editorPhotos.splice(idx, 1);
    item.remove();
    if (!editorPhotos.length) {
      editorPhotosSection.classList.remove('has-photos', 'expanded');
    } else {
      editorPhotosLabel.textContent = editorPhotos.length + ' фото';
    }
    editorDirty = true;
  });
  editorPhotoGrid.appendChild(item);
  editorPhotosSection.classList.add('has-photos', 'expanded');
  editorPhotosLabel.textContent = editorPhotos.length + ' фото';
}

photoZoomOverlay.addEventListener('click', () => photoZoomOverlay.classList.remove('visible'));
editorPhotosToggle.addEventListener('click', () => editorPhotosSection.classList.toggle('expanded'));
editorAudiosToggle.addEventListener('click', () => editorAudiosSection.classList.toggle('expanded'));

function addAudioToList(filename, srcUrl) {
  editorAudios.push(filename);
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
    const idx = editorAudios.indexOf(filename);
    if (idx !== -1) editorAudios.splice(idx, 1);
    audioEl.pause();
    item.remove();
    if (!editorAudios.length) {
      editorAudiosSection.classList.remove('has-audios', 'expanded');
    } else {
      editorAudiosLabel.textContent = editorAudios.length + ' аудио';
    }
    editorDirty = true;
  });
  item.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="flex-shrink:0"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`;
  item.appendChild(audioEl);
  item.appendChild(removeBtn);
  editorAudiosList.appendChild(item);
  editorAudiosSection.classList.add('has-audios', 'expanded');
  editorAudiosLabel.textContent = editorAudios.length + ' аудио';
}

// Отслеживание изменений в редакторе
editorArea.addEventListener('input', () => {
  editorDirty = true;
  editorArea.classList.toggle('is-empty',
    !editorArea.innerText.trim() && editorArea.innerHTML.replace(/<br\s*\/?>/gi, '').trim() === '');
  updateFmtBtns();
});
editorArea.addEventListener('keyup', updateFmtBtns);
editorArea.addEventListener('mouseup', updateFmtBtns);

// ── ФОРМАТИРОВАНИЕ ─────────────────────────────────────────────
function updateFmtBtns() {
  fmtBtns.forEach(btn => {
    const cmd = btn.dataset.cmd;
    if (['bold','italic','underline','strikeThrough'].includes(cmd)) {
      try { btn.classList.toggle('active', document.queryCommandState(cmd)); } catch(e) {}
    }
  });
}

fmtBtns.forEach(btn => {
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    editorArea.focus();
    const cmd = btn.dataset.cmd;
    if (cmd.startsWith('formatBlock:')) {
      document.execCommand('formatBlock', false, cmd.split(':')[1]);
    } else {
      document.execCommand(cmd, false, null);
    }
    updateFmtBtns();
    editorDirty = true;
  });
});

// Цвет текста
fmtColorInput.addEventListener('input', () => {
  colorBar.style.background = fmtColorInput.value;
});
fmtColorInput.addEventListener('change', () => {
  editorArea.focus();
  document.execCommand('foreColor', false, fmtColorInput.value);
  editorDirty = true;
});

// ── КНОПКИ РЕДАКТОРА ─────────────────────────────────────────
editorBack.addEventListener('click', async () => {
  if (editorDirty) {
    const ok = await showConfirm('Несохранённые изменения', 'Выйти без сохранения?', 'Выйти', 'Остаться');
    if (!ok) return;
  }
  editorAudiosList.querySelectorAll('audio').forEach(a => a.pause());
  stopRecording(false);
  navigateTo('list');
});

editorClose.addEventListener('click', () => {
  editorAudiosList.querySelectorAll('audio').forEach(a => a.pause());
  stopRecording(false);
  window.api.closeWindow();
});

editorDelete.addEventListener('click', async () => {
  if (!currentNoteId) return;
  const ok = await showConfirm('Удаление', 'Удалить эту заметку без возможности восстановления?', 'Удалить', 'Отмена');
  if (!ok) return;
  await window.api.deleteNote(currentNoteId);
  stopRecording(false);
  navigateTo('list');
});

editorSave.addEventListener('click', saveEditor);

async function saveEditor() {
  const html  = editorArea.innerHTML;
  const empty = !editorArea.innerText.trim() && editorPhotos.length === 0 && editorAudios.length === 0;
  if (empty) {
    editorArea.focus();
    editorArea.style.outline = '2px solid var(--accent)';
    setTimeout(() => { editorArea.style.outline = ''; }, 700);
    return;
  }

  const data = { text: html, photos: [...editorPhotos], audios: [...editorAudios] };

  if (currentNoteId) {
    await window.api.updateNote(currentNoteId, data);
  } else {
    await window.api.saveNote(data);
  }
  editorDirty = false;
  editorAudioEl.pause();
  navigateTo('list');
}

// Ctrl+Enter → сохранить
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key === 'Enter' && document.getElementById('viewEditor').classList.contains('active')) {
    e.preventDefault(); saveEditor();
  }
});

// ── РЕДАКТОР: прикрепление фото ──────────────────────────────
editorBtnPhoto.addEventListener('click', addPhotoFromDialog);

async function addPhotoFromDialog() {
  const result = await window.api.openFileDialog();
  if (result) { addPhotoToGrid(result.filename, result.dataURL); editorDirty = true; }
}

document.addEventListener('paste', async (e) => {
  if (!document.getElementById('viewEditor').classList.contains('active')) return;
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;
      const buf = await blob.arrayBuffer();
      const ext = item.type.split('/')[1] || 'png';
      const fn  = await window.api.savePhoto(Array.from(new Uint8Array(buf)), ext);
      if (fn) {
        const reader = new FileReader();
        reader.onload = ev => addPhotoToGrid(fn, ev.target.result);
        reader.readAsDataURL(blob);
        editorDirty = true;
      }
      break;
    }
  }
});

const editorViewEl = document.getElementById('viewEditor');
editorViewEl.addEventListener('dragover', (e) => {
  e.preventDefault();
  if (e.dataTransfer.types.includes('Files')) editorDropOverlay.classList.add('visible');
});
editorViewEl.addEventListener('dragleave', (e) => {
  if (!editorViewEl.contains(e.relatedTarget)) editorDropOverlay.classList.remove('visible');
});
editorViewEl.addEventListener('drop', async (e) => {
  e.preventDefault();
  editorDropOverlay.classList.remove('visible');
  const images = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
  for (const img of images) {
    const buf = await img.arrayBuffer();
    const ext = img.name.split('.').pop() || 'jpg';
    const fn  = await window.api.savePhoto(Array.from(new Uint8Array(buf)), ext);
    if (fn) {
      const reader = new FileReader();
      reader.onload = ev => addPhotoToGrid(fn, ev.target.result);
      reader.readAsDataURL(img);
      editorDirty = true;
    }
  }
});

// ── РЕДАКТОР: аудио ──────────────────────────────────────────
editorBtnAudio.addEventListener('click', async () => {
  if (mediaRecorder && mediaRecorder.state === 'recording') stopRecording(true);
  else await startRecording();
});
editorBtnStop.addEventListener('click', () => stopRecording(true));

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = []; recordingSeconds = 0;
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(recordingInterval);
      editorAudioIndicator.classList.remove('visible');
      editorBtnAudio.classList.remove('recording');

      if (mediaRecorder._save && audioChunks.length > 0) {
        const blob = new Blob(audioChunks, { type: 'audio/webm' });
        const buf  = await blob.arrayBuffer();
        const fn   = await window.api.saveAudio(Array.from(new Uint8Array(buf)));
        if (fn) {
          addAudioToList(fn, URL.createObjectURL(blob));
          editorDirty = true;
        }
      }
      mediaRecorder = null;
    };

    mediaRecorder.start(200);
    editorAudioIndicator.classList.add('visible');
    editorBtnAudio.classList.add('recording');

    recordingInterval = setInterval(() => {
      recordingSeconds++;
      const m = Math.floor(recordingSeconds / 60), s = recordingSeconds % 60;
      editorAudioTimer.textContent = `${m}:${s.toString().padStart(2,'0')}`;
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

// ── НАСТРОЙКИ ────────────────────────────────────────────────
async function loadSettingsForm() {
  const s = await window.api.getSettings();
  savedSettings = { ...s };
  hotkeyQuickInput.value = s.hotkeyQuick;
  hotkeyListInput.value  = s.hotkeyList;
  autoLaunchCheck.checked = s.autoLaunch;
  setActiveTheme(s.theme);
}

function setActiveTheme(t) {
  savedSettings.theme = t;
  themeDarkBtn.classList.toggle('active', t === 'dark');
  themeLightBtn.classList.toggle('active', t === 'light');
}
themeDarkBtn.addEventListener('click', () => setActiveTheme('dark'));
themeLightBtn.addEventListener('click', () => setActiveTheme('light'));

setupHotkeyInput(hotkeyQuickInput);
setupHotkeyInput(hotkeyListInput);

function setupHotkeyInput(input) {
  let rec = false, orig = '';
  input.addEventListener('click', () => {
    if (rec) return;
    rec = true; orig = input.value;
    input.classList.add('recording');
    input.value = 'Нажмите комбинацию…';
  });
  input.addEventListener('keydown', (e) => {
    if (!rec) return;
    e.preventDefault(); e.stopPropagation();
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey)  parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const mods = ['Control','Alt','Shift','Meta'];
    if (!mods.includes(e.key)) {
      const km = {' ':'Space','ArrowUp':'Up','ArrowDown':'Down','ArrowLeft':'Left','ArrowRight':'Right','Escape':'Esc','Enter':'Return'};
      parts.push(km[e.key] || e.key.toUpperCase());
      if (parts.length >= 2) { input.value = parts.join('+'); input.classList.remove('recording'); rec = false; }
    } else {
      input.value = parts.join('+') + '+…';
    }
  });
  document.addEventListener('click', (e) => {
    if (e.target !== input && rec) {
      rec = false; input.classList.remove('recording'); input.value = orig;
    }
  });
}

settingsSave.addEventListener('click', async () => {
  const s = {
    hotkeyQuick: hotkeyQuickInput.value.includes('…') ? savedSettings.hotkeyQuick : hotkeyQuickInput.value,
    hotkeyList:  hotkeyListInput.value.includes('…')  ? savedSettings.hotkeyList  : hotkeyListInput.value,
    autoLaunch: autoLaunchCheck.checked,
    theme: savedSettings.theme,
  };
  try {
    await window.api.saveSettings(s);
    applyTheme(s.theme);
    navigateTo('list');
  } catch (e) { alert('Не удалось сохранить настройки: ' + e.message); }
});

settingsCancel.addEventListener('click', () => navigateTo('list'));
settingsBack.addEventListener('click',   () => navigateTo('list'));
settingsClose.addEventListener('click',  () => window.api.closeWindow());
btnOpenFolder.addEventListener('click',  () => window.api.openDataFolder());

// ── УТИЛИТЫ ──────────────────────────────────────────────────

// Совместимость: заметка может иметь старый формат (photo) или новый (photos)
function getPhotos(note) {
  if (Array.isArray(note.photos)) return note.photos;
  if (note.photo) return [note.photo];
  return [];
}

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso), now = new Date();
  const dm = Math.floor((now - d) / 60000);
  const dh = Math.floor((now - d) / 3600000);
  const dd = Math.floor((now - d) / 86400000);
  if (dm < 1) return 'только что';
  if (dm < 60) return `${dm} мин назад`;
  if (dh < 24) return `${dh} ч назад`;
  if (dd === 1) return 'вчера';
  if (dd < 7) return `${dd} дн назад`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function escHtml(s) {
  if (!s) return '';
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function stripHtml(html) {
  if (!html) return '';
  const d = document.createElement('div');
  d.innerHTML = html;
  return d.textContent || '';
}
