// main.js — главный процесс Electron
// Запускать через: npm start  (команда сбрасывает ELECTRON_RUN_AS_NODE который VS Code ставит)

const { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, shell, nativeImage, dialog, nativeTheme, screen } = require('electron');
const path = require('path');
const fs = require('fs');

// ============================================================
// Хранилище настроек (простой JSON-файл вместо electron-store)
// ============================================================
let _settingsFile = null;
let _settingsCache = null;

function initSettingsFile() {
  if (!_settingsFile) {
    _settingsFile = path.join(app.getPath('userData'), 'settings.json');
  }
}

const store = {
  get(key, defaultValue) {
    initSettingsFile();
    if (!_settingsCache) {
      try { _settingsCache = JSON.parse(fs.readFileSync(_settingsFile, 'utf8')); }
      catch (e) { _settingsCache = {}; }
    }
    return key in _settingsCache ? _settingsCache[key] : defaultValue;
  },
  set(key, value) {
    initSettingsFile();
    if (!_settingsCache) {
      try { _settingsCache = JSON.parse(fs.readFileSync(_settingsFile, 'utf8')); }
      catch (e) { _settingsCache = {}; }
    }
    _settingsCache[key] = value;
    try {
      fs.writeFileSync(_settingsFile, JSON.stringify(_settingsCache, null, 2), 'utf8');
    } catch (e) { console.error('Ошибка записи настроек:', e); }
  },
};

// ============================================================
// Защита от запуска двух копий
// ============================================================
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

// ============================================================
// Путь к данным: устанавливаем "Noted", мигрируем из "Записки"
// ============================================================
{
  const appData = app.getPath('appData');
  const newDataPath = path.join(appData, 'Noted');
  app.setPath('userData', newDataPath);
  const oldDataPath = path.join(appData, 'Записки');
  if (fs.existsSync(oldDataPath) && !fs.existsSync(newDataPath)) {
    try {
      const copyDir = (src, dest) => {
        fs.mkdirSync(dest, { recursive: true });
        for (const item of fs.readdirSync(src)) {
          const s = path.join(src, item), d = path.join(dest, item);
          fs.statSync(s).isDirectory() ? copyDir(s, d) : fs.copyFileSync(s, d);
        }
      };
      copyDir(oldDataPath, newDataPath);
      console.log('Данные перенесены из Записки → Noted');
    } catch (e) { console.error('Ошибка миграции данных:', e); }
  }
}

// Глобальные переменные для окон и трея
let tray = null;
let listWindow = null;
let quickWindow = null;
let settingsWindow = null;

// Пути к данным приложения
const userDataPath = app.getPath('userData');
const attachmentsPath = path.join(userDataPath, 'attachments');
const notesFile = path.join(userDataPath, 'notes.json');

// Создаём папку для вложений если нет
if (!fs.existsSync(attachmentsPath)) {
  fs.mkdirSync(attachmentsPath, { recursive: true });
}

function loadNotes() {
  try {
    if (fs.existsSync(notesFile)) {
      const notes = JSON.parse(fs.readFileSync(notesFile, 'utf8'));
      // Миграция: старый формат {photo: "file.jpg"} → новый {photos: ["file.jpg"]}
      return notes.map(n => {
        if (!n.photos) n.photos = n.photo ? [n.photo] : [];
        if (!n.audios) n.audios = n.audio ? [n.audio] : [];
        return n;
      });
    }
  } catch (e) { console.error('Ошибка загрузки заметок:', e); }
  return [];
}

function saveNotes(notes) {
  try { fs.writeFileSync(notesFile, JSON.stringify(notes, null, 2), 'utf8'); }
  catch (e) { console.error('Ошибка сохранения заметок:', e); }
}

// ============================================================
// Создание окон
// ============================================================

function createListWindow() {
  if (listWindow && !listWindow.isDestroyed()) {
    listWindow.show(); listWindow.focus(); return;
  }

  listWindow = new BrowserWindow({
    width: 380, height: 600, minWidth: 320, minHeight: 400,
    frame: false, resizable: true, skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
  });

  listWindow.loadFile(path.join(__dirname, 'renderer', 'list.html'));
  listWindow.once('ready-to-show', () => { listWindow.show(); listWindow.focus(); });
  listWindow.on('close', (e) => {
    if (!app.isQuitting) { e.preventDefault(); listWindow.hide(); }
  });
}

