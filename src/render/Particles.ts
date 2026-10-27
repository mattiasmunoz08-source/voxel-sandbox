import * as THREE from 'three';
import type { BlockReader } from '../entities/physics';
import { IS_SOLID } from '../world/blocks';

const MAX = 400;

/** Fragmentos cuadrados que saltan al romper bloques o golpear enemigos. Un solo búfer reutilizado. */
export class Particles {
  readonly points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private col = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private next = 0;
  private geo: THREE.BufferGeometry;

  constructor() {
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const mat = new THREE.PointsMaterial({ size: 0.11, vertexColors: true, sizeAttenuation: true, fog: false });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX; i++) this.pos[i * 3 + 1] = -1000;
  }

  /** `colors`: muestra de colores del bloque (0..1) de la que se elige al azar. */
  burst(x: number, y: number, z: number, colors: [number, number, number][], count: number, brightness: number, speed = 3): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX;
      this.pos[i * 3] = x + (Math.random() - 0.5) * 0.7;
      this.pos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.7;
      this.pos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.7;
      this.vel[i * 3] = (Math.random() - 0.5) * speed;
      this.vel[i * 3 + 1] = Math.random() * speed * 0.9 + 1;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * speed;
      const c = colors[Math.floor(Math.random() * colors.length)] ?? [1, 1, 1];
      this.col[i * 3] = c[0] * brightness;
      this.col[i * 3 + 1] = c[1] * brightness;
      this.col[i * 3 + 2] = c[2] * brightness;
      this.life[i] = 0.5 + Math.random() * 0.5;
    }
  }

  update(dt: number, world: BlockReader): void {
    let any = false;
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      any = true;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -1000;
        continue;
      }
      this.vel[i * 3 + 1] -= 18 * dt;
      const nx = this.pos[i * 3] + this.vel[i * 3] * dt;
      const ny = this.pos[i * 3 + 1] + this.vel[i * 3 + 1] * dt;
      const nz = this.pos[i * 3 + 2] + this.vel[i * 3 + 2] * dt;
      if (IS_SOLID[world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz))]) {
        this.vel[i * 3] *= 0.3;
        this.vel[i * 3 + 1] = 0;
        this.vel[i * 3 + 2] *= 0.3;
      } else {
        this.pos[i * 3] = nx;
        this.pos[i * 3 + 1] = ny;
        this.pos[i * 3 + 2] = nz;
      }
    }
    if (any) {
      this.geo.attributes.position.needsUpdate = true;
      this.geo.attributes.color.needsUpdate = true;
    }
  }

  dispose(): void {
    this.geo.dispose();
    (this.points.material as THREE.Material).dispose();
  }
}
