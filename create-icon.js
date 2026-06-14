// Скрипт для генерации иконки приложения (запускается один раз)
// Создаёт минималистичную иконку: жёлтый круг с буквой «З»

const fs = require('fs');
const path = require('path');

// Создаём BMP-картинку 32x32 вручную и оборачиваем в ICO
// ICO-формат: заголовок + директория + данные изображения

function createIco() {
  const size = 32;

  // Создаём пиксельные данные 32x32 RGBA
  const pixels = Buffer.alloc(size * size * 4);

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= r) {
        // Жёлтый фон (#f5c518)
        pixels[idx + 0] = 0xf5;  // R
        pixels[idx + 1] = 0xc5;  // G
        pixels[idx + 2] = 0x18;  // B
        pixels[idx + 3] = 0xff;  // Alpha
      } else {
        // Прозрачно снаружи
        pixels[idx + 0] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
      }
    }
  }

  // Рисуем букву «З» тёмным цветом в центре
  // Верхняя горизонтальная черта З
  for (let x = 11; x <= 20; x++) {
    for (let y = 8; y <= 10; y++) drawPixel(pixels, size, x, y, 0x1a, 0x1a, 0x1a);
  }
  // Правая вертикаль верха
  for (let y = 8; y <= 15; y++) {
    for (let x = 19; x <= 21; x++) drawPixel(pixels, size, x, y, 0x1a, 0x1a, 0x1a);
  }
  // Средняя черта
  for (let x = 13; x <= 21; x++) {
    for (let y = 14; y <= 16; y++) drawPixel(pixels, size, x, y, 0x1a, 0x1a, 0x1a);
  }
  // Правая вертикаль низа
  for (let y = 15; y <= 23; y++) {
    for (let x = 19; x <= 21; x++) drawPixel(pixels, size, x, y, 0x1a, 0x1a, 0x1a);
  }
  // Нижняя черта
  for (let x = 11; x <= 20; x++) {
    for (let y = 22; y <= 24; y++) drawPixel(pixels, size, x, y, 0x1a, 0x1a, 0x1a);
  }

  // Собираем ICO файл вручную
  // ICO = заголовок (6 байт) + директория (16 байт * кол-во иконок) + данные PNG или BMP

  // Используем формат BMP внутри ICO (BITMAPINFOHEADER + XOR mask + AND mask)
  const bmpInfoHeaderSize = 40;
  const bmpDataSize = size * size * 4 + size * size / 8; // RGBA пиксели + AND маска

  // ICONDIR заголовок
  const iconDir = Buffer.alloc(6);
  iconDir.writeUInt16LE(0, 0);   // Reserved
  iconDir.writeUInt16LE(1, 2);   // Type = 1 (ICO)
  iconDir.writeUInt16LE(1, 4);   // Count = 1

  // ICONDIRENTRY (16 байт)
  const iconDirEntry = Buffer.alloc(16);
  iconDirEntry.writeUInt8(size, 0);   // Width
  iconDirEntry.writeUInt8(size, 1);   // Height
  iconDirEntry.writeUInt8(0, 2);      // ColorCount (0 = более 256)
  iconDirEntry.writeUInt8(0, 3);      // Reserved
  iconDirEntry.writeUInt16LE(1, 4);   // Planes
  iconDirEntry.writeUInt16LE(32, 6);  // BitCount
  iconDirEntry.writeUInt32LE(bmpInfoHeaderSize + bmpDataSize, 8);  // SizeInBytes
  iconDirEntry.writeUInt32LE(6 + 16, 12); // ImageOffset (после заголовков)

  // BITMAPINFOHEADER (40 байт)
  const bmpHeader = Buffer.alloc(40);
  bmpHeader.writeUInt32LE(40, 0);           // biSize
  bmpHeader.writeInt32LE(size, 4);          // biWidth
  bmpHeader.writeInt32LE(size * 2, 8);      // biHeight (удвоенный для XOR+AND масок)
  bmpHeader.writeUInt16LE(1, 12);           // biPlanes
  bmpHeader.writeUInt16LE(32, 14);          // biBitCount
  bmpHeader.writeUInt32LE(0, 16);           // biCompression (0=BI_RGB)
  bmpHeader.writeUInt32LE(bmpDataSize, 20); // biSizeImage
  bmpHeader.writeInt32LE(0, 24);
  bmpHeader.writeInt32LE(0, 28);
  bmpHeader.writeUInt32LE(0, 32);
  bmpHeader.writeUInt32LE(0, 36);

  // XOR маска — пиксели в формате BGRA снизу вверх
  const xorMask = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 4;
      const dstIdx = ((size - 1 - y) * size + x) * 4;  // Перевернуть по вертикали
      xorMask[dstIdx + 0] = pixels[srcIdx + 2];  // B
      xorMask[dstIdx + 1] = pixels[srcIdx + 1];  // G
      xorMask[dstIdx + 2] = pixels[srcIdx + 0];  // R
      xorMask[dstIdx + 3] = pixels[srcIdx + 3];  // A
    }
  }

  // AND маска (1 бит на пиксель, 0=непрозрачный, 1=прозрачный), выровнена по 4 байта
  const andRowBytes = Math.ceil(size / 32) * 4;
  const andMask = Buffer.alloc(size * andRowBytes, 0);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 4;
      const alpha = pixels[srcIdx + 3];
      if (alpha === 0) {
        const dstY = size - 1 - y;
        const byteIdx = dstY * andRowBytes + Math.floor(x / 8);
        const bitIdx = 7 - (x % 8);
        andMask[byteIdx] |= (1 << bitIdx);
      }
    }
  }

  const ico = Buffer.concat([iconDir, iconDirEntry, bmpHeader, xorMask, andMask]);
  const outPath = path.join(__dirname, 'assets', 'icon.ico');
  fs.writeFileSync(outPath, ico);
  console.log('Иконка создана:', outPath);
}

function drawPixel(pixels, size, x, y, r, g, b) {
  if (x < 0 || x >= size || y < 0 || y >= size) return;
  const idx = (y * size + x) * 4;
  pixels[idx + 0] = r;
  pixels[idx + 1] = g;
  pixels[idx + 2] = b;
  pixels[idx + 3] = 0xff;
}

createIco();
