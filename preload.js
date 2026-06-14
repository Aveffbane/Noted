// preload.js — мост между интерфейсом и главным процессом Electron
// Здесь мы безопасно передаём только нужные функции в браузерную часть
// (Node.js в рендерере выключен для безопасности, поэтому нужен этот мост)

const { contextBridge, ipcRenderer } = require('electron');

// Открываем API для страниц через объект window.api
contextBridge.exposeInMainWorld('api', {

  // Закрыть/скрыть текущее окно
  closeWindow: () => ipcRenderer.send('close-window'),
  closeQuickWindow: () => ipcRenderer.send('close-quick-window'),

  // Заметки
  getNotes: () => ipcRenderer.invoke('get-notes'),
  saveNote: (note) => ipcRenderer.invoke('save-note', note),
  updateNote: (id, updates) => ipcRenderer.invoke('update-note', id, updates),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),

  // Вложения
  savePhoto: (buffer, ext) => ipcRenderer.invoke('save-photo', buffer, ext),
  saveAudio: (buffer) => ipcRenderer.invoke('save-audio', buffer),
  getAttachmentPath: (filename) => ipcRenderer.invoke('get-attachment-path', filename),
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),

  // Настройки
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),

  // Открыть папку с данными в Проводнике
  openDataFolder: () => ipcRenderer.send('open-data-folder'),

  // Переключиться между окнами
  openQuickWindow: () => ipcRenderer.send('open-quick-window'),
  openSettings: () => ipcRenderer.send('open-settings'),

  // Изменение размера окна быстрого ввода
  resizeQuickWindow: (height) => ipcRenderer.send('resize-quick-window', height),

  // Подписка на события от главного процесса
  onNotesUpdated: (callback) => ipcRenderer.on('notes-updated', callback),
  onFocusInput: (callback) => ipcRenderer.on('focus-input', callback),
  onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (event, theme) => callback(theme)),
  onNavigateSettings: (callback) => ipcRenderer.on('navigate-settings', () => callback()),

  // Убрать подписку (для очистки памяти)
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
});
