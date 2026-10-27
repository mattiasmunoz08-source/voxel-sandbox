import * as THREE from 'three';
import { blockDef } from '../world/blocks';
import { tileUV } from './atlasLayout';

/** Cubo pequeño con las caras del atlas de un bloque (objeto en mano y objetos tirados). */
export function blockCubeGeometry(blockId: number, size: number): THREE.BufferGeometry {
  const def = blockDef(blockId);
  const geo = new THREE.BoxGeometry(size, size, size);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  // Orden de caras de BoxGeometry: +x, -x, +y, -y, +z, -z (4 vértices cada una).
  const tiles = [def.tex[2], def.tex[2], def.tex[0], def.tex[1], def.tex[2], def.tex[3] ?? def.tex[2]];
  for (let f = 0; f < 6; f++) {
    const [u0, v0, u1, v1] = tileUV(tiles[f]);
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
    }
  }
  uv.needsUpdate = true;
  return geo;
}
