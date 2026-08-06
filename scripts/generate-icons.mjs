#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Generates the KingCity PWA icons (crown) from the geometry in Brand.tsx.
// Two sets: "any" (wide crown) and "maskable" (crown inside the 80 % safe zone
// imposed by Android, which crops the icon's edges).
//
//   node scripts/generate-icons.mjs
// ─────────────────────────────────────────────────────────────────────────────
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "../apps/web/public/icons");
const NAVY = [0x1a, 0x3c, 0x6e];
const BRAND = [0xe8, 0x82, 0x1e];

// Crown + base, in the coordinates of CrownIcon's 24×24 viewBox.
const SHAPES = [
  [
    [5, 16],
    [3, 6],
    [8, 9.2],
    [12, 4],
    [16, 9.2],
    [21, 6],
    [19, 16],
  ],
  [
    [5, 17.6],
    [19, 17.6],
    [19, 20],
    [5, 20],
  ],
];
const BOX = { x: 3, y: 4, w: 18, h: 16 };

const inside = (poly, px, py) => {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

function render(size, scale) {
  const SS = 4; // supersampling → anti-aliasing
  const k = (size * scale) / Math.max(BOX.w, BOX.h);
  const ox = (size - BOX.w * k) / 2 - BOX.x * k;
  const oy = (size - BOX.h * k) / 2 - BOX.y * k;

  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3); // filter 0 + RGB
    for (let x = 0; x < size; x++) {
      let cover = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS - ox) / k;
          const uy = (y + (sy + 0.5) / SS - oy) / k;
          if (SHAPES.some((s) => inside(s, ux, uy))) cover++;
        }
      }
      const a = cover / (SS * SS);
      const at = 1 + x * 3;
      for (let c = 0; c < 3; c++) row[at + c] = Math.round(NAVY[c] * (1 - a) + BRAND[c] * a);
    }
    rows.push(row);
  }
  return Buffer.concat(rows);
}

const crc = (buf) => {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
};

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const sum = Buffer.alloc(4);
  sum.writeUInt32BE(crc(body));
  return Buffer.concat([len, body, sum]);
}

function png(size, scale) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // 8 bits/channel
  ihdr[9] = 2; // truecolor RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(render(size, scale), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  writeFileSync(join(OUT, `icon-${size}.png`), png(size, 0.64));
  writeFileSync(join(OUT, `icon-maskable-${size}.png`), png(size, 0.46));
  console.log(`icon-${size}.png · icon-maskable-${size}.png`);
}
