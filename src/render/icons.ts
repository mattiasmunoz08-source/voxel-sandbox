import { ITEMS, itemDef } from '../items/items';
import { BLOCKS } from '../world/blocks';
import { BIOME_TINT, Biome } from '../world/generator';
import { PixelTile, type Atlas } from './textures';
import { TILE_PX } from './tiles';

type RGB = [number, number, number];

const BIOME_TINT_DEFAULT = BIOME_TINT[Biome.PLAINS];

/** Pinta objetos que no son bloques sobre una casilla de 16×16. */
function paintItem(id: string, t: PixelTile): boolean {
  const px = (x: number, y: number, c: RGB) => t.set(x, y, [c[0], c[1], c[2], 255]);
  const WOOD: RGB = [150, 104, 60];
  const WOOD_D: RGB = [104, 70, 38];
  const handle = (len: number) => {
    for (let k = 0; k < len; k++) {
      px(3 + k, 12 - k, WOOD);
      px(3 + k, 13 - k, WOOD_D);
    }
  };
  const mat = id.startsWith('stone') ? ([[150, 150, 156], [96, 96, 104]] as RGB[]) : ([[196, 152, 96], [132, 94, 54]] as RGB[]);

  if (id === 'stick') {
    handle(10);
    return true;
  }
  if (id === 'coal') {
    const pts = [[6, 5], [7, 5], [8, 5], [5, 6], [6, 6], [7, 6], [8, 6], [9, 6], [5, 7], [6, 7], [7, 7], [8, 7], [9, 7], [10, 7], [5, 8], [6, 8], [7, 8], [8, 8], [9, 8], [10, 8], [6, 9], [7, 9], [8, 9], [9, 9], [7, 10], [8, 10]];
    for (const [x, y] of pts) px(x, y, (x + y) % 3 === 0 ? [70, 68, 72] : [30, 28, 32]);
    px(7, 6, [120, 118, 124]);
    return true;
  }
  if (id === 'apple') {
    for (let y = 5; y < 13; y++) {
      for (let x = 4; x < 12; x++) {
        const dx = x - 7.5, dy = y - 8.8;
        if (dx * dx + dy * dy * 1.1 < 15) px(x, y, x < 6 && y < 8 ? [236, 96, 80] : [196, 40, 44]);
      }
    }
    px(8, 3, [104, 70, 38]); px(8, 4, [104, 70, 38]); px(9, 3, [86, 150, 54]); px(10, 2, [86, 150, 54]);
    return true;
  }
  if (id === 'berries') {
    const berries = [[5, 7], [8, 6], [10, 9], [6, 10], [9, 11]];
    for (const [x, y] of berries) {
      px(x, y, [196, 40, 82]); px(x + 1, y, [150, 26, 64]); px(x, y + 1, [150, 26, 64]); px(x + 1, y + 1, [110, 16, 48]);
    }
    px(8, 4, [70, 130, 50]); px(7, 5, [70, 130, 50]);
    return true;
  }
  if (id === 'berry_pie') {
    for (let x = 2; x < 14; x++) { px(x, 8, [222, 170, 96]); px(x, 12, [170, 114, 58]); }
    for (let y = 9; y < 12; y++) for (let x = 2; x < 14; x++) px(x, y, [196, 140, 74]);
    for (let x = 3; x < 13; x++) px(x, 7, (x % 3 === 0) ? [222, 170, 96] : [160, 30, 70]);
    for (let x = 4; x < 12; x++) px(x, 6, [140, 24, 60]);
    return true;
  }
  const tool = itemDef(id)?.tool;
  if (!tool) return false;
  const [light, dark] = mat;
  if (tool.kind === 'sword') {
    for (let k = 0; k < 8; k++) { px(5 + k, 10 - k, light); px(6 + k, 10 - k, dark); }
    px(3, 10, [90, 60, 32]); px(4, 9, [90, 60, 32]); px(5, 12, [90, 60, 32]); px(6, 11, [90, 60, 32]);
    px(3, 12, WOOD); px(4, 11, WOOD); px(2, 13, WOOD_D);
    return true;
  }
  handle(9);
  if (tool.kind === 'pickaxe') {
    const head = [[6, 3], [7, 3], [8, 3], [9, 3], [10, 4], [11, 5], [12, 6], [12, 7], [5, 4], [4, 5], [12, 8]];
    for (const [x, y] of head) px(x, y, light);
    px(9, 4, dark); px(10, 5, dark); px(11, 6, dark);
  } else if (tool.kind === 'axe') {
    const head = [[8, 2], [9, 2], [10, 3], [11, 3], [12, 4], [12, 5], [12, 6], [11, 7], [9, 3], [10, 4], [11, 4], [11, 5], [11, 6], [10, 5]];
    for (const [x, y] of head) px(x, y, light);
    px(10, 6, dark); px(9, 5, dark); px(12, 7, dark);
  } else if (tool.kind === 'shovel') {
    const head = [[10, 2], [11, 2], [12, 2], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [10, 4], [11, 4], [12, 4], [13, 4], [11, 5], [12, 5]];
    for (const [x, y] of head) px(x, y, light);
    px(12, 4, dark); px(13, 4, dark); px(12, 5, dark);
  }
  return true;
}

