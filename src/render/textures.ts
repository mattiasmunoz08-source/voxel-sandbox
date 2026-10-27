import { mulberry32 } from '../world/noise';
import { ATLAS_TILES, CRACK_STAGES, TILE_PX, Tile } from './tiles';

type RGBA = [number, number, number, number];
type Rand = () => number;

/** Lienzo de una casilla de 16×16 con utilidades de pintado por píxel. */
export class PixelTile {
  readonly data = new Uint8ClampedArray(TILE_PX * TILE_PX * 4);

  set(x: number, y: number, c: RGBA): void {
    if (x < 0 || y < 0 || x >= TILE_PX || y >= TILE_PX) return;
    const i = (y * TILE_PX + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
  }

  get(x: number, y: number): RGBA {
    const i = (y * TILE_PX + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }

  fill(fn: (x: number, y: number) => RGBA | null): void {
    for (let y = 0; y < TILE_PX; y++) {
      for (let x = 0; x < TILE_PX; x++) {
        const c = fn(x, y);
        if (c) this.set(x, y, c);
      }
    }
  }
}

function vary(base: [number, number, number], amount: number, rand: Rand, alpha = 255): RGBA {
  const k = (rand() * 2 - 1) * amount;
  return [base[0] + k, base[1] + k, base[2] + k * 0.8, alpha];
}

function shade(c: [number, number, number], f: number, alpha = 255): RGBA {
  return [c[0] * f, c[1] * f, c[2] * f, alpha];
}

const GRASS: [number, number, number] = [98, 156, 60];
const DIRT: [number, number, number] = [124, 88, 60];
const STONE: [number, number, number] = [126, 127, 131];
const SAND: [number, number, number] = [220, 204, 150];
const SANDSTONE: [number, number, number] = [212, 188, 128];
const BARK: [number, number, number] = [98, 72, 44];
const WOOD: [number, number, number] = [178, 140, 88];
const LEAF: [number, number, number] = [62, 118, 42];
const PLANK: [number, number, number] = [172, 130, 80];
const SNOW: [number, number, number] = [236, 242, 248];

function paintDirt(t: PixelTile, r: Rand): void {
  t.fill(() => vary(DIRT, 14, r));
  for (let i = 0; i < 9; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), shade(DIRT, 0.7));
  for (let i = 0; i < 5; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), shade(DIRT, 1.25));
  for (let i = 0; i < 3; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), [150, 140, 128, 255]);
}

function paintGrassTop(t: PixelTile, r: Rand): void {
  t.fill(() => vary(GRASS, 16, r));
  for (let i = 0; i < 18; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), shade(GRASS, 1.18));
  for (let i = 0; i < 14; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), shade(GRASS, 0.8));
}

function paintSideWithTop(t: PixelTile, r: Rand, top: [number, number, number], depthBase: number): void {
  paintDirt(t, r);
  for (let x = 0; x < 16; x++) {
    const depth = depthBase + Math.floor(r() * 3);
    for (let y = 0; y < depth; y++) t.set(x, y, vary(top, 12, r));
    t.set(x, depth, shade(top, 0.72));
  }
}

function paintStone(t: PixelTile, r: Rand): void {
  t.fill(() => vary(STONE, 12, r));
  for (let i = 0; i < 6; i++) {
    let x = Math.floor(r() * 16);
    let y = Math.floor(r() * 16);
    const len = 2 + Math.floor(r() * 3);
    for (let k = 0; k < len; k++) {
      t.set(x, y, shade(STONE, 0.78));
      x += r() < 0.5 ? 1 : 0;
      y += r() < 0.5 ? 1 : 0;
    }
  }
  for (let i = 0; i < 8; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), shade(STONE, 1.15));
}

