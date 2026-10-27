export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 96;
export const SEA_LEVEL = 32;
export const CHUNK_AREA = CHUNK_SIZE * CHUNK_SIZE;
export const CHUNK_VOLUME = CHUNK_AREA * CHUNK_HEIGHT;

/** Índice lineal dentro de un chunk: x y z locales, y en vertical. */
export function blockIndex(x: number, y: number, z: number): number {
  return x + z * CHUNK_SIZE + y * CHUNK_AREA;
}

export function chunkKey(cx: number, cz: number): string {
  return cx + ',' + cz;
}
