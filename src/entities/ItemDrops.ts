import * as THREE from 'three';
import type { Inventory, ItemStack } from '../items/Inventory';
import { itemDef } from '../items/items';
import { blockCubeGeometry } from '../render/blockGeometry';
import type { IconSet } from '../render/icons';
import { blockDef } from '../world/blocks';
import type { World } from '../world/World';
import { Body } from './physics';

interface Drop {
  stack: ItemStack;
  body: Body;
  mesh: THREE.Mesh;
  age: number;
  pickupDelay: number;
}

const LIFETIME = 300;

/** Objetos tirados en el mundo: caen, giran y se recogen al acercarse. */
export class ItemDrops {
  readonly group = new THREE.Group();
  private drops: Drop[] = [];
  private spriteTextures = new Map<string, THREE.CanvasTexture>();
  private spriteGeo = new THREE.PlaneGeometry(0.4, 0.4);

  constructor(private atlas: THREE.Texture, private icons: IconSet) {}

  get count(): number {
    return this.drops.length;
  }

  private makeMesh(id: string): THREE.Mesh {
    const def = itemDef(id);
    if (def?.block !== undefined && blockDef(def.block).render === 'cube') {
      return new THREE.Mesh(blockCubeGeometry(def.block, 0.26), new THREE.MeshBasicMaterial({ map: this.atlas, alphaTest: 0.5 }));
    }
    let tex = this.spriteTextures.get(id);
    if (!tex) {
      const canvas = this.icons.canvas16(id);
      tex = new THREE.CanvasTexture(canvas ?? document.createElement('canvas'));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      this.spriteTextures.set(id, tex);
    }
    return new THREE.Mesh(this.spriteGeo, new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide }));
  }

  spawn(x: number, y: number, z: number, stack: ItemStack, velocity?: [number, number, number], pickupDelay = 0.4): void {
    if (stack.count <= 0 || !itemDef(stack.id)) return;
    // Límite de seguridad para no acumular cientos de mallas.
    if (this.drops.length >= 120) this.removeAt(0);
    const body = new Body(0.25, 0.25);
    body.x = x;
    body.y = y;
    body.z = z;
    if (velocity) [body.vx, body.vy, body.vz] = velocity;
    else {
      body.vx = (Math.random() - 0.5) * 2;
      body.vy = 3;
      body.vz = (Math.random() - 0.5) * 2;
    }
    const mesh = this.makeMesh(stack.id);
    this.group.add(mesh);
    this.drops.push({ stack: { ...stack }, body, mesh, age: 0, pickupDelay });
  }

  private removeAt(i: number): void {
    const d = this.drops[i];
    this.group.remove(d.mesh);
    if (d.mesh.geometry !== this.spriteGeo) d.mesh.geometry.dispose();
    (d.mesh.material as THREE.Material).dispose();
    this.drops.splice(i, 1);
  }

  update(
    dt: number,
    world: World,
    player: { x: number; y: number; z: number; dead: boolean },
    inventory: Inventory,
    daylight: number,
    onPickup: (id: string, count: number) => void,
  ): void {
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age += dt;
      if (d.age > LIFETIME) {
        this.removeAt(i);
        continue;
      }
      const b = d.body;
      if (!world.isLoadedAt(b.x, b.z)) continue;
      b.updateWater(world);
      b.vy -= (b.inWater ? 6 : 22) * dt;
      if (b.onGround) {
        b.vx *= Math.max(0, 1 - 8 * dt);
        b.vz *= Math.max(0, 1 - 8 * dt);
      }
      // Imán suave hacia el jugador cuando ya se puede recoger.
      const dx = player.x - b.x;
      const dy = player.y + 0.9 - b.y;
      const dz = player.z - b.z;
      const dist = Math.hypot(dx, dy, dz);
      if (!player.dead && d.age > d.pickupDelay && dist < 2.6) {
        const pull = 9 / Math.max(dist, 0.3);
        b.vx += dx * pull * dt;
        b.vy += dy * pull * dt;
        b.vz += dz * pull * dt;
      }
      b.move(world, dt);
      if (b.y < -20) {
        this.removeAt(i);
        continue;
      }
      if (!player.dead && d.age > d.pickupDelay && dist < 1.2) {
        const left = inventory.add(d.stack.id, d.stack.count, d.stack.durability);
        const taken = d.stack.count - left;
        if (taken > 0) onPickup(d.stack.id, taken);
        if (left === 0) {
          this.removeAt(i);
          continue;
        }
        d.stack.count = left;
      }
      const light = world.lightAt(b.x, b.y + 0.2, b.z);
      const l = Math.max(light.sky * daylight, light.block, 0.12);
      (d.mesh.material as THREE.MeshBasicMaterial).color.setScalar(0.35 + 0.65 * l);
      d.mesh.position.set(b.x, b.y + 0.18 + Math.sin(d.age * 3) * 0.05, b.z);
      d.mesh.rotation.y = d.age * 1.6;
    }
  }

  clear(): void {
    while (this.drops.length) this.removeAt(this.drops.length - 1);
  }

  dispose(): void {
    this.clear();
    for (const t of this.spriteTextures.values()) t.dispose();
    this.spriteGeo.dispose();
  }
}