/** Celdas de Voronoi en un mosaico que se repite: piedras redondeadas con juntas. */
function paintCells(t: PixelTile, r: Rand, base: [number, number, number], cells: number, joint: number): void {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < cells; i++) pts.push([r() * 16, r() * 16, 0.85 + r() * 0.3]);
  t.fill((x, y) => {
    let best = 1e9, second = 1e9, bi = 0;
    for (let i = 0; i < pts.length; i++) {
      for (let oy = -16; oy <= 16; oy += 16) {
        for (let ox = -16; ox <= 16; ox += 16) {
          const dx = x + 0.5 - (pts[i][0] + ox);
          const dy = y + 0.5 - (pts[i][1] + oy);
          const d = dx * dx + dy * dy;
          if (d < best) { second = best; best = d; bi = i; }
          else if (d < second) second = d;
        }
      }
    }
    const edge = Math.sqrt(second) - Math.sqrt(best);
    if (edge < joint) return shade(base, 0.55);
    const f = pts[bi][2] * (edge < joint + 1 ? 0.85 : 1) + (r() - 0.5) * 0.08;
    return shade(base, f);
  });
}

function paintSand(t: PixelTile, r: Rand, base = SAND): void {
  t.fill(() => vary(base, 9, r));
  for (let i = 0; i < 10; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), shade(base, 0.86));
  for (let i = 0; i < 6; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), shade(base, 1.07));
}

function paintSandstoneSide(t: PixelTile, r: Rand): void {
  t.fill((_, y) => {
    if (y === 0 || y === 1) return vary(SANDSTONE, 5, r);
    if (y === 4 || y === 11) return shade(SANDSTONE, 0.82);
    if (y === 15) return shade(SANDSTONE, 0.78);
    return vary(SANDSTONE, 7, r);
  });
}

function paintSandstoneTop(t: PixelTile, r: Rand): void {
  t.fill((x, y) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    return border ? shade(SANDSTONE, 0.86) : vary(SANDSTONE, 5, r);
  });
}

function paintLogSide(t: PixelTile, r: Rand): void {
  const grooves = [1, 5, 9, 12];
  t.fill((x) => {
    if (grooves.includes(x)) return shade(BARK, 0.66);
    return vary(BARK, 10, r);
  });
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(r() * 16);
    const y = Math.floor(r() * 14);
    t.set(x, y, shade(BARK, 0.72));
    t.set(x, y + 1, shade(BARK, 0.72));
  }
}

function paintLogTop(t: PixelTile, r: Rand): void {
  t.fill((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return vary(BARK, 8, r);
    const ring = Math.floor(d) % 2 === 0;
    return ring ? vary(WOOD, 6, r) : shade(WOOD, 0.84);
  });
}

function paintLeaves(t: PixelTile, r: Rand, holes: boolean): void {
  t.fill(() => {
    const v = r();
    if (holes && v < 0.16) return [0, 0, 0, 0];
    if (v < 0.3) return shade(LEAF, 0.74);
    if (v > 0.86) return shade(LEAF, 1.22);
    return vary(LEAF, 10, r);
  });
}

function paintPlanks(t: PixelTile, r: Rand): void {
  t.fill((x, y) => {
    const row = Math.floor(y / 4);
    if (y % 4 === 3) return shade(PLANK, 0.62);
    const joint = row % 2 === 0 ? 4 : 11;
    if (x === joint) return shade(PLANK, 0.7);
    const grain = (x * 7 + row * 13) % 5 === 0 ? 0.9 : 1;
    return shade(vary(PLANK, 8, r).slice(0, 3) as [number, number, number], grain);
  });
}

function paintWater(t: PixelTile, r: Rand): void {
  t.fill((x, y) => {
    const wave = Math.sin((x + y * 0.5) * 0.9) + Math.sin(y * 1.3 - x * 0.4);
    if (wave > 1.5) return [118, 168, 230, 210];
    return vary([46, 98, 186], 10, r, 196);
  });
}

function paintOre(t: PixelTile, r: Rand, ore: [number, number, number]): void {
  paintStone(t, r);
  const blobs = 4;
  for (let b = 0; b < blobs; b++) {
    const cx = 2 + Math.floor(r() * 12);
    const cy = 2 + Math.floor(r() * 12);
    for (let i = 0; i < 4; i++) {
      const x = cx + Math.floor(r() * 3) - 1;
      const y = cy + Math.floor(r() * 3) - 1;
      t.set(x, y, vary(ore, 8, r));
      t.set(x + 1, y, shade(ore, 1.6));
    }
  }
}