function createQuickWindow() {
  if (quickWindow && !quickWindow.isDestroyed()) {
    quickWindow.show(); quickWindow.focus(); return;
  }

  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  quickWindow = new BrowserWindow({
    width: 480, height: 430,
    x: Math.floor(width / 2 - 240), y: Math.floor(height / 2 - 215),
    frame: false, alwaysOnTop: true, resizable: true, skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
  });

  quickWindow.loadFile(path.join(__dirname, 'renderer', 'quick.html'));
  quickWindow.once('ready-to-show', () => {
    quickWindow.show(); quickWindow.focus();
    setTimeout(() => {
      if (quickWindow && !quickWindow.isDestroyed()) quickWindow.webContents.send('focus-input');
    }, 100);
  });
  quickWindow.on('closed', () => { quickWindow = null; });
}

function createSettingsWindow() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show(); settingsWindow.focus(); return;
  }

  settingsWindow = new BrowserWindow({
    width: 420, height: 500, frame: false, resizable: false, skipTaskbar: true,
    parent: listWindow || undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    show: false,
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));
  settingsWindow.once('ready-to-show', () => { settingsWindow.show(); settingsWindow.focus(); });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ============================================================
// Глобальные горячие клавиши
// ============================================================

function registerShortcuts() {
  globalShortcut.unregisterAll();

  const hotkeyQuick = store.get('hotkeyQuick', 'Ctrl+Alt+N');
  const hotkeyList = store.get('hotkeyList', 'Ctrl+Alt+L');

  try {
    globalShortcut.register(hotkeyQuick, () => {
      if (quickWindow && !quickWindow.isDestroyed() && quickWindow.isVisible()) quickWindow.hide();
      else createQuickWindow();
    });
  } catch (e) { console.error('Ошибка регистрации хоткея быстрого ввода:', e); }

  try {
    globalShortcut.register(hotkeyList, () => createListWindow());
  } catch (e) { console.error('Ошибка регистрации хоткея списка:', e); }
}

// ============================================================
// Иконка в системном трее
// ============================================================

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'icon.ico');
  tray = new Tray(iconPath);
  tray.setToolTip('Noted');
  updateTrayMenu();
  tray.on('click', () => createListWindow());
}

