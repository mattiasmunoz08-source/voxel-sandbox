import { B, IS_SOLID } from '../world/blocks';

export interface BlockReader {
  getBlock(x: number, y: number, z: number): number;
}

const EPS = 1e-4;
const MAX_STEP = 0.45;

/** Caja alineada con los ejes que se mueve por la cuadrícula chocando con los bloques sólidos. */
export class Body {
  x = 0;
  y = 0;
  z = 0;
  vx = 0;
  vy = 0;
  vz = 0;
  onGround = false;
  inWater = false;
  headInWater = false;
  /** Chocó lateralmente en el último paso (los enemigos lo usan para saltar). */
  hitWall = false;

  constructor(public width: number, public height: number) {}

  collides(world: BlockReader, x: number, y: number, z: number): boolean {
    const hw = this.width / 2;
    const x0 = Math.floor(x - hw), x1 = Math.floor(x + hw - 1e-7);
    const y0 = Math.floor(y), y1 = Math.floor(y + this.height - 1e-7);
    const z0 = Math.floor(z - hw), z1 = Math.floor(z + hw - 1e-7);
    for (let by = y0; by <= y1; by++) {
      for (let bz = z0; bz <= z1; bz++) {
        for (let bx = x0; bx <= x1; bx++) {
          if (IS_SOLID[world.getBlock(bx, by, bz)]) return true;
        }
      }
    }
    return false;
  }

  /** ¿Hay suelo bajo la caja si estuviera en (x, z)? Se usa para no caer al ir agachado. */
  private hasSupport(world: BlockReader, x: number, z: number): boolean {
    const hw = this.width / 2;
    const by = Math.floor(this.y - 0.05);
    for (let bz = Math.floor(z - hw); bz <= Math.floor(z + hw - 1e-7); bz++) {
      for (let bx = Math.floor(x - hw); bx <= Math.floor(x + hw - 1e-7); bx++) {
        if (IS_SOLID[world.getBlock(bx, by, bz)]) return true;
      }
    }
    return false;
  }

  updateWater(world: BlockReader): void {
    const feet = world.getBlock(Math.floor(this.x), Math.floor(this.y + 0.2), Math.floor(this.z));
    const waist = world.getBlock(Math.floor(this.x), Math.floor(this.y + this.height * 0.5), Math.floor(this.z));
    const head = world.getBlock(Math.floor(this.x), Math.floor(this.y + this.height * 0.9), Math.floor(this.z));
    this.inWater = feet === B.WATER || waist === B.WATER;
    this.headInWater = head === B.WATER;
  }

  /** Avanza la posición según la velocidad, resolviendo choques eje por eje. */
  move(world: BlockReader, dt: number, sneak = false): void {
    const wasOnGround = this.onGround;
    this.hitWall = false;
    this.moveAxis(world, 1, this.vy * dt);
    this.moveAxis(world, 0, this.vx * dt, sneak && wasOnGround);
    this.moveAxis(world, 2, this.vz * dt, sneak && wasOnGround);
  }

  private moveAxis(world: BlockReader, axis: 0 | 1 | 2, delta: number, sneak = false): void {
    if (delta === 0) {
      if (axis === 1) this.onGround = this.collides(world, this.x, this.y - 0.01, this.z);
      return;
    }
    if (axis === 1) this.onGround = false;
    const steps = Math.ceil(Math.abs(delta) / MAX_STEP);
    const step = delta / steps;
    const hw = this.width / 2;
    for (let s = 0; s < steps; s++) {
      const nx = axis === 0 ? this.x + step : this.x;
      const ny = axis === 1 ? this.y + step : this.y;
      const nz = axis === 2 ? this.z + step : this.z;
      if (sneak && !this.hasSupport(world, nx, nz)) {
        if (axis === 0) this.vx = 0; else this.vz = 0;
        return;
      }
      if (!this.collides(world, nx, ny, nz)) {
        this.x = nx; this.y = ny; this.z = nz;
        continue;
      }
      if (axis === 0) {
        this.x = step > 0 ? Math.floor(nx + hw) - hw - EPS : Math.floor(nx - hw) + 1 + hw + EPS;
        this.vx = 0;
        this.hitWall = true;
      } else if (axis === 2) {
        this.z = step > 0 ? Math.floor(nz + hw) - hw - EPS : Math.floor(nz - hw) + 1 + hw + EPS;
        this.vz = 0;
        this.hitWall = true;
      } else {
        if (step < 0) {
          this.y = Math.floor(ny) + 1;
          this.onGround = true;
        } else {
          this.y = Math.floor(ny + this.height) - this.height - EPS;
        }
        this.vy = 0;
      }
      return;
    }
  }

  intersectsBlock(bx: number, by: number, bz: number): boolean {
    const hw = this.width / 2;
    return (
      this.x + hw > bx && this.x - hw < bx + 1 &&
      this.y + this.height > by && this.y < by + 1 &&
      this.z + hw > bz && this.z - hw < bz + 1
    );
  }
}
