import { ATLAS_TILES } from './tiles';

export type UVRect = [number, number, number, number];

const EPS = 0.0002;
const rects: UVRect[] = [];
for (let tile = 0; tile < ATLAS_TILES * ATLAS_TILES; tile++) {
  const col = tile % ATLAS_TILES;
  const row = Math.floor(tile / ATLAS_TILES);
  rects.push([
    col / ATLAS_TILES + EPS,
    1 - (row + 1) / ATLAS_TILES + EPS,
    (col + 1) / ATLAS_TILES - EPS,
    1 - row / ATLAS_TILES - EPS,
  ]);
}

/** Rectángulo UV (u0, v0, u1, v1) de una casilla del atlas; v crece hacia arriba. */
export function tileUV(tile: number): UVRect {
  return rects[tile];
}
