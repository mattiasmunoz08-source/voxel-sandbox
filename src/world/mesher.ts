import { tileUV } from '../render/atlasLayout';
import { Tile } from '../render/tiles';
import { B, BLOCKS, IS_OPAQUE, RENDER } from './blocks';
import type { Chunk } from './Chunk';
import { CHUNK_AREA, CHUNK_HEIGHT, CHUNK_SIZE } from './constants';
import { BIOME_TINT } from './generator';

const S = CHUNK_SIZE;
const H = CHUNK_HEIGHT;
const PS = S + 2;
const PH = H + 2;
const PAREA = PS * PS;

/** Índice en el volumen acolchado (chunk + 1 bloque de borde de los vecinos). */
function pidx(x: number, y: number, z: number): number {
  return x + 1 + (z + 1) * PS + (y + 1) * PAREA;
}

export interface MeshData {
  positions: Float32Array;
  uvs: Float32Array;
  shades: Float32Array;
  lights: Float32Array;
  indices: Uint32Array | Uint16Array;
}

export interface ChunkMeshResult {
  opaque: MeshData | null;
  water: MeshData | null;
}

export interface MesherContext {
  /** Devuelve el chunk vecino ya generado (dx, dz en -1..1). */
  neighbor(dx: number, dz: number): Chunk | undefined;
  /** Lectura de bloques en coordenadas de mundo, usada al propagar la luz de antorchas. */
  getBlock(x: number, y: number, z: number): number;
  fancyLeaves: boolean;
}

class GeoBuilder {
  pos: number[] = [];
  uv: number[] = [];
  shade: number[] = [];
  light: number[] = [];
  idx: number[] = [];
  count = 0;

  build(): MeshData | null {
    if (this.count === 0) return null;
    return {
      positions: new Float32Array(this.pos),
      uvs: new Float32Array(this.uv),
      shades: new Float32Array(this.shade),
      lights: new Float32Array(this.light),
      indices: this.count > 65535 ? new Uint32Array(this.idx) : new Uint16Array(this.idx),
    };
  }
}

interface FaceDef {
  n: [number, number, number];
  corners: [number, number, number][];
  shade: number;
  /** Ejes tangentes del plano de la cara. */
  t: [number, number];
}

const FACES: FaceDef[] = [
  { n: [1, 0, 0], corners: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], shade: 0.68, t: [1, 2] },
  { n: [-1, 0, 0], corners: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], shade: 0.68, t: [1, 2] },
  { n: [0, 1, 0], corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], shade: 1, t: [0, 2] },
  { n: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], shade: 0.52, t: [0, 2] },
  { n: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], shade: 0.84, t: [0, 1] },
  { n: [0, 0, -1], corners: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], shade: 0.84, t: [0, 1] },
];
const CORNER_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
const AO_CURVE = [0.5, 0.67, 0.84, 1];
const LEAVES_ID = B.LEAVES;

// Volúmenes reutilizados entre llamadas para no crear basura en cada remallado.
const padBlocks = new Uint8Array(PAREA * PH);
const padHeight = new Int16Array(PAREA);
const padBlockLight = new Uint8Array(PAREA * PH);

const LIGHT_RANGE = 15;
const BOX = LIGHT_RANGE * 2 + 1;
const bfsLevel = new Uint8Array(BOX * BOX * BOX);
const bfsQueue = new Int32Array(BOX * BOX * BOX * 4);

function skyAt(px: number, y: number, pz: number): number {
  const h = padHeight[px + 1 + (pz + 1) * PS];
  if (y > h) return 15;
  const depth = h - y;
  return depth >= 4 ? 0 : 15 - depth * 4;
}

