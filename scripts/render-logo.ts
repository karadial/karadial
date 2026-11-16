/**
 * Draws the KaraDial logo and writes it as PNG files, without any image library.
 *
 *   node scripts/render-logo.ts            writes the add-on icons to public/icon
 *   node scripts/render-logo.ts <folder>   also writes logo files for other places there
 *
 * The logo is a K from three shapes on a rounded tile: a bar, a quarter of a
 * dial and a tile. The same shapes are in the header of the new tab page
 * (`entrypoints/newtab/App.svelte`). Change both together.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

type Color = readonly [red: number, green: number, blue: number];

const ACCENT: Color = [0x1c, 0x5b, 0xd0];
const ON_ACCENT: Color = [0xff, 0xff, 0xff];
const PAGE: Color = [0xe9, 0xed, 0xf1];

/** The logo is drawn in a box of 32 by 32 units. */
const BOX = 32;
const TILE_RADIUS = 9;

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius: number;
}

const BAR: Rect = { x: 7.5, y: 7, width: 5.4, height: 18, radius: 2.7 };
const TILE: Rect = { x: 15.2, y: 17.2, width: 7.8, height: 7.8, radius: 2.2 };
/** A quarter of an ellipse around its lower left corner. */
const ARC = { x: 15.2, y: 15, radiusX: 9.8, radiusY: 8 };

const SVG_SHAPES =
  `<rect x="${BAR.x}" y="${BAR.y}" width="${BAR.width}" height="${BAR.height}" rx="${BAR.radius}"/>` +
  `<path d="M${ARC.x} ${ARC.y}V${ARC.y - ARC.radiusY}a${ARC.radiusX} ${ARC.radiusY} 0 0 1 ${ARC.radiusX} ${ARC.radiusY}z"/>` +
  `<rect x="${TILE.x}" y="${TILE.y}" width="${TILE.width}" height="${TILE.height}" rx="${TILE.radius}"/>`;

const hex = (color: Color) =>
  '#' + color.map((part) => part.toString(16).padStart(2, '0')).join('');

function inRect(x: number, y: number, rect: Rect): boolean {
  const { radius } = rect;
  if (x < rect.x || y < rect.y || x > rect.x + rect.width || y > rect.y + rect.height) return false;
  // Distance to the centre of the nearest corner circle, zero along the straight edges.
  const dx = Math.max(rect.x + radius - x, 0, x - (rect.x + rect.width - radius));
  const dy = Math.max(rect.y + radius - y, 0, y - (rect.y + rect.height - radius));
  return dx * dx + dy * dy <= radius * radius;
}

function inShapes(x: number, y: number): boolean {
  if (inRect(x, y, BAR) || inRect(x, y, TILE)) return true;
  if (x < ARC.x || y > ARC.y) return false;
  return ((x - ARC.x) / ARC.radiusX) ** 2 + ((y - ARC.y) / ARC.radiusY) ** 2 <= 1;
}

/** The colour at a point of the picture, or null where it is transparent. */
type Scene = (x: number, y: number) => Color | null;

/**
 * The logo in a square of `size` at `left`, `top`. `corners` rounds the tile,
 * `shapeScale` shrinks the shapes around the middle, for places that crop.
 */
function logo(left: number, top: number, size: number, corners: boolean, shapeScale = 1): Scene {
  const tile: Rect = { x: 0, y: 0, width: BOX, height: BOX, radius: corners ? TILE_RADIUS : 0 };
  return (x, y) => {
    const u = ((x - left) / size) * BOX;
    const v = ((y - top) / size) * BOX;
    if (!inRect(u, v, tile)) return null;
    const middle = BOX / 2;
    const inside = inShapes((u - middle) / shapeScale + middle, (v - middle) / shapeScale + middle);
    return inside ? ON_ACCENT : ACCENT;
  };
}

const over =
  (scene: Scene, background: Color): Scene =>
  (x, y) =>
    scene(x, y) ?? background;

/** Every pixel is the average of 8 by 8 points, which smooths the edges. */
const SAMPLES = 8;

function render(width: number, height: number, scene: Scene): Buffer {
  const rowLength = width * 4 + 1;
  const raw = Buffer.alloc(rowLength * height);
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      let red = 0;
      let green = 0;
      let blue = 0;
      let covered = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const color = scene(px + (sx + 0.5) / SAMPLES, py + (sy + 0.5) / SAMPLES);
          if (!color) continue;
          red += color[0];
          green += color[1];
          blue += color[2];
          covered++;
        }
      }
      if (covered === 0) continue;
      // Each row starts with one byte for the PNG filter, which stays 0.
      const at = py * rowLength + 1 + px * 4;
      raw[at] = Math.round(red / covered);
      raw[at + 1] = Math.round(green / covered);
      raw[at + 2] = Math.round(blue / covered);
      raw[at + 3] = Math.round((covered / SAMPLES ** 2) * 255);
    }
  }
  return png(width, height, raw);
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function png(width: number, height: number, raw: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // red, green, blue, alpha
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function svg(tile: string, shapeColor: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}">` +
    `${tile}<g fill="${shapeColor}">${SVG_SHAPES}</g></svg>\n`
  );
}

function write(folder: string, name: string, content: Buffer | string) {
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, name), content);
  console.log(join(folder, name));
}

for (const size of [16, 32, 48, 96, 128]) {
  write('public/icon', `${size}.png`, render(size, size, logo(0, 0, size, true)));
}

const folder = process.argv[2];
if (folder) {
  const tile = `<rect width="${BOX}" height="${BOX}" rx="${TILE_RADIUS}" fill="${hex(ACCENT)}"/>`;
  write(folder, 'karadial-logo.svg', svg(tile, hex(ON_ACCENT)));
  // The shapes alone, in the colour of the text around them.
  write(folder, 'karadial-mark.svg', svg('', 'currentColor'));
  for (const size of [256, 512, 1024]) {
    write(folder, `karadial-logo-${size}.png`, render(size, size, logo(0, 0, size, true)));
  }
  // Profile pictures are cropped to a circle or a rounded square: no corners, smaller shapes.
  for (const size of [512, 1024]) {
    write(folder, `karadial-avatar-${size}.png`, render(size, size, logo(0, 0, size, false, 0.74)));
  }
  // The picture GitHub shows for a link to the repository.
  const [width, height, size] = [1280, 640, 288];
  const centred = logo((width - size) / 2, (height - size) / 2, size, true);
  write(folder, 'karadial-social-1280x640.png', render(width, height, over(centred, PAGE)));
}
