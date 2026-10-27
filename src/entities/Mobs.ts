import * as THREE from 'three';
import { rayAabb } from '../player/raycast';
import { B, IS_SOLID } from '../world/blocks';
import type { World } from '../world/World';
import { Body } from './physics';

const MAX_MOBS = 6;
const MOB_HEALTH = 16;
const SPEED = 3.1;

interface MobParts {
  root: THREE.Group;
  model: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  tinted: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[];
  disposables: (THREE.BufferGeometry | THREE.Material)[];
}

/** «Rondador»: criatura nocturna de cuerpo violeta oscuro y ojos turquesa. Modelo hecho con cajas. */
function buildModel(): MobParts {
  const disposables: (THREE.BufferGeometry | THREE.Material)[] = [];
  const tinted: MobParts['tinted'] = [];
  const mat = (hex: number, lit = true) => {
    const m = new THREE.MeshBasicMaterial({ color: hex });
    disposables.push(m);
    if (lit) tinted.push({ mat: m, base: new THREE.Color(hex) });
    return m;
  };
  const box = (w: number, h: number, d: number, m: THREE.Material) => {
    const g = new THREE.BoxGeometry(w, h, d);
    disposables.push(g);
    return new THREE.Mesh(g, m);
  };
  const bodyMat = mat(0x3b2d52);
  const darkMat = mat(0x251c34);
  const bandMat = mat(0x5a4478);
  const eyeMat = mat(0x6ff7e6, false);

  const root = new THREE.Group();
  const model = new THREE.Group();
  root.add(model);

  const torso = box(0.62, 0.72, 0.36, bodyMat);
  torso.position.y = 1.08;
  const band = box(0.64, 0.12, 0.38, bandMat);
  band.position.y = 0.88;
  const head = box(0.52, 0.48, 0.5, darkMat);
  head.position.y = 1.7;
  const eyeL = box(0.12, 0.07, 0.02, eyeMat);
  eyeL.position.set(-0.12, 1.72, 0.26);
  const eyeR = eyeL.clone();
  eyeR.position.x = 0.12;
  // Cresta superior que distingue la silueta.
  const crest = box(0.12, 0.16, 0.42, bandMat);
  crest.position.y = 2.0;
  model.add(torso, band, head, eyeL, eyeR, crest);

  const limb = (w: number, h: number, m: THREE.Material, x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const mesh = box(w, h, w, m);
    mesh.position.y = -h / 2;
    pivot.add(mesh);
    model.add(pivot);
    return pivot;
  };
  const legL = limb(0.24, 0.74, darkMat, -0.15, 0.74);
  const legR = limb(0.24, 0.74, darkMat, 0.15, 0.74);
  const armL = limb(0.18, 0.8, bodyMat, -0.42, 1.42);
  const armR = limb(0.18, 0.8, bodyMat, 0.42, 1.42);
  return { root, model, legL, legR, armL, armR, tinted, disposables };
}

export class Mob {
  readonly body = new Body(0.6, 1.9);
  readonly parts = buildModel();
  health = MOB_HEALTH;
  yaw = 0;
  attackCooldown = 0;
  hurtFlash = 0;
  dying = 0;
  walkPhase = 0;
  wanderTimer = 0;
  wanderYaw = 0;
  wandering = false;
  burnTimer = 0;
  growlTimer = 4 + Math.random() * 8;

  get dead(): boolean {
    return this.health <= 0;
  }
}

export interface MobHost {
  world: World;
  player: {
    x: number; y: number; z: number; dead: boolean;
    damage(amount: number, cause: string): boolean;
    knockback(fromX: number, fromZ: number, strength: number): void;
  };
  daylight: number;
  night: number;
  onMobKilled(mob: Mob): void;
  onPlayerHit(): void;
  onGrowl(distance: number): void;
  smoke(x: number, y: number, z: number): void;
}

export class MobManager {
  readonly group = new THREE.Group();
  readonly mobs: Mob[] = [];
  private spawnTimer = 0;