function fillPadded(chunk: Chunk, ctx: MesherContext): boolean {
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const src = dx === 0 && dz === 0 ? chunk : ctx.neighbor(dx, dz);
      if (!src) return false;
      const x0 = dx === -1 ? S - 1 : 0;
      const x1 = dx === 1 ? 0 : S - 1;
      const z0 = dz === -1 ? S - 1 : 0;
      const z1 = dz === 1 ? 0 : S - 1;
      for (let lz = z0; lz <= z1; lz++) {
        for (let lx = x0; lx <= x1; lx++) {
          const px = lx + dx * S;
          const pz = lz + dz * S;
          const col = lx + lz * S;
          padHeight[px + 1 + (pz + 1) * PS] = src.heightMap[col];
          let p = pidx(px, 0, pz);
          let s = col;
          for (let y = 0; y < H; y++) {
            padBlocks[p] = src.blocks[s];
            p += PAREA;
            s += CHUNK_AREA;
          }
        }
      }
    }
  }
  // Capa inferior opaca (oculta la cara de abajo del mundo) y capa superior vacía.
  for (let i = 0; i < PAREA; i++) {
    padBlocks[i] = B.BEDROCK;
    padBlocks[i + (PH - 1) * PAREA] = B.AIR;
  }
  return true;
}

/** Propaga la luz de cada antorcha cercana por los bloques no opacos (BFS, -1 por paso). */
function computeBlockLight(chunk: Chunk, ctx: MesherContext): void {
  padBlockLight.fill(0);
  const ox = chunk.cx * S;
  const oz = chunk.cz * S;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const src = dx === 0 && dz === 0 ? chunk : ctx.neighbor(dx, dz);
      if (!src || src.lights.size === 0) continue;
      for (const li of src.lights) {
        const lx = li % S;
        const lz = Math.floor(li / S) % S;
        const ly = Math.floor(li / CHUNK_AREA);
        const tx = src.cx * S + lx;
        const tz = src.cz * S + lz;
        const level = BLOCKS[src.blocks[li]].light;
        // Distancia de Chebyshev a la región acolchada: si es mayor que el alcance, no la toca.
        const ddx = Math.max(ox - 1 - tx, 0, tx - (ox + S));
        const ddz = Math.max(oz - 1 - tz, 0, tz - (oz + S));
        if (ddx >= level || ddz >= level) continue;
        propagate(tx, ly, tz, level, ox, oz, ctx);
      }
    }
  }
}

function propagate(tx: number, ty: number, tz: number, level: number, ox: number, oz: number, ctx: MesherContext): void {
  bfsLevel.fill(0);
  const c = LIGHT_RANGE;
  let head = 0;
  let tail = 0;
  const start = c + c * BOX + c * BOX * BOX;
  bfsLevel[start] = level;
  bfsQueue[tail++] = c; bfsQueue[tail++] = c; bfsQueue[tail++] = c; bfsQueue[tail++] = level;
  while (head < tail) {
    const bx = bfsQueue[head++];
    const by = bfsQueue[head++];
    const bz = bfsQueue[head++];
    const lv = bfsQueue[head++];
    const wx = tx + bx - c;
    const wy = ty + by - c;
    const wz = tz + bz - c;
    const px = wx - ox;
    const pz = wz - oz;
    if (px >= -1 && px <= S && pz >= -1 && pz <= S && wy >= -1 && wy <= H) {
      const pi = pidx(px, wy, pz);
      if (padBlockLight[pi] < lv) padBlockLight[pi] = lv;
    }
    if (lv <= 1) continue;
    const nl = lv - 1;
    for (let d = 0; d < 6; d++) {
      const nx = bx + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = by + (d === 2 ? 1 : d === 3 ? -1 : 0);
      const nz = bz + (d === 4 ? 1 : d === 5 ? -1 : 0);
      if (nx < 0 || ny < 0 || nz < 0 || nx >= BOX || ny >= BOX || nz >= BOX) continue;
      const bi = nx + ny * BOX + nz * BOX * BOX;
      if (bfsLevel[bi] >= nl) continue;
      const wyy = ty + ny - c;
      if (wyy < 0 || wyy >= H) continue;
      if (IS_OPAQUE[ctx.getBlock(tx + nx - c, wyy, tz + nz - c)]) continue;
      bfsLevel[bi] = nl;
      bfsQueue[tail++] = nx; bfsQueue[tail++] = ny; bfsQueue[tail++] = nz; bfsQueue[tail++] = nl;
    }
  }
}

