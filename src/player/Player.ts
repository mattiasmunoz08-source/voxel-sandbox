import { Body, type BlockReader } from '../entities/physics';
import type { Input } from './Input';

export const MAX_HEALTH = 20;
export const MAX_HUNGER = 20;

const GRAVITY = 27;
const JUMP_SPEED = 8.4;
const WALK = 4.3;
const SPRINT = 5.9;
const SNEAK = 1.6;
const SWIM = 2.4;
const STAND_HEIGHT = 1.8;
const SNEAK_HEIGHT = 1.5;

export interface PlayerEvents {
  onDamage(amount: number, cause: string): void;
  onDeath(cause: string): void;
  onStep(): void;
  onSplash(): void;
}

export class Player {
  readonly body = new Body(0.6, STAND_HEIGHT);
  yaw = 0;
  pitch = 0;
  health = MAX_HEALTH;
  hunger = MAX_HUNGER;
  /** Cansancio acumulado: cada 4 puntos se pierde 1 de hambre. */
  exhaustion = 0;
  xp = 0;
  sprinting = false;
  sneaking = false;
  dead = false;
  spawn = { x: 0.5, y: 64, z: 0.5 };
  /** Tiempo de invulnerabilidad tras recibir un golpe. */
  hurtCooldown = 0;

  private fallPeak: number | null = null;
  private regenTimer = 0;
  private starveTimer = 0;
  private stepDistance = 0;
  private wasInWater = false;

  constructor(private events: PlayerEvents) {}

  get eyeHeight(): number {
    return this.sneaking ? 1.27 : 1.62;
  }

  get x(): number { return this.body.x; }
  get y(): number { return this.body.y; }
  get z(): number { return this.body.z; }

  setPosition(x: number, y: number, z: number): void {
    this.body.x = x;
    this.body.y = y;
    this.body.z = z;
    this.body.vx = this.body.vy = this.body.vz = 0;
    this.fallPeak = null;
  }