function paintBedrock(t: PixelTile, r: Rand): void {
  t.fill(() => {
    const v = r();
    if (v < 0.3) return [38, 38, 42, 255];
    if (v < 0.6) return [70, 70, 76, 255];
    return [104, 104, 110, 255];
  });
}

function paintSnow(t: PixelTile, r: Rand): void {
  t.fill(() => vary(SNOW, 5, r));
  for (let i = 0; i < 8; i++) t.set(Math.floor(r() * 16), Math.floor(r() * 16), [212, 226, 240, 255]);
}

function paintCactusSide(t: PixelTile, r: Rand): void {
  const base: [number, number, number] = [72, 128, 50];
  t.fill((x) => {
    if (x === 0 || x === 15) return shade(base, 0.6);
    if (x === 4 || x === 11) return shade(base, 0.78);
    return vary(base, 8, r);
  });
  for (let y = 1; y < 16; y += 3) {
    t.set(2, y, [226, 222, 170, 255]);
    t.set(8, y + 1, [226, 222, 170, 255]);
    t.set(13, y, [226, 222, 170, 255]);
  }
}

function paintCactusTop(t: PixelTile, r: Rand): void {
  const base: [number, number, number] = [92, 150, 62];
  t.fill((x, y) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d > 6.5) return shade(base, 0.6);
    return Math.floor(d) % 3 === 0 ? shade(base, 0.85) : vary(base, 6, r);
  });
}

function paintBenchTop(t: PixelTile, r: Rand): void {
  paintPlanks(t, r);
  t.fill((x, y) => {
    if (x === 0 || y === 0 || x === 15 || y === 15) return shade(BARK, 0.8);
    if ((x === 5 || x === 10) && y > 1 && y < 14) return shade(PLANK, 0.55);
    return null;
  });
  // Marcas de herramientas talladas.
  for (let i = 2; i < 5; i++) t.set(i + 9, 12 - i, [80, 80, 86, 255]);
  t.set(3, 3, [80, 80, 86, 255]);
  t.set(3, 4, [80, 80, 86, 255]);
  t.set(2, 3, [80, 80, 86, 255]);
}

function paintBenchSide(t: PixelTile, r: Rand, front: boolean): void {
  paintPlanks(t, r);
  t.fill((x, y) => {
    if (y <= 2) return vary(WOOD, 6, r);
    if (y === 3) return shade(BARK, 0.7);
    if ((x <= 1 || x >= 14) && y > 3) return shade(BARK, 0.85);
    return null;
  });
  if (front) {
    // Martillo y cincel colgados.
    for (let y = 6; y < 13; y++) t.set(5, y, [120, 84, 50, 255]);
    for (let x = 3; x < 8; x++) { t.set(x, 5, [150, 150, 158, 255]); t.set(x, 6, [110, 110, 118, 255]); }
    for (let y = 5; y < 13; y++) t.set(10, y, y < 8 ? [160, 160, 168, 255] : [120, 84, 50, 255]);
  } else {
    // Sierra.
    for (let x = 4; x < 12; x++) t.set(x, 8, [170, 170, 176, 255]);
    for (let x = 4; x < 12; x += 2) t.set(x, 9, [130, 130, 138, 255]);
    t.set(12, 8, [120, 84, 50, 255]);
    t.set(13, 8, [120, 84, 50, 255]);
  }
}

function paintTorch(t: PixelTile): void {
  t.fill(() => [0, 0, 0, 0]);
  for (let y = 8; y < 16; y++) {
    t.set(7, y, [124, 88, 50, 255]);
    t.set(8, y, [96, 66, 38, 255]);
  }
  t.set(7, 6, [255, 236, 140, 255]);
  t.set(8, 6, [255, 196, 70, 255]);
  t.set(7, 7, [255, 170, 50, 255]);
  t.set(8, 7, [236, 120, 30, 255]);
}