  update(dt: number, host: MobHost): void {
    this.trySpawn(dt, host);
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const mob = this.mobs[i];
      const dx = host.player.x - mob.body.x;
      const dz = host.player.z - mob.body.z;
      if (dx * dx + dz * dz > 80 * 80 || mob.body.y < -10) {
        this.remove(i);
        continue;
      }
      if (mob.dead) {
        mob.dying += dt;
        mob.parts.model.rotation.x = Math.min(Math.PI / 2, mob.dying * 5);
        mob.parts.root.position.set(mob.body.x, mob.body.y, mob.body.z);
        if (mob.dying > 0.6) {
          host.onMobKilled(mob);
          this.remove(i);
        }
        continue;
      }
      if (!host.world.isLoadedAt(mob.body.x, mob.body.z)) continue;
      this.think(mob, dt, host);
    }
  }

  private trySpawn(dt: number, host: MobHost): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0 || host.night < 0.6 || this.mobs.length >= MAX_MOBS || host.player.dead) return;
    this.spawnTimer = 2.5;
    const w = host.world;
    for (let attempt = 0; attempt < 6; attempt++) {
      const a = Math.random() * Math.PI * 2;
      const d = 16 + Math.random() * 18;
      const x = Math.floor(host.player.x + Math.cos(a) * d);
      const z = Math.floor(host.player.z + Math.sin(a) * d);
      const top = w.topSolidY(x, z);
      if (top < 1) continue;
      const ground = w.getBlock(x, top, z);
      if (ground === B.LEAVES || ground === B.CACTUS) continue;
      if (IS_SOLID[w.getBlock(x, top + 1, z)] || IS_SOLID[w.getBlock(x, top + 2, z)]) continue;
      if (w.getBlock(x, top + 1, z) === B.WATER) continue;
      // Las antorchas protegen: no aparecen en zonas iluminadas.
      if (w.lightAt(x + 0.5, top + 1, z + 0.5).block > 0.45) continue;
      const mob = new Mob();
      mob.body.x = x + 0.5;
      mob.body.y = top + 1;
      mob.body.z = z + 0.5;
      mob.yaw = Math.random() * Math.PI * 2;
      this.mobs.push(mob);
      this.group.add(mob.parts.root);
      return;
    }
  }

  private think(mob: Mob, dt: number, host: MobHost): void {
    const b = mob.body;
    const p = host.player;
    b.updateWater(host.world);
    mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
    mob.hurtFlash = Math.max(0, mob.hurtFlash - dt);

    const dx = p.x - b.x;
    const dz = p.z - b.z;
    const dist = Math.hypot(dx, dz);
    let moveX = 0;
    let moveZ = 0;
    const chasing = !p.dead && dist < 26 && Math.abs(p.y - b.y) < 12;
    if (chasing) {
      mob.yaw = Math.atan2(dx, dz);
      if (dist > 0.9) {
        moveX = (dx / dist) * SPEED;
        moveZ = (dz / dist) * SPEED;
      }
    } else {
      const m = mob;
      m.wanderTimer -= dt;
      if (m.wanderTimer <= 0) {
        m.wanderTimer = 2 + Math.random() * 4;
        m.wandering = Math.random() < 0.6;
        m.wanderYaw = Math.random() * Math.PI * 2;
      }
      if (m.wandering) {
        mob.yaw = m.wanderYaw;
        moveX = Math.sin(m.wanderYaw) * SPEED * 0.4;
        moveZ = Math.cos(m.wanderYaw) * SPEED * 0.4;
      }
    }

    const blend = Math.min(1, (b.onGround ? 10 : 2) * dt);
    b.vx += (moveX - b.vx) * blend;
    b.vz += (moveZ - b.vz) * blend;
    if (b.inWater) {
      b.vy = Math.min(b.vy + 20 * dt, 2.5);
    } else {
      b.vy -= 27 * dt;
      if (b.hitWall && b.onGround && (moveX || moveZ)) b.vy = 8.2;
    }
    b.move(host.world, dt);

    // Ataque cuerpo a cuerpo.
    if (chasing && dist < 1.25 && Math.abs(p.y - b.y) < 1.6 && mob.attackCooldown === 0) {
      mob.attackCooldown = 1.1;
      if (p.damage(3, 'rondador')) {
        p.knockback(b.x, b.z, 5.5);
        host.onPlayerHit();
      }
    }

    // De día, expuestos al cielo, se deshacen poco a poco.
    const st = mob;
    const exposed = host.world.lightAt(b.x, b.y + 1.9, b.z).sky > 0.9;
    if (host.daylight > 0.62 && exposed) {
      st.burnTimer += dt;
      if (st.burnTimer > 0.7) {
        st.burnTimer = 0;
        this.hurt(mob, 2, 0, 0, 0);
        host.smoke(b.x, b.y + 1.2, b.z);
      }
    }

    st.growlTimer -= dt;
    if (st.growlTimer <= 0) {
      st.growlTimer = 6 + Math.random() * 10;
      if (dist < 20) host.onGrowl(dist);
    }

    // Animación y color según la luz del lugar.
    const speed = Math.hypot(b.vx, b.vz);
    st.walkPhase += speed * dt * 3.2;
    const swing = Math.sin(st.walkPhase) * Math.min(1, speed / 2) * 0.7;
    const parts = mob.parts;
    parts.legL.rotation.x = swing;
    parts.legR.rotation.x = -swing;
    parts.armL.rotation.x = -swing * 0.8 - (chasing ? 0.5 : 0);
    parts.armR.rotation.x = swing * 0.8 - (chasing ? 0.5 : 0);
    parts.root.position.set(b.x, b.y, b.z);
    parts.root.rotation.y = mob.yaw;
    const light = host.world.lightAt(b.x, b.y + 1, b.z);
    const l = Math.max(light.sky * host.daylight, light.block, 0.18);
    const k = 0.35 + 0.75 * l;
    for (const t of parts.tinted) {
      t.mat.color.copy(t.base).multiplyScalar(k);
      if (mob.hurtFlash > 0) t.mat.color.lerp(new THREE.Color(0.9, 0.15, 0.15), 0.6);
    }
  }

  /** Daño con retroceso. Devuelve true si el golpe lo mató. */
  hurt(mob: Mob, amount: number, fromX: number, fromZ: number, knock: number): boolean {
    if (mob.dead) return false;
    mob.health -= amount;
    mob.hurtFlash = 0.25;
    if (knock > 0) {
      const dx = mob.body.x - fromX;
      const dz = mob.body.z - fromZ;
      const len = Math.hypot(dx, dz) || 1;
      mob.body.vx = (dx / len) * knock;
      mob.body.vz = (dz / len) * knock;
      mob.body.vy = 5;
    }
    return mob.dead;
  }

  /** Enemigo bajo la mira (más cercano que `maxDist`). */
  pick(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): { mob: Mob; distance: number } | null {
    let best: { mob: Mob; distance: number } | null = null;
    for (const mob of this.mobs) {
      if (mob.dead) continue;
      const b = mob.body;
      const hw = b.width / 2 + 0.1;
      const t = rayAabb(ox, oy, oz, dx, dy, dz, b.x - hw, b.y, b.z - hw, b.x + hw, b.y + b.height + 0.15, b.z + hw);
      if (t !== null && t <= maxDist && (!best || t < best.distance)) best = { mob, distance: t };
    }
    return best;
  }

  /** ¿Algún enemigo ocupa ese bloque? Evita colocar bloques dentro de ellos. */
  occupies(bx: number, by: number, bz: number): boolean {
    return this.mobs.some((m) => !m.dead && m.body.intersectsBlock(bx, by, bz));
  }

  private remove(i: number): void {
    const mob = this.mobs[i];
    this.group.remove(mob.parts.root);
    for (const d of mob.parts.disposables) d.dispose();
    this.mobs.splice(i, 1);
  }

  clear(): void {
    while (this.mobs.length) this.remove(this.mobs.length - 1);
  }
}
