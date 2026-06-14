// settings.js — логика окна настроек

const btnClose = document.getElementById('btnClose');
const btnCancel = document.getElementById('btnCancel');
const btnSave = document.getElementById('btnSave');
const btnOpenFolder = document.getElementById('btnOpenFolder');
const hotkeyQuickInput = document.getElementById('hotkeyQuick');
const hotkeyListInput = document.getElementById('hotkeyList');
const autoLaunchCheck = document.getElementById('autoLaunch');
const themeDarkBtn = document.getElementById('themeDark');
const themeLightBtn = document.getElementById('themeLight');

// Текущие значения настроек
let currentSettings = {
  hotkeyQuick: 'Ctrl+Alt+N',
  hotkeyList: 'Ctrl+Alt+L',
  autoLaunch: false,
  theme: 'dark',
};

// Загружаем настройки при открытии окна
(async function init() {
  currentSettings = await window.api.getSettings();
  applyTheme(currentSettings.theme);
  fillForm(currentSettings);
})();

// Заполняем форму текущими настройками
function fillForm(settings) {
  hotkeyQuickInput.value = settings.hotkeyQuick;
  hotkeyListInput.value = settings.hotkeyList;
  autoLaunchCheck.checked = settings.autoLaunch;
  setActiveTheme(settings.theme);
}

// Применение темы к окну настроек
function applyTheme(theme) {
  document.body.classList.toggle('theme-light', theme === 'light');
  setActiveTheme(theme);
}

function setActiveTheme(theme) {
  currentSettings.theme = theme;
  themeDarkBtn.classList.toggle('active', theme === 'dark');
  themeLightBtn.classList.toggle('active', theme === 'light');
}

// Слушаем смену темы из других окон
window.api.onThemeChanged((theme) => applyTheme(theme));

// ============================================================
// Выбор темы
// ============================================================

themeDarkBtn.addEventListener('click', () => setActiveTheme('dark'));
themeLightBtn.addEventListener('click', () => setActiveTheme('light'));

// ============================================================
// Запись горячих клавиш (hotkey recorder)
// ============================================================

// Когда пользователь кликает на поле хоткея, начинаем запись нажатий
setupHotkeyInput(hotkeyQuickInput);
setupHotkeyInput(hotkeyListInput);

function setupHotkeyInput(input) {
  let recording = false;

  input.addEventListener('click', () => {
    if (recording) return;
    recording = true;
    input.classList.add('recording');
    input.value = 'Нажмите комбинацию…';
  });

  input.addEventListener('keydown', (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();

    // Собираем комбинацию клавиш
    const parts = [];
    if (e.ctrlKey) parts.push('Ctrl');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.metaKey) parts.push('Meta');

    // Добавляем основную клавишу (только если это не сам модификатор)
    const modKeys = ['Control', 'Alt', 'Shift', 'Meta'];
    if (!modKeys.includes(e.key)) {
      // Специальные клавиши
      const keyMap = {
        ' ': 'Space',
        'ArrowUp': 'Up',
        'ArrowDown': 'Down',
        'ArrowLeft': 'Left',
        'ArrowRight': 'Right',
        'Escape': 'Esc',
        'Enter': 'Return',
        'Backspace': 'Backspace',
        'Delete': 'Delete',
        'Tab': 'Tab',
        'F1': 'F1', 'F2': 'F2', 'F3': 'F3', 'F4': 'F4',
        'F5': 'F5', 'F6': 'F6', 'F7': 'F7', 'F8': 'F8',
        'F9': 'F9', 'F10': 'F10', 'F11': 'F11', 'F12': 'F12',
      };
      const keyName = keyMap[e.key] || e.key.toUpperCase();
      parts.push(keyName);

      // Нужно хотя бы 2 клавиши (один модификатор + одна кнопка)
      if (parts.length >= 2) {
        input.value = parts.join('+');
        input.classList.remove('recording');
        recording = false;
      }
    } else {
      // Показываем нажатые модификаторы
      input.value = parts.join('+') + '+…';
    }
  });

  // По клику в другое место — отменяем запись
  document.addEventListener('click', (e) => {
    if (e.target !== input && recording) {
      recording = false;
      input.classList.remove('recording');
      // Возвращаем предыдущее значение
      input.value = input === hotkeyQuickInput
        ? currentSettings.hotkeyQuick
        : currentSettings.hotkeyList;
    }
  });
}

// ============================================================
// Сохранение настроек
// ============================================================

btnSave.addEventListener('click', async () => {
  const newSettings = {
    hotkeyQuick: hotkeyQuickInput.value.includes('…') ? currentSettings.hotkeyQuick : hotkeyQuickInput.value,
    hotkeyList: hotkeyListInput.value.includes('…') ? currentSettings.hotkeyList : hotkeyListInput.value,
    autoLaunch: autoLaunchCheck.checked,
    theme: currentSettings.theme,
  };

  try {
    await window.api.saveSettings(newSettings);
    currentSettings = newSettings;
    // Закрываем окно после сохранения
    window.api.closeWindow();
  } catch (e) {
    alert('Не удалось сохранить настройки: ' + e.message);
  }
});

// ============================================================
// Кнопки закрытия и отмены
// ============================================================

btnClose.addEventListener('click', () => window.api.closeWindow());
btnCancel.addEventListener('click', () => window.api.closeWindow());

// Открыть папку с данными в Проводнике
btnOpenFolder.addEventListener('click', () => {
  window.api.openDataFolder();
});

// Закрыть по Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.api.closeWindow();
});