function paintTallGrass(t: PixelTile, r: Rand): void {
  t.fill(() => [0, 0, 0, 0]);
  const blades = [1, 3, 4, 6, 8, 9, 11, 13, 14];
  for (const bx of blades) {
    const h = 6 + Math.floor(r() * 9);
    let x = bx;
    for (let k = 0; k < h; k++) {
      t.set(x, 15 - k, shade(GRASS, 0.8 + (k / h) * 0.45));
      if (k > 3 && r() < 0.25) x += r() < 0.5 ? -1 : 1;
    }
  }
}

function paintFlower(t: PixelTile, r: Rand, petal: [number, number, number], center: [number, number, number]): void {
  t.fill(() => [0, 0, 0, 0]);
  for (let y = 7; y < 16; y++) t.set(8, y, [64, 120, 44, 255]);
  t.set(7, 12, [76, 140, 52, 255]);
  t.set(6, 11, [76, 140, 52, 255]);
  t.set(9, 10, [76, 140, 52, 255]);
  t.set(10, 9, [76, 140, 52, 255]);
  const petals: [number, number][] = [[8, 3], [7, 4], [9, 4], [6, 5], [10, 5], [7, 6], [9, 6], [8, 7], [6, 4], [10, 4]];
  for (const [x, y] of petals) t.set(x, y, vary(petal, 12, r));
  t.set(8, 5, [center[0], center[1], center[2], 255]);
  t.set(8, 4, shade(center, 0.85));
}

function paintBerryBush(t: PixelTile, r: Rand): void {
  t.fill((x, y) => {
    const dx = x - 7.5;
    const dy = y - 9;
    if (dx * dx * 0.8 + dy * dy > 52) return [0, 0, 0, 0];
    if (r() < 0.12) return [0, 0, 0, 0];
    return vary([58, 104, 46], 14, r);
  });
  const berries: [number, number][] = [[4, 7], [10, 6], [7, 11], [12, 11], [3, 12], [8, 4]];
  for (const [x, y] of berries) {
    t.set(x, y, [178, 36, 66, 255]);
    t.set(x + 1, y, [140, 24, 52, 255]);
    t.set(x, y + 1, [120, 20, 46, 255]);
  }
}

function paintStoneBricks(t: PixelTile, r: Rand): void {
  t.fill((x, y) => {
    if (y % 8 === 7) return shade(STONE, 0.6);
    const offset = Math.floor(y / 8) % 2 === 0 ? 0 : 4;
    if ((x + offset) % 8 === 7) return shade(STONE, 0.62);
    if (y % 8 === 0) return shade(STONE, 1.12);
    return vary(STONE, 7, r);
  });
}

function paintCarvedSandstone(t: PixelTile, r: Rand): void {
  paintSandstoneSide(t, r);
  const dark = shade(SANDSTONE, 0.7);
  for (let i = 0; i < 6; i++) {
    t.set(5 + i, 6, dark);
    t.set(5 + i, 9, dark);
  }
  t.set(5, 7, dark); t.set(5, 8, dark); t.set(10, 7, dark); t.set(10, 8, dark);
  t.set(7, 7, dark); t.set(8, 8, dark);
}

function paintCrack(t: PixelTile, stage: number): void {
  t.fill(() => [0, 0, 0, 0]);
  // Misma secuencia en todas las etapas: cada una contiene las grietas de la anterior.
  const r = mulberry32(0xc4ac);
  const lines = 2 + stage * 2;
  for (let i = 0; i < lines; i++) {
    let x = 8 + Math.floor((r() - 0.5) * 6);
    let y = 8 + Math.floor((r() - 0.5) * 6);
    const len = 4 + Math.floor(r() * 4);
    for (let k = 0; k < len; k++) {
      t.set(x, y, [20, 18, 16, 200]);
      x += Math.floor(r() * 3) - 1;
      y += Math.floor(r() * 3) - 1;
    }
  }
}

export interface Atlas {
  canvas: HTMLCanvasElement;
  tiles: Map<number, PixelTile>;
}