  look(dx: number, dy: number, sensitivity: number, invertY: boolean): void {
    const k = 0.0022 * sensitivity;
    this.yaw -= dx * k;
    this.pitch -= dy * k * (invertY ? -1 : 1);
    const limit = Math.PI / 2 - 0.01;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));
  }

  /** Vector unitario hacia donde mira la cámara. */
  lookDirection(): [number, number, number] {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  update(dt: number, input: Input | null, world: BlockReader): void {
    if (this.dead) return;
    const b = this.body;
    this.hurtCooldown = Math.max(0, this.hurtCooldown - dt);
    b.updateWater(world);

    const axes = input ? input.moveAxes() : { x: 0, z: 0 };
    const wantsSneak = !!input?.sneak && !b.inWater;
    if (wantsSneak !== this.sneaking) {
      if (wantsSneak) {
        this.sneaking = true;
        b.height = SNEAK_HEIGHT;
      } else {
        // Sólo se levanta si hay sitio para la cabeza.
        b.height = STAND_HEIGHT;
        if (b.collides(world, b.x, b.y, b.z)) b.height = SNEAK_HEIGHT;
        else this.sneaking = false;
      }
    }
    this.sprinting = !!input?.sprint && axes.z > 0 && !this.sneaking && this.hunger > 6;

    const speed = b.inWater ? SWIM : this.sneaking ? SNEAK : this.sprinting ? SPRINT : WALK;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const wishX = (-sin * axes.z + cos * axes.x) * speed;
    const wishZ = (-cos * axes.z - sin * axes.x) * speed;
    const accel = b.onGround ? 14 : b.inWater ? 5 : 3;
    const blend = Math.min(1, accel * dt);
    b.vx += (wishX - b.vx) * blend;
    b.vz += (wishZ - b.vz) * blend;

    if (b.inWater) {
      b.vy -= GRAVITY * 0.25 * dt;
      b.vy *= Math.max(0, 1 - 2.5 * dt);
      if (input?.jump) b.vy = Math.min(b.vy + 22 * dt, 3.2);
      if (input?.jump && b.hitWall) b.vy = 5.5; // salir del agua trepando a la orilla
    } else {
      b.vy -= GRAVITY * dt;
      if (input?.jump && b.onGround) {
        b.vy = JUMP_SPEED;
        this.addExhaustion(this.sprinting ? 0.2 : 0.05);
      }
    }
    b.vy = Math.max(b.vy, -55);

    const prevX = b.x;
    const prevZ = b.z;
    b.move(world, dt, this.sneaking);
    b.updateWater(world);

    // Daño por caída: se mide desde el punto más alto alcanzado en el aire.
    if (b.inWater) this.fallPeak = null;
    else if (!b.onGround) this.fallPeak = this.fallPeak === null ? b.y : Math.max(this.fallPeak, b.y);
    else if (this.fallPeak !== null) {
      const fall = this.fallPeak - b.y;
      this.fallPeak = null;
      if (fall > 3.4) this.damage(Math.floor(fall - 3), 'caída', true);
    }
    if (b.inWater && !this.wasInWater && b.vy < -4) this.events.onSplash();
    this.wasInWater = b.inWater;

    const moved = Math.hypot(b.x - prevX, b.z - prevZ);
    this.addExhaustion(moved * (this.sprinting ? 0.1 : b.inWater ? 0.015 : 0.01));
    if (b.onGround && moved > 0) {
      this.stepDistance += moved;
      if (this.stepDistance > (this.sprinting ? 2.3 : 1.9)) {
        this.stepDistance = 0;
        if (!this.sneaking) this.events.onStep();
      }
    }

    this.tickSurvival(dt);
  }

  addExhaustion(amount: number): void {
    this.exhaustion += amount;
    while (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      this.hunger = Math.max(0, this.hunger - 1);
    }
  }

  private tickSurvival(dt: number): void {
    this.addExhaustion(dt * 0.003);
    if (this.hunger >= 16 && this.health < MAX_HEALTH) {
      this.regenTimer += dt;
      if (this.regenTimer >= 3.5) {
        this.regenTimer = 0;
        this.health = Math.min(MAX_HEALTH, this.health + 1);
        this.addExhaustion(1.5);
      }
    } else this.regenTimer = 0;

    if (this.hunger === 0) {
      this.starveTimer += dt;
      if (this.starveTimer >= 4) {
        this.starveTimer = 0;
        this.damage(1, 'hambre', true);
      }
    } else this.starveTimer = 0;
  }

  /** Aplica daño; `ignoreCooldown` para daños ambientales que no deben depender del último golpe. */
  damage(amount: number, cause: string, ignoreCooldown = false): boolean {
    if (this.dead || amount <= 0) return false;
    if (!ignoreCooldown && this.hurtCooldown > 0) return false;
    this.hurtCooldown = 0.5;
    this.health = Math.max(0, this.health - amount);
    this.addExhaustion(0.1);
    this.events.onDamage(amount, cause);
    if (this.health <= 0) {
      this.dead = true;
      this.events.onDeath(cause);
    }
    return true;
  }

  knockback(fromX: number, fromZ: number, strength: number): void {
    const dx = this.body.x - fromX;
    const dz = this.body.z - fromZ;
    const len = Math.hypot(dx, dz) || 1;
    this.body.vx += (dx / len) * strength;
    this.body.vz += (dz / len) * strength;
    this.body.vy = Math.max(this.body.vy, 4.5);
  }

  eat(food: number): void {
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food);
  }

  respawn(): void {
    this.dead = false;
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.exhaustion = 0;
    this.sneaking = false;
    this.body.height = STAND_HEIGHT;
    this.setPosition(this.spawn.x, this.spawn.y, this.spawn.z);
  }

  /** Nivel y progreso de experiencia (cada nivel pide 10 + 5·nivel puntos). */
  xpLevel(): { level: number; progress: number } {
    let level = 0;
    let rest = this.xp;
    while (rest >= 10 + level * 5) {
      rest -= 10 + level * 5;
      level++;
    }
    return { level, progress: rest / (10 + level * 5) };
  }
}