export interface IconSet {
  /** URL de datos (PNG 48×48) para la interfaz. */
  url(id: string): string;
  /** Lienzo de 16×16 para texturas 3D (objeto en mano, objetos tirados). */
  canvas16(id: string): HTMLCanvasElement | null;
}

function tileCanvas(tile: PixelTile, tint: RGB | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = TILE_PX;
  c.height = TILE_PX;
  const data = new Uint8ClampedArray(tile.data);
  if (tint) {
    for (let i = 0; i < data.length; i += 4) {
      data[i] = Math.min(255, data[i] * tint[0]);
      data[i + 1] = Math.min(255, data[i + 1] * tint[1]);
      data[i + 2] = Math.min(255, data[i + 2] * tint[2]);
    }
  }
  c.getContext('2d')!.putImageData(new ImageData(data, TILE_PX, TILE_PX), 0, 0);
  return c;
}

/** Cubo isométrico a partir de tres caras del atlas. */
function isoCube(top: HTMLCanvasElement, left: HTMLCanvasElement, right: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 48;
  c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const k = 48 / 32;
  const faces: [HTMLCanvasElement, number[], number][] = [
    [top, [15 / 16, -7.5 / 16, 15 / 16, 7.5 / 16, 1, 8.5], 0],
    [left, [15 / 16, 7.5 / 16, 0, 15 / 16, 1, 8.5], 0.22],
    [right, [15 / 16, -7.5 / 16, 0, 15 / 16, 16, 16], 0.4],
  ];
  for (const [img, m, darken] of faces) {
    const layer = document.createElement('canvas');
    layer.width = 48;
    layer.height = 48;
    const lctx = layer.getContext('2d')!;
    lctx.imageSmoothingEnabled = false;
    lctx.setTransform(m[0] * k, m[1] * k, m[2] * k, m[3] * k, m[4] * k, m[5] * k);
    lctx.drawImage(img, 0, 0);
    if (darken > 0) {
      lctx.setTransform(1, 0, 0, 1, 0, 0);
      lctx.globalCompositeOperation = 'source-atop';
      lctx.fillStyle = `rgba(0,0,0,${darken})`;
      lctx.fillRect(0, 0, 48, 48);
    }
    ctx.drawImage(layer, 0, 0);
  }
  return c;
}

function upscale(src: HTMLCanvasElement, size = 48): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, size, size);
  return c;
}

export function createIcons(atlas: Atlas): IconSet {
  const urls = new Map<string, string>();
  const small = new Map<string, HTMLCanvasElement>();
  const tileOf = (i: number) => atlas.tiles.get(i) ?? new PixelTile();

  for (const item of ITEMS.values()) {
    if (item.block !== undefined) {
      const b = BLOCKS[item.block];
      const tint = b.tint ? BIOME_TINT_DEFAULT : null;
      if (b.render === 'cube') {
        const top = tileCanvas(tileOf(b.tex[0]), tint);
        const side = tileCanvas(tileOf(b.tex[2]), b.key === 'leaves' ? tint : null);
        const front = b.tex[3] !== undefined ? tileCanvas(tileOf(b.tex[3]), null) : side;
        urls.set(item.id, isoCube(top, side, front).toDataURL());
      } else {
        const flat = tileCanvas(tileOf(b.tex[2]), tint);
        small.set(item.id, flat);
        urls.set(item.id, upscale(flat).toDataURL());
      }
      continue;
    }
    const t = new PixelTile();
    if (!paintItem(item.id, t)) continue;
    const c = tileCanvas(t, null);
    small.set(item.id, c);
    urls.set(item.id, upscale(c).toDataURL());
  }

  return {
    url: (id) => urls.get(id) ?? '',
    canvas16: (id) => small.get(id) ?? null,
  };
}