/** Pinta todas las texturas de bloques en un único lienzo de 256×256. */
export function createAtlas(): Atlas {
  const size = ATLAS_TILES * TILE_PX;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const tiles = new Map<number, PixelTile>();

  const paint = (tile: number, fn: (t: PixelTile, r: Rand) => void) => {
    const t = new PixelTile();
    fn(t, mulberry32(0xa11a5 + tile * 7919));
    tiles.set(tile, t);
    const img = new ImageData(new Uint8ClampedArray(t.data), TILE_PX, TILE_PX);
    ctx.putImageData(img, (tile % ATLAS_TILES) * TILE_PX, Math.floor(tile / ATLAS_TILES) * TILE_PX);
  };

  paint(Tile.GRASS_TOP, paintGrassTop);
  paint(Tile.GRASS_SIDE, (t, r) => paintSideWithTop(t, r, GRASS, 3));
  paint(Tile.DIRT, paintDirt);
  paint(Tile.STONE, paintStone);
  paint(Tile.COBBLE, (t, r) => paintCells(t, r, STONE, 7, 0.9));
  paint(Tile.SAND, (t, r) => paintSand(t, r));
  paint(Tile.SANDSTONE_SIDE, paintSandstoneSide);
  paint(Tile.SANDSTONE_TOP, paintSandstoneTop);
  paint(Tile.LOG_SIDE, paintLogSide);
  paint(Tile.LOG_TOP, paintLogTop);
  paint(Tile.LEAVES, (t, r) => paintLeaves(t, r, true));
  paint(Tile.LEAVES_OPAQUE, (t, r) => paintLeaves(t, r, false));
  paint(Tile.PLANKS, paintPlanks);
  paint(Tile.WATER, paintWater);
  paint(Tile.COAL_ORE, (t, r) => paintOre(t, r, [34, 32, 34]));
  paint(Tile.BEDROCK, paintBedrock);
  paint(Tile.SNOW, paintSnow);
  paint(Tile.SNOW_SIDE, (t, r) => paintSideWithTop(t, r, SNOW, 4));
  paint(Tile.CACTUS_SIDE, paintCactusSide);
  paint(Tile.CACTUS_TOP, paintCactusTop);
  paint(Tile.BENCH_TOP, paintBenchTop);
  paint(Tile.BENCH_SIDE, (t, r) => paintBenchSide(t, r, false));
  paint(Tile.BENCH_FRONT, (t, r) => paintBenchSide(t, r, true));
  paint(Tile.TORCH, paintTorch);
  paint(Tile.TALL_GRASS, paintTallGrass);
  paint(Tile.FLOWER_RED, (t, r) => paintFlower(t, r, [206, 46, 52], [250, 210, 80]));
  paint(Tile.FLOWER_YELLOW, (t, r) => paintFlower(t, r, [246, 204, 54], [196, 110, 30]));
  paint(Tile.BERRY_BUSH, paintBerryBush);
  paint(Tile.STONE_BRICKS, paintStoneBricks);
  paint(Tile.CARVED_SANDSTONE, paintCarvedSandstone);
  for (let s = 0; s < CRACK_STAGES; s++) paint(Tile.CRACK_0 + s, (t) => paintCrack(t, s));

  return { canvas, tiles };
}

/** Colores representativos de una casilla (0..1), para partículas. */
export function sampleTileColors(atlas: Atlas, tile: number, tint: [number, number, number] | null, n = 8): [number, number, number][] {
  const t = atlas.tiles.get(tile);
  if (!t) return [[0.5, 0.5, 0.5]];
  const out: [number, number, number][] = [];
  const r = mulberry32(tile * 31 + 7);
  for (let tries = 0; tries < 64 && out.length < n; tries++) {
    const [cr, cg, cb, ca] = t.get(Math.floor(r() * TILE_PX), Math.floor(r() * TILE_PX));
    if (ca < 128) continue;
    const k = tint ?? [1, 1, 1];
    out.push([(cr / 255) * k[0], (cg / 255) * k[1], (cb / 255) * k[2]]);
  }
  return out.length ? out : [[0.5, 0.5, 0.5]];
}
