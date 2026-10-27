import * as THREE from 'three';
import { tileUV } from './atlasLayout';
import { CRACK_STAGES, Tile } from './tiles';

/** Contorno del bloque apuntado y grietas mientras se rompe. */
export class Selection {
  readonly group = new THREE.Group();
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh;
  private crackGeos: THREE.BufferGeometry[] = [];
  private stage = -1;

  constructor(atlas: THREE.Texture) {
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
    this.outline = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, fog: false }),
    );
    this.group.add(this.outline);

    for (let s = 0; s < CRACK_STAGES; s++) {
      const geo = new THREE.BoxGeometry(1.008, 1.008, 1.008);
      const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
      const [u0, v0, u1, v1] = tileUV(Tile.CRACK_0 + s);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * (u1 - u0), v0 + uv.getY(i) * (v1 - v0));
      this.crackGeos.push(geo);
    }
    this.crack = new THREE.Mesh(
      this.crackGeos[0],
      new THREE.MeshBasicMaterial({
        map: atlas,
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        fog: false,
      }),
    );
    this.crack.visible = false;
    this.group.add(this.crack);
    this.group.visible = false;
  }

  show(x: number, y: number, z: number): void {
    this.group.visible = true;
    this.group.position.set(x + 0.5, y + 0.5, z + 0.5);
  }

  hide(): void {
    this.group.visible = false;
    this.setProgress(0);
  }

  /** 0..1: fracción de rotura del bloque. */
  setProgress(p: number): void {
    if (p <= 0) {
      this.crack.visible = false;
      this.stage = -1;
      return;
    }
    const stage = Math.min(CRACK_STAGES - 1, Math.floor(p * CRACK_STAGES));
    if (stage !== this.stage) {
      this.stage = stage;
      this.crack.geometry = this.crackGeos[stage];
    }
    this.crack.visible = true;
  }

  dispose(): void {
    this.outline.geometry.dispose();
    (this.outline.material as THREE.Material).dispose();
    for (const g of this.crackGeos) g.dispose();
    (this.crack.material as THREE.Material).dispose();
  }
}
