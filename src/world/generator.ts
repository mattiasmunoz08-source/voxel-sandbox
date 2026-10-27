import { B } from './blocks';
import { CHUNK_HEIGHT, CHUNK_SIZE, SEA_LEVEL, blockIndex } from './constants';
import { SimplexNoise, hash2, hash3 } from './noise';

export const Biome = { PLAINS: 0, FOREST: 1, DESERT: 2, TUNDRA: 3, MOUNTAIN: 4 } as const;
export const BIOME_NAMES = ['Llanura', 'Bosque', 'Desierto', 'Tundra', 'Montaña'];

/** Tinte de césped y hojas por bioma, aplicado como color de vértice. */
export const BIOME_TINT: [number, number, number][] = [
  [1.02, 1.04, 0.84],
  [0.74, 0.9, 0.66],
  [1.1, 1.02, 0.7],
  [0.82, 0.94, 0.96],
  [0.86, 0.94, 0.82],
];

const MARGIN = 3; // radio máximo de las copas de los árboles
const PAD = CHUNK_SIZE + MARGIN * 2;

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export interface ColumnInfo {
  height: number;
  biome: number;
}

export class TerrainGenerator {
  readonly seed: number;
  private continental: SimplexNoise;
  private hills: SimplexNoise;
  private rough: SimplexNoise;
  private ridge: SimplexNoise;
  private temp: SimplexNoise;
  private humid: SimplexNoise;
  private caveA: SimplexNoise;
  private caveB: SimplexNoise;

  private heights = new Int16Array(PAD * PAD);
  private biomes = new Uint8Array(PAD * PAD);

  constructor(seed: number) {
    this.seed = seed | 0;
    this.continental = new SimplexNoise(seed ^ 0x1f2e3d);
    this.hills = new SimplexNoise(seed ^ 0x51a7c3);
    this.rough = new SimplexNoise(seed ^ 0x2468ac);
    this.ridge = new SimplexNoise(seed ^ 0x7d3b19);
    this.temp = new SimplexNoise(seed ^ 0x13579b);
    this.humid = new SimplexNoise(seed ^ 0x6c8e2a);
    this.caveA = new SimplexNoise(seed ^ 0x4b1d00);
    this.caveB = new SimplexNoise(seed ^ 0x00c0de);
  }

  /** Altura de la superficie y bioma de una columna. Función pura de (x, z, semilla). */
  column(x: number, z: number): ColumnInfo {
    const t = this.temp.fbm2(x / 520, z / 520, 2);
    const h = this.humid.fbm2(x / 430 + 91.7, z / 430 - 33.1, 2);
    const desertness = smoothstep(0.12, 0.32, t) * smoothstep(0.15, -0.05, h);
    const rough = (this.rough.noise2(x / 320, z / 320) + 1) * 0.5;
    const mountainMask = smoothstep(0.58, 0.85, rough) * (1 - desertness);

    const cont = this.continental.fbm2(x / 260, z / 260, 3);
    const hill = this.hills.fbm2(x / 72, z / 72, 4);
    const r = 1 - Math.abs(this.ridge.fbm2(x / 140, z / 140, 3));
    const ridged = r * r;

    let height = SEA_LEVEL + 3 + cont * 11 + hill * (3 + rough * 9) * (1 - 0.6 * desertness) + ridged * 34 * mountainMask;
    height = Math.max(4, Math.min(CHUNK_HEIGHT - 12, Math.floor(height)));

    let biome: number = Biome.PLAINS;
    if (height >= 60) biome = Biome.MOUNTAIN;
    else if (desertness > 0.5) biome = Biome.DESERT;
    else if (t < -0.32) biome = Biome.TUNDRA;
    else if (h > 0.08) biome = Biome.FOREST;
    return { height, biome };
  }

  /** Busca una columna de tierra firme cerca del origen para aparecer. */
  findSpawn(): { x: number; y: number; z: number } {
    for (let radius = 0; radius < 400; radius += 4) {
      const steps = Math.max(1, Math.floor((radius * 2 * Math.PI) / 4));
      for (let s = 0; s < steps; s++) {
        const a = (s / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(a) * radius);
        const z = Math.round(Math.sin(a) * radius);
        const col = this.column(x, z);
        if (col.height > SEA_LEVEL + 1 && col.height < 56 && !this.hasTree(x, z, col)) {
          return { x: x + 0.5, y: col.height + 1, z: z + 0.5 };
        }
      }
    }
    return { x: 0.5, y: CHUNK_HEIGHT - 4, z: 0.5 };
  }

