import * as THREE from 'three';
import type { ChunkMaterials } from '../render/chunkMaterial';
import { BLOCKS, B, IS_OPAQUE, IS_SOLID, isValidBlockId } from './blocks';
import { Chunk } from './Chunk';
import { CHUNK_AREA, CHUNK_HEIGHT, CHUNK_SIZE, blockIndex, chunkKey } from './constants';
import { TerrainGenerator } from './generator';
import { buildChunkMesh, type MeshData, type MesherContext } from './mesher';

const MAX_RADIUS = 12;

function toGeometry(d: MeshData): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(d.positions, 3));
  g.setAttribute('aUv', new THREE.BufferAttribute(d.uvs, 2));
  g.setAttribute('aShade', new THREE.BufferAttribute(d.shades, 3));
  g.setAttribute('aLight', new THREE.BufferAttribute(d.lights, 2));
  g.setIndex(new THREE.BufferAttribute(d.indices, 1));
  g.computeBoundingSphere();
  return g;
}

/** Un chunk se genera si es vecino de alguno que se malla (el mallado necesita sus 8 vecinos). */
function inGenRange(dx: number, dz: number, meshR2: number): boolean {
  const ax = Math.max(Math.abs(dx) - 1, 0);
  const az = Math.max(Math.abs(dz) - 1, 0);
  return ax * ax + az * az <= meshR2;
}

export interface LightSample {
  sky: number;
  block: number;
}

export class World {
  readonly generator: TerrainGenerator;
  readonly chunks = new Map<string, Chunk>();
  /** Bloques cambiados por el jugador: chunk → (índice local → id). Es lo que se guarda. */
  readonly edits = new Map<string, Map<number, number>>();
  readonly group = new THREE.Group();
  renderDistance: number;
  fancyLeaves: boolean;

  private readonly spiral: [number, number][] = [];
  private readonly materials: ChunkMaterials;

  constructor(seed: number, materials: ChunkMaterials, renderDistance: number, fancyLeaves: boolean) {
    this.generator = new TerrainGenerator(seed);
    this.materials = materials;
    this.renderDistance = renderDistance;
    this.fancyLeaves = fancyLeaves;
    for (let dz = -MAX_RADIUS; dz <= MAX_RADIUS; dz++) {
      for (let dx = -MAX_RADIUS; dx <= MAX_RADIUS; dx++) this.spiral.push([dx, dz]);
    }
    this.spiral.sort((a, b) => a[0] * a[0] + a[1] * a[1] - (b[0] * b[0] + b[1] * b[1]));
  }

  get seed(): number {
    return this.generator.seed;
  }

