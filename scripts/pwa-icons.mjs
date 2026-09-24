import { createWriteStream } from "node:fs";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "icons");
mkdirSync(outDir, { recursive: true });

const BG = [22, 20, 16];
const CREAM = [244, 239, 230];
const CORAL = [194, 77, 44];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crcBuf = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcBuf));
  return Buffer.concat([len, t, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    rgba.copy(raw, row + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const body = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return body;
}

function setPx(px, w, x, y, rgb) {
  if (x < 0 || y < 0 || x >= w || y >= w) return;
  const i = (y * w + x) * 4;
  px[i] = rgb[0];
  px[i + 1] = rgb[1];
  px[i + 2] = rgb[2];
  px[i + 3] = 255;
}

function fill(px, w, rgb) {
  for (let i = 0; i < w * w; i++) {
    px[i * 4] = rgb[0];
    px[i * 4 + 1] = rgb[1];
    px[i * 4 + 2] = rgb[2];
    px[i * 4 + 3] = 255;
  }
}

function line(px, w, x0, y0, x1, y1, rgb, thickness) {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  const r = Math.max(1, Math.round(thickness / 2));
  while (true) {
    for (let oy = -r; oy <= r; oy++) {
      for (let ox = -r; ox <= r; ox++) {
        if (ox * ox + oy * oy <= r * r) setPx(px, w, x + ox, y + oy, rgb);
      }
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function drawMark(px, w, pad) {
  const inner = w - pad * 2;
  const s = inner / 32;
  const p = (n) => Math.round(pad + n * s);
  const t = Math.max(2, Math.round(1.6 * s));
  const hex = [
    [8, 22],
    [8, 10],
    [16, 6],
    [24, 10],
    [24, 22],
    [16, 26],
    [8, 22],
  ];
  for (let i = 0; i < hex.length - 1; i++) {
    line(px, w, p(hex[i][0]), p(hex[i][1]), p(hex[i + 1][0]), p(hex[i + 1][1]), CREAM, t);
  }
  line(px, w, p(16), p(10), p(16), p(22), CORAL, t);
}

function writeIcon(name, size, pad) {
  const px = Buffer.alloc(size * size * 4);
  fill(px, size, BG);
  drawMark(px, size, pad);
  const png = encodePng(size, size, px);
  const dest = join(outDir, name);
  createWriteStream(dest).end(png);
}

writeIcon("icon-192.png", 192, 0);
writeIcon("icon-512.png", 512, 0);
writeIcon("icon-192-maskable.png", 192, 28);
writeIcon("icon-512-maskable.png", 512, 74);
writeIcon("apple-touch-icon.png", 180, 0);
console.log("Wrote PWA icons to public/icons");