  private treeChance(biome: number): number {
    switch (biome) {
      case Biome.FOREST: return 0.034;
      case Biome.PLAINS: return 0.0035;
      case Biome.TUNDRA: return 0.008;
      case Biome.MOUNTAIN: return 0.004;
      default: return 0;
    }
  }

  private hasTree(x: number, z: number, col: ColumnInfo): boolean {
    if (col.height <= SEA_LEVEL || col.height >= 66) return false;
    return hash2(x, z, this.seed ^ 0x7ee5) < this.treeChance(col.biome);
  }

  /**
   * Rellena los bloques de un chunk. `biomeOut` recibe el bioma de cada columna (para el tinte).
   * Los árboles de columnas vecinas se tienen en cuenta mediante un margen, así las copas
   * cruzan los bordes de chunk sin cortes.
   */
  generate(cx: number, cz: number, out: Uint8Array, biomeOut: Uint8Array): void {
    const ox = cx * CHUNK_SIZE;
    const oz = cz * CHUNK_SIZE;
    const seed = this.seed;
    const heights = this.heights;
    const biomes = this.biomes;

    for (let pz = 0; pz < PAD; pz++) {
      for (let px = 0; px < PAD; px++) {
        const col = this.column(ox + px - MARGIN, oz + pz - MARGIN);
        heights[px + pz * PAD] = col.height;
        biomes[px + pz * PAD] = col.biome;
      }
    }

    out.fill(B.AIR);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = ox + lx;
        const wz = oz + lz;
        const p = lx + MARGIN + (lz + MARGIN) * PAD;
        const h = heights[p];
        const biome = biomes[p];
        biomeOut[lx + lz * CHUNK_SIZE] = biome;

        const slope = Math.max(
          Math.abs(h - heights[p + 1]), Math.abs(h - heights[p - 1]),
          Math.abs(h - heights[p + PAD]), Math.abs(h - heights[p - PAD]),
        );

        let top: number = B.GRASS;
        let filler: number = B.DIRT;
        let fillerDepth = 3;
        if (biome === Biome.DESERT) {
          top = B.SAND; filler = B.SAND; fillerDepth = 4;
        } else if (biome === Biome.TUNDRA) {
          top = B.SNOW;
        } else if (biome === Biome.MOUNTAIN) {
          top = h >= 70 ? B.SNOW : slope > 2 ? B.STONE : B.GRASS;
          fillerDepth = 2;
        }
        if (slope > 3 && biome !== Biome.DESERT && h < 70) { top = B.STONE; filler = B.STONE; }
        if (h <= SEA_LEVEL + 1 && biome !== Biome.TUNDRA) { top = B.SAND; filler = B.SAND; }
        if (h < SEA_LEVEL - 1) { top = hash2(wx, wz, seed ^ 0x5eaf) < 0.5 ? B.SAND : B.DIRT; filler = top; }

        for (let y = 0; y <= h; y++) {
          let id: number;
          if (y === 0) id = B.BEDROCK;
          else if (y <= 2 && hash3(wx, y, wz, seed) < 0.5 - y * 0.15) id = B.BEDROCK;
          else if (y === h) id = top;
          else if (y >= h - fillerDepth) id = filler;
          else if (biome === Biome.DESERT && y >= h - fillerDepth - 3) id = B.SANDSTONE;
          else id = B.STONE;
          out[blockIndex(lx, y, lz)] = id;
        }

        // Cuevas tipo túnel: intersección de dos superficies de ruido cerca de cero.
        const caveTop = h - 5;
        for (let y = 3; y < caveTop; y++) {
          const a = this.caveA.noise3(wx / 38, y / 22, wz / 38);
          if (a > 0.11 || a < -0.11) continue;
          const b = this.caveB.noise3(wx / 38, y / 22, wz / 38);
          if (b > 0.11 || b < -0.11) continue;
          out[blockIndex(lx, y, lz)] = B.AIR;
        }

        // Vetas de carbón en grupos.
        for (let y = 4; y < h - 3; y++) {
          const i = blockIndex(lx, y, lz);
          if (out[i] !== B.STONE) continue;
          if (hash3(wx >> 1, y >> 1, wz >> 1, seed ^ 0xc0a1) < 0.035 && hash3(wx, y, wz, seed ^ 0x0c0a) < 0.62) {
            out[i] = B.COAL_ORE;
          }
        }

        for (let y = h + 1; y <= SEA_LEVEL; y++) out[blockIndex(lx, y, lz)] = B.WATER;

        // Vegetación pequeña (sólo en la propia columna).
        if (h > SEA_LEVEL && h + 1 < CHUNK_HEIGHT) {
          const above = blockIndex(lx, h + 1, lz);
          const r = hash2(wx, wz, seed ^ 0xf10a);
          if (top === B.GRASS) {
            const grassChance = biome === Biome.PLAINS ? 0.28 : biome === Biome.FOREST ? 0.14 : 0.08;
            const flowerChance = biome === Biome.PLAINS ? 0.035 : 0.015;
            const bushChance = biome === Biome.FOREST ? 0.007 : 0.009;
            if (r < bushChance) out[above] = B.BERRY_BUSH;
            else if (r < bushChance + flowerChance) out[above] = hash2(wx, wz, seed ^ 0xf1) < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW;
            else if (r < bushChance + flowerChance + grassChance) out[above] = B.TALL_GRASS;
          } else if (biome === Biome.DESERT && top === B.SAND && r < 0.006) {
            const tall = 1 + Math.floor(hash2(wx, wz, seed ^ 0xcac7) * 3);
            for (let k = 1; k <= tall && h + k < CHUNK_HEIGHT; k++) out[blockIndex(lx, h + k, lz)] = B.CACTUS;
          }
        }
      }
    }

    // Árboles (también los de columnas vecinas cuyas copas entran en este chunk).
    for (let pz = 0; pz < PAD; pz++) {
      for (let px = 0; px < PAD; px++) {
        const wx = ox + px - MARGIN;
        const wz = oz + pz - MARGIN;
        const p = px + pz * PAD;
        const col = { height: heights[p], biome: biomes[p] };
        if (col.biome === Biome.DESERT || !this.hasTree(wx, wz, col)) continue;
        // Sólo crece sobre césped o nieve: evita árboles en pendientes de piedra o playas.
        const slope = px > 0 && pz > 0 && px < PAD - 1 && pz < PAD - 1
          ? Math.max(Math.abs(col.height - heights[p + 1]), Math.abs(col.height - heights[p - 1]), Math.abs(col.height - heights[p + PAD]), Math.abs(col.height - heights[p - PAD]))
          : 0;
        if (slope > 2 || col.height <= SEA_LEVEL + 1) continue;
        this.placeTree(out, wx - ox, col.height + 1, wz - oz, wx, wz);
      }
    }
  }

  private placeTree(out: Uint8Array, lx: number, baseY: number, lz: number, wx: number, wz: number): void {
    const seed = this.seed;
    const trunk = 4 + Math.floor(hash2(wx, wz, seed ^ 0x7a11) * 3);
    const topY = baseY + trunk - 1;
    const inside = (x: number, z: number) => x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE;

    for (let y = topY - 2; y <= topY + 1; y++) {
      if (y >= CHUNK_HEIGHT) break;
      const layer = y - (topY - 2);
      const radius = layer < 2 ? 2 : 1;
      for (let dz = -radius; dz <= radius; dz++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const corner = Math.abs(dx) === radius && Math.abs(dz) === radius;
          if (corner && (layer === 3 || hash3(wx + dx, y, wz + dz, seed ^ 0x1eaf) < 0.55)) continue;
          const x = lx + dx;
          const z = lz + dz;
          if (!inside(x, z)) continue;
          const i = blockIndex(x, y, z);
          const cur = out[i];
          if (cur === B.AIR || cur === B.TALL_GRASS || cur === B.FLOWER_RED || cur === B.FLOWER_YELLOW) out[i] = B.LEAVES;
        }
      }
    }
    if (inside(lx, lz)) {
      for (let y = baseY; y <= topY && y < CHUNK_HEIGHT; y++) out[blockIndex(lx, y, lz)] = B.LOG;
      const below = blockIndex(lx, baseY - 1, lz);
      if (out[below] === B.GRASS || out[below] === B.SNOW) out[below] = B.DIRT;
    }
  }
}