function updateTrayMenu() {
  const autoLaunch = store.get('autoLaunch', false);

  const contextMenu = Menu.buildFromTemplate([
    { label: '📝 Новая заметка', click: () => createQuickWindow() },
    { label: '📋 Открыть список', click: () => createListWindow() },
    {
      label: '⚙️ Настройки',
      click: () => { createListWindow(); setTimeout(() => createSettingsWindow(), 200); },
    },
    { type: 'separator' },
    {
      label: 'Запускать при старте Windows', type: 'checkbox', checked: autoLaunch,
      click: (item) => {
        store.set('autoLaunch', item.checked);
        app.setLoginItemSettings({ openAtLogin: item.checked });
        updateTrayMenu();
      },
    },
    { type: 'separator' },
    { label: '❌ Выход', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
}

// ============================================================
// IPC: связь между окнами и главным процессом
// ============================================================

ipcMain.on('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.hide();
});

ipcMain.on('close-quick-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) { win.hide(); win.destroy(); quickWindow = null; }
});

ipcMain.handle('get-notes', () => loadNotes());

ipcMain.handle('save-note', (event, note) => {
  const notes = loadNotes();
  const newNote = {
    id: Date.now().toString(),
    text: note.text || '',
    photos: Array.isArray(note.photos) ? note.photos : (note.photo ? [note.photo] : []),
    audios: Array.isArray(note.audios) ? note.audios : (note.audio ? [note.audio] : []),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  notes.unshift(newNote);
  saveNotes(notes);
  if (listWindow && !listWindow.isDestroyed()) listWindow.webContents.send('notes-updated');
  return newNote;
});

ipcMain.handle('update-note', (event, noteId, updates) => {
  const notes = loadNotes();
  const idx = notes.findIndex(n => n.id === noteId);
  if (idx !== -1) {
    const old = notes[idx];

    // Удаляем старые фото которые исчезли из нового массива
    if (updates.photos) {
      const oldPhotos = old.photos || (old.photo ? [old.photo] : []);
      for (const fn of oldPhotos) {
        if (!updates.photos.includes(fn)) tryDeleteFile(path.join(attachmentsPath, fn));
      }
    }

    // Удаляем старые аудио которые исчезли из нового массива
    if (updates.audios) {
      const oldAudios = old.audios || (old.audio ? [old.audio] : []);
      for (const fn of oldAudios) {
        if (!updates.audios.includes(fn)) tryDeleteFile(path.join(attachmentsPath, fn));
      }
    }

    notes[idx] = { ...notes[idx], ...updates, updatedAt: new Date().toISOString() };
    saveNotes(notes);
    if (listWindow && !listWindow.isDestroyed()) listWindow.webContents.send('notes-updated');
    return notes[idx];
  }
  return null;
});

ipcMain.handle('delete-note', (event, noteId) => {
  let notes = loadNotes();
  const note = notes.find(n => n.id === noteId);
  if (note) {
    const photos = note.photos || (note.photo ? [note.photo] : []);
    photos.forEach(fn => tryDeleteFile(path.join(attachmentsPath, fn)));
    const audios = note.audios || (note.audio ? [note.audio] : []);
    audios.forEach(fn => tryDeleteFile(path.join(attachmentsPath, fn)));
  }
  notes = notes.filter(n => n.id !== noteId);
  saveNotes(notes);
  if (listWindow && !listWindow.isDestroyed()) listWindow.webContents.send('notes-updated');
  return true;
});

function tryDeleteFile(filePath) {
  try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) {}
}

ipcMain.handle('save-photo', (event, buffer, ext) => {
  try {
    const filename = `photo_${Date.now()}.${ext || 'jpg'}`;
    fs.writeFileSync(path.join(attachmentsPath, filename), Buffer.from(buffer));
    return filename;
  } catch (e) { console.error('Ошибка сохранения фото:', e); return null; }
});

ipcMain.handle('save-audio', (event, buffer) => {
  try {
    const filename = `audio_${Date.now()}.webm`;
    fs.writeFileSync(path.join(attachmentsPath, filename), Buffer.from(buffer));
    return filename;
  } catch (e) { console.error('Ошибка сохранения аудио:', e); return null; }
});

ipcMain.handle('get-attachment-path', (event, filename) =>
  path.join(attachmentsPath, filename));

ipcMain.handle('open-file-dialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
    filters: [{ name: 'Изображения', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'] }],
  });
  if (!result.canceled && result.filePaths.length > 0) {
    const filePath = result.filePaths[0];
    const ext = path.extname(filePath).slice(1);
    const buffer = fs.readFileSync(filePath);
    const filename = `photo_${Date.now()}.${ext}`;
    fs.writeFileSync(path.join(attachmentsPath, filename), buffer);
    return { filename, dataURL: `data:image/${ext};base64,${buffer.toString('base64')}` };
  }
  return null;
});

ipcMain.handle('get-settings', () => ({
  hotkeyQuick: store.get('hotkeyQuick', 'Ctrl+Alt+N'),
  hotkeyList: store.get('hotkeyList', 'Ctrl+Alt+L'),
  autoLaunch: store.get('autoLaunch', false),
  theme: store.get('theme', 'dark'),
}));

ipcMain.handle('save-settings', (event, settings) => {
  store.set('hotkeyQuick', settings.hotkeyQuick);
  store.set('hotkeyList', settings.hotkeyList);
  store.set('autoLaunch', settings.autoLaunch);
  store.set('theme', settings.theme);
  app.setLoginItemSettings({ openAtLogin: settings.autoLaunch });
  registerShortcuts();
  updateTrayMenu();
  [listWindow, quickWindow].forEach(win => {
    if (win && !win.isDestroyed()) win.webContents.send('theme-changed', settings.theme);
  });
  return true;
});

ipcMain.on('open-data-folder', () => shell.openPath(userDataPath));
ipcMain.on('open-quick-window', () => createQuickWindow());
ipcMain.on('open-settings', () => {
  if (listWindow && !listWindow.isDestroyed()) {
    createListWindow();
    setTimeout(() => listWindow.webContents.send('navigate-settings'), 100);
  }
});

ipcMain.on('resize-quick-window', (event, height) => {
  if (quickWindow && !quickWindow.isDestroyed())
    quickWindow.setSize(480, Math.min(Math.max(height, 200), 500));
});

// ============================================================
// Запуск приложения
// ============================================================

app.whenReady().then(() => {
  const theme = store.get('theme', 'dark');
  nativeTheme.themeSource = theme === 'dark' ? 'dark' : 'light';

  createTray();
  registerShortcuts();

  console.log('Noted запущен. Данные хранятся в:', userDataPath);
});

app.on('window-all-closed', () => {}); // Живём в трее
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('second-instance', () => createListWindow());