/** Genera la geometría de un chunk: sólo las caras visibles, con oclusión ambiental y luz por vértice. */
export function buildChunkMesh(chunk: Chunk, ctx: MesherContext): ChunkMeshResult | null {
  if (!fillPadded(chunk, ctx)) return null;
  computeBlockLight(chunk, ctx);

  const solid = new GeoBuilder();
  const water = new GeoBuilder();
  const fancy = ctx.fancyLeaves;
  const occ = (id: number) => IS_OPAQUE[id] === 1 || id === LEAVES_ID;

  const cellLight = (x: number, y: number, z: number, out: number[]) => {
    out[0] = skyAt(x, y, z);
    out[1] = padBlockLight[pidx(x, y, z)];
  };
  const tmpL = [0, 0];

  const emitCubeFace = (x: number, y: number, z: number, f: number, tile: number, tint: [number, number, number] | null) => {
    const face = FACES[f];
    const [nx, ny, nz] = face.n;
    const ax = x + nx, ay = y + ny, az = z + nz;
    const [t1, t2] = face.t;
    const uv = tileUV(tile);
    const base = solid.count;
    const ao = [0, 0, 0, 0];
    for (let v = 0; v < 4; v++) {
      const c = face.corners[v];
      const s1 = [0, 0, 0];
      const s2 = [0, 0, 0];
      s1[t1] = c[t1] === 1 ? 1 : -1;
      s2[t2] = c[t2] === 1 ? 1 : -1;
      const b1 = padBlocks[pidx(ax + s1[0], ay + s1[1], az + s1[2])];
      const b2 = padBlocks[pidx(ax + s2[0], ay + s2[1], az + s2[2])];
      const bc = padBlocks[pidx(ax + s1[0] + s2[0], ay + s1[1] + s2[1], az + s1[2] + s2[2])];
      const o1 = occ(b1) ? 1 : 0;
      const o2 = occ(b2) ? 1 : 0;
      const oc = occ(bc) ? 1 : 0;
      const a = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
      ao[v] = a;

      // Luz suave: promedio de las celdas abiertas que tocan el vértice.
      let sky = 0, blk = 0, n = 0;
      cellLight(ax, ay, az, tmpL); sky += tmpL[0]; blk += tmpL[1]; n++;
      if (!IS_OPAQUE[b1]) { cellLight(ax + s1[0], ay + s1[1], az + s1[2], tmpL); sky += tmpL[0]; blk += tmpL[1]; n++; }
      if (!IS_OPAQUE[b2]) { cellLight(ax + s2[0], ay + s2[1], az + s2[2], tmpL); sky += tmpL[0]; blk += tmpL[1]; n++; }
      if (!IS_OPAQUE[bc] && !(IS_OPAQUE[b1] && IS_OPAQUE[b2])) {
        cellLight(ax + s1[0] + s2[0], ay + s1[1] + s2[1], az + s1[2] + s2[2], tmpL); sky += tmpL[0]; blk += tmpL[1]; n++;
      }

      const shade = face.shade * AO_CURVE[a];
      solid.pos.push(x + c[0], y + c[1], z + c[2]);
      const cu = CORNER_UV[v];
      solid.uv.push(cu[0] ? uv[2] : uv[0], cu[1] ? uv[3] : uv[1]);
      if (tint) solid.shade.push(shade * tint[0], shade * tint[1], shade * tint[2]);
      else solid.shade.push(shade, shade, shade);
      solid.light.push(sky / n / 15, blk / n / 15);
    }
    solid.count += 4;
    if (ao[0] + ao[2] > ao[1] + ao[3]) solid.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else solid.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  };

  const emitQuad = (
    g: GeoBuilder,
    pts: number[][],
    uv: [number, number, number, number],
    uvRect: [number, number, number, number],
    shade: [number, number, number],
    sky: number,
    blk: number,
    doubleSided: boolean,
  ) => {
    const base = g.count;
    const du = uv[2] - uv[0];
    const dv = uv[3] - uv[1];
    const corners = [[uvRect[0], uvRect[1]], [uvRect[2], uvRect[1]], [uvRect[2], uvRect[3]], [uvRect[0], uvRect[3]]];
    for (let v = 0; v < 4; v++) {
      g.pos.push(pts[v][0], pts[v][1], pts[v][2]);
      g.uv.push(uv[0] + du * corners[v][0], uv[1] + dv * corners[v][1]);
      g.shade.push(shade[0], shade[1], shade[2]);
      g.light.push(sky, blk);
    }
    g.count += 4;
    g.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    if (doubleSided) g.idx.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };

  for (let y = 0; y < H; y++) {
    for (let z = 0; z < S; z++) {
      for (let x = 0; x < S; x++) {
        const id = padBlocks[pidx(x, y, z)];
        if (id === B.AIR) continue;
        const render = RENDER[id];
        const def = BLOCKS[id];
        const biome = chunk.biomes[x + z * S];
        const tint = def.tint ? BIOME_TINT[biome] : null;

        if (render === 1) {
          for (let f = 0; f < 6; f++) {
            const n = FACES[f].n;
            const other = padBlocks[pidx(x + n[0], y + n[1], z + n[2])];
            if (IS_OPAQUE[other]) continue;
            // Con hojas rápidas (opacas) se ocultan las caras pegadas a ellas.
            if (other === LEAVES_ID && !fancy) continue;
            let tile: number;
            if (f === 2) tile = def.tex[0];
            else if (f === 3) tile = def.tex[1];
            else tile = f === 5 && def.tex[3] !== undefined ? def.tex[3] : def.tex[2];
            if (id === LEAVES_ID && !fancy) tile = Tile.LEAVES_OPAQUE;
            const faceTint = id === B.GRASS ? (f === 2 ? tint : null) : tint;
            emitCubeFace(x, y, z, f, tile, faceTint);
          }
        } else if (render === 2) {
          cellLight(x, y, z, tmpL);
          const sky = tmpL[0] / 15;
          const blk = tmpL[1] / 15;
          const uv = tileUV(def.tex[2]);
          const sh: [number, number, number] = tint ? [tint[0], tint[1], tint[2]] : [1, 1, 1];
          const a = 0.15, b = 0.85;
          emitQuad(solid, [[x + a, y, z + a], [x + b, y, z + b], [x + b, y + 1, z + b], [x + a, y + 1, z + a]], uv, [0, 0, 1, 1], sh, sky, blk, true);
          emitQuad(solid, [[x + a, y, z + b], [x + b, y, z + a], [x + b, y + 1, z + a], [x + a, y + 1, z + b]], uv, [0, 0, 1, 1], sh, sky, blk, true);
        } else if (render === 3) {
          const uv = tileUV(def.tex[2]);
          const lo = 7 / 16, hi = 9 / 16, top = 10 / 16;
          const sh: [number, number, number] = [1, 1, 1];
          const sideRect: [number, number, number, number] = [lo, 0, hi, top];
          const x0 = x + lo, x1 = x + hi, z0 = z + lo, z1 = z + hi, y1 = y + top;
          emitQuad(solid, [[x0, y, z1], [x1, y, z1], [x1, y1, z1], [x0, y1, z1]], uv, sideRect, sh, 1, 1, false);
          emitQuad(solid, [[x1, y, z0], [x0, y, z0], [x0, y1, z0], [x1, y1, z0]], uv, sideRect, sh, 1, 1, false);
          emitQuad(solid, [[x1, y, z1], [x1, y, z0], [x1, y1, z0], [x1, y1, z1]], uv, sideRect, sh, 1, 1, false);
          emitQuad(solid, [[x0, y, z0], [x0, y, z1], [x0, y1, z1], [x0, y1, z0]], uv, sideRect, sh, 1, 1, false);
          emitQuad(solid, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], uv, [lo, 8 / 16, hi, top], sh, 1, 1, false);
        } else if (render === 4) {
          const aboveId = padBlocks[pidx(x, y + 1, z)];
          const topH = aboveId === B.WATER ? 1 : 0.875;
          const uv = tileUV(def.tex[0]);
          for (let f = 0; f < 6; f++) {
            const n = FACES[f].n;
            const other = padBlocks[pidx(x + n[0], y + n[1], z + n[2])];
            if (other === B.WATER || IS_OPAQUE[other]) continue;
            cellLight(x + n[0], Math.min(y + n[1], H), z + n[2], tmpL);
            const sky = tmpL[0] / 15;
            const blk = tmpL[1] / 15;
            const face = FACES[f];
            const pts = face.corners.map((c) => [x + c[0], y + (c[1] === 1 ? topH : 0), z + c[2]]);
            const s = face.shade;
            emitQuad(water, pts, uv, [0, 0, 1, f === 2 || f === 3 ? 1 : topH], [s, s, s], sky, blk, false);
          }
        }
      }
    }
  }
  return { opaque: solid.build(), water: water.build() };
}
