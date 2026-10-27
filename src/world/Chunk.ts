import type { Mesh } from 'three';
import { IS_OPAQUE, blockDef } from './blocks';
import { CHUNK_AREA, CHUNK_HEIGHT, CHUNK_SIZE, CHUNK_VOLUME } from './constants';

export class Chunk {
  readonly blocks = new Uint8Array(CHUNK_VOLUME);
  readonly biomes = new Uint8Array(CHUNK_AREA);
  /** Altura del bloque opaco más alto de cada columna (-1 si no hay ninguno). */
  readonly heightMap = new Int16Array(CHUNK_AREA);
  /** Índices locales de los bloques que emiten luz. */
  readonly lights = new Set<number>();
  opaqueMesh: Mesh | null = null;
  waterMesh: Mesh | null = null;
  dirty = true;

  constructor(readonly cx: number, readonly cz: number) {}

  /** Recalcula el mapa de alturas y la lista de luces tras generar o cargar los datos. */
  rebuildMetadata(): void {
    this.lights.clear();
    for (let i = 0; i < CHUNK_VOLUME; i++) {
      const id = this.blocks[i];
      if (id !== 0 && blockDef(id).light > 0) this.lights.add(i);
    }
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) this.updateColumn(x, z);
    }
  }

  updateColumn(x: number, z: number): void {
    const col = x + z * CHUNK_SIZE;
    let y = CHUNK_HEIGHT - 1;
    while (y >= 0 && !IS_OPAQUE[this.blocks[col + y * CHUNK_AREA]]) y--;
    this.heightMap[col] = y;
  }
}