  getChunk(cx: number, cz: number): Chunk | undefined {
    return this.chunks.get(chunkKey(cx, cz));
  }

  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= CHUNK_HEIGHT) return B.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return B.AIR;
    return chunk.blocks[blockIndex(x - cx * CHUNK_SIZE, y, z - cz * CHUNK_SIZE)];
  }

  isLoadedAt(x: number, z: number): boolean {
    return this.chunks.has(chunkKey(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)));
  }

  /** Cambia un bloque, lo anota como edición y remalla lo necesario. */
  setBlock(x: number, y: number, z: number, id: number): boolean {
    if (y < 0 || y >= CHUNK_HEIGHT || !isValidBlockId(id)) return false;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const key = chunkKey(cx, cz);
    const chunk = this.chunks.get(key);
    if (!chunk) return false;
    const lx = x - cx * CHUNK_SIZE;
    const lz = z - cz * CHUNK_SIZE;
    const i = blockIndex(lx, y, lz);
    const old = chunk.blocks[i];
    if (old === id) return false;
    chunk.blocks[i] = id;

    let edits = this.edits.get(key);
    if (!edits) {
      edits = new Map();
      this.edits.set(key, edits);
    }
    edits.set(i, id);

    if (BLOCKS[old].light > 0) chunk.lights.delete(i);
    if (BLOCKS[id].light > 0) chunk.lights.add(i);
    if (IS_OPAQUE[old] !== IS_OPAQUE[id]) chunk.updateColumn(lx, lz);

    const lightChanged = BLOCKS[old].light > 0 || BLOCKS[id].light > 0;
    const opacityChanged = IS_OPAQUE[old] !== IS_OPAQUE[id];
    const immediate: Chunk[] = [chunk];
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dz === 0) continue;
        const n = this.getChunk(cx + dx, cz + dz);
        if (!n) continue;
        const touchesX = dx === 0 || (dx === -1 ? lx === 0 : lx === CHUNK_SIZE - 1);
        const touchesZ = dz === 0 || (dz === -1 ? lz === 0 : lz === CHUNK_SIZE - 1);
        if (touchesX && touchesZ) immediate.push(n);
        else if (lightChanged || (opacityChanged && this.hasLightsNear(cx, cz))) n.dirty = true;
      }
    }
    for (const c of immediate) this.remesh(c);
    return true;
  }

  private hasLightsNear(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.getChunk(cx + dx, cz + dz);
        if (c && c.lights.size > 0) return true;
      }
    }
    return false;
  }

  /** Y del bloque sólido más alto de una columna cargada, o -1. */
  topSolidY(x: number, z: number): number {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    if (!chunk) return -1;
    const col = x - cx * CHUNK_SIZE + (z - cz * CHUNK_SIZE) * CHUNK_SIZE;
    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      if (IS_SOLID[chunk.blocks[col + y * CHUNK_AREA]]) return y;
    }
    return -1;
  }

  /** Luz aproximada en un punto, para iluminar entidades (0..1 cada componente). */
  lightAt(x: number, y: number, z: number): LightSample {
    const bx = Math.floor(x);
    const by = Math.floor(y);
    const bz = Math.floor(z);
    const cx = Math.floor(bx / CHUNK_SIZE);
    const cz = Math.floor(bz / CHUNK_SIZE);
    const chunk = this.getChunk(cx, cz);
    let sky = 1;
    if (chunk) {
      const h = chunk.heightMap[bx - cx * CHUNK_SIZE + (bz - cz * CHUNK_SIZE) * CHUNK_SIZE];
      const depth = h - by;
      sky = by > h ? 1 : depth >= 4 ? 0 : (15 - depth * 4) / 15;
    }
    let block = 0;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const c = this.getChunk(cx + dx, cz + dz);
        if (!c) continue;
        for (const li of c.lights) {
          const lx = c.cx * CHUNK_SIZE + (li % CHUNK_SIZE);
          const lz = c.cz * CHUNK_SIZE + (Math.floor(li / CHUNK_SIZE) % CHUNK_SIZE);
          const ly = Math.floor(li / CHUNK_AREA);
          const d = Math.abs(lx - bx) + Math.abs(ly - by) + Math.abs(lz - bz);
          const level = BLOCKS[c.blocks[li]].light - d;
          if (level > block) block = level;
        }
      }
    }
    return { sky, block: block / 15 };
  }

  private generateChunk(cx: number, cz: number): Chunk {
    const chunk = new Chunk(cx, cz);
    this.generator.generate(cx, cz, chunk.blocks, chunk.biomes);
    const edits = this.edits.get(chunkKey(cx, cz));
    if (edits) {
      for (const [i, id] of edits) chunk.blocks[i] = id;
    }
    chunk.rebuildMetadata();
    this.chunks.set(chunkKey(cx, cz), chunk);
    // Los vecinos ya mallados deben actualizar su borde.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const n = (dx || dz) && this.getChunk(cx + dx, cz + dz);
        if (n) n.dirty = true;
      }
    }
    return chunk;
  }

  private remesh(chunk: Chunk): boolean {
    const ctx: MesherContext = {
      neighbor: (dx, dz) => this.getChunk(chunk.cx + dx, chunk.cz + dz),
      getBlock: (x, y, z) => this.getBlock(x, y, z),
      fancyLeaves: this.fancyLeaves,
    };
    const result = buildChunkMesh(chunk, ctx);
    if (!result) return false;
    chunk.opaqueMesh = this.applyMesh(chunk, chunk.opaqueMesh, result.opaque, this.materials.opaque, 0);
    chunk.waterMesh = this.applyMesh(chunk, chunk.waterMesh, result.water, this.materials.water, 1);
    chunk.dirty = false;
    return true;
  }

  private applyMesh(chunk: Chunk, mesh: THREE.Mesh | null, data: MeshData | null, material: THREE.Material, order: number): THREE.Mesh | null {
    if (!data) {
      if (mesh) {
        mesh.geometry.dispose();
        this.group.remove(mesh);
      }
      return null;
    }
    const geometry = toGeometry(data);
    if (mesh) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
      return mesh;
    }
    const created = new THREE.Mesh(geometry, material);
    created.position.set(chunk.cx * CHUNK_SIZE, 0, chunk.cz * CHUNK_SIZE);
    created.matrixAutoUpdate = false;
    created.updateMatrix();
    created.renderOrder = order;
    this.group.add(created);
    return created;
  }

  private disposeChunk(chunk: Chunk): void {
    for (const mesh of [chunk.opaqueMesh, chunk.waterMesh]) {
      if (mesh) {
        mesh.geometry.dispose();
        this.group.remove(mesh);
      }
    }
    chunk.opaqueMesh = null;
    chunk.waterMesh = null;
  }

  private hasAllNeighbors(cx: number, cz: number): boolean {
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (!this.chunks.has(chunkKey(cx + dx, cz + dz))) return false;
      }
    }
    return true;
  }

  /**
   * Genera, malla y descarga chunks alrededor del jugador respetando un presupuesto de tiempo.
   * Devuelve cuántos chunks quedan pendientes dentro del radio visible.
   */
  update(px: number, pz: number, budgetMs: number): number {
    const start = performance.now();
    const ccx = Math.floor(px / CHUNK_SIZE);
    const ccz = Math.floor(pz / CHUNK_SIZE);
    const r = this.renderDistance;
    const meshR2 = r * r + 1;
    const scanR2 = 2 * (r + 2) * (r + 2);
    let pending = 0;

    for (const [dx, dz] of this.spiral) {
      const d2 = dx * dx + dz * dz;
      if (d2 > scanR2) break;
      if (!inGenRange(dx, dz, meshR2)) continue;
      const cx = ccx + dx;
      const cz = ccz + dz;
      if (!this.chunks.has(chunkKey(cx, cz))) {
        if (performance.now() - start < budgetMs) this.generateChunk(cx, cz);
        else pending++;
      }
    }

    for (const [dx, dz] of this.spiral) {
      const d2 = dx * dx + dz * dz;
      if (d2 > meshR2) break;
      const chunk = this.getChunk(ccx + dx, ccz + dz);
      if (!chunk) {
        pending++;
        continue;
      }
      if (!chunk.dirty) continue;
      if (!this.hasAllNeighbors(chunk.cx, chunk.cz)) {
        pending++;
        continue;
      }
      if (performance.now() - start < budgetMs * 2) this.remesh(chunk);
      else pending++;
    }

    const unloadR = r + 3;
    for (const [key, chunk] of this.chunks) {
      const dx = chunk.cx - ccx;
      const dz = chunk.cz - ccz;
      if (dx * dx + dz * dz > unloadR * unloadR) {
        this.disposeChunk(chunk);
        this.chunks.delete(key);
      } else if (chunk.opaqueMesh || chunk.waterMesh) {
        // Ocultar lo que queda fuera del radio visible (p. ej. tras reducir la distancia).
        const visible = dx * dx + dz * dz <= meshR2;
        if (chunk.opaqueMesh) chunk.opaqueMesh.visible = visible;
        if (chunk.waterMesh) chunk.waterMesh.visible = visible;
      }
    }
    return pending;
  }

  /** Carga inicial con barra de progreso; cede el hilo entre lotes para no congelar la página. */
  async preload(px: number, pz: number, onProgress: (fraction: number) => void): Promise<void> {
    const r = Math.min(this.renderDistance, 4);
    const meshR2 = r * r + 1;
    let total = 0;
    for (const [dx, dz] of this.spiral) {
      if (inGenRange(dx, dz, meshR2)) total++;
      if (dx * dx + dz * dz <= meshR2) total++;
    }
    const saved = this.renderDistance;
    this.renderDistance = r;
    try {
      for (;;) {
        const pending = this.update(px, pz, 24);
        onProgress(Math.min(1, 1 - pending / total));
        if (pending === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } finally {
      this.renderDistance = saved;
    }
    onProgress(1);
  }

  /** Fuerza el remallado de todo (tras cambiar la calidad de las hojas). */
  markAllDirty(): void {
    for (const chunk of this.chunks.values()) chunk.dirty = true;
  }

  serializeEdits(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [key, map] of this.edits) {
      if (map.size === 0) continue;
      const arr: number[] = [];
      for (const [i, id] of map) arr.push(i, id);
      out[key] = arr;
    }
    return out;
  }

  loadEdits(data: Record<string, number[]>): void {
    this.edits.clear();
    for (const [key, arr] of Object.entries(data)) {
      if (!/^-?\d+,-?\d+$/.test(key) || !Array.isArray(arr)) continue;
      const map = new Map<number, number>();
      for (let k = 0; k + 1 < arr.length; k += 2) {
        const i = arr[k];
        const id = arr[k + 1];
        if (Number.isInteger(i) && i >= 0 && i < CHUNK_AREA * CHUNK_HEIGHT && isValidBlockId(id)) map.set(i, id);
      }
      if (map.size) this.edits.set(key, map);
    }
  }

  dispose(): void {
    for (const chunk of this.chunks.values()) this.disposeChunk(chunk);
    this.chunks.clear();
  }
}
