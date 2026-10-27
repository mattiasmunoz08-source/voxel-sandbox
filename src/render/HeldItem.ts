import * as THREE from 'three';
import { itemDef } from '../items/items';
import { blockDef } from '../world/blocks';
import { blockCubeGeometry } from './blockGeometry';
import type { IconSet } from './icons';

/** Objeto (o brazo) en primer plano, dibujado en una pasada aparte para que no atraviese paredes. */
export class HeldItem {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private holder = new THREE.Group();
  private current: THREE.Object3D | null = null;
  private currentId: string | null | undefined = undefined;
  private materials: THREE.MeshBasicMaterial[] = [];
  private disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
  private swing = 0;
  private bob = 0;

  constructor(private atlas: THREE.Texture, private icons: IconSet) {
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.scene.add(this.holder);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Inicia la animación de golpe o de uso. */
  punch(): void {
    if (this.swing <= 0) this.swing = 1;
  }

  setItem(id: string | null): void {
    if (id === this.currentId) return;
    this.currentId = id;
    if (this.current) this.holder.remove(this.current);
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.materials = [];

    const def = id ? itemDef(id) : undefined;
    let obj: THREE.Object3D;
    if (def?.block !== undefined && blockDef(def.block).render === 'cube') {
      const geo = blockCubeGeometry(def.block, 0.36);
      const mat = new THREE.MeshBasicMaterial({ map: this.atlas, alphaTest: 0.5 });
      this.disposables.push(geo, mat);
      this.materials.push(mat);
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(0.5, -0.46, -0.85);
      obj.rotation.set(0.1, 0.75, 0);
    } else if (def) {
      const canvas = this.icons.canvas16(def.id);
      const tex = new THREE.CanvasTexture(canvas ?? document.createElement('canvas'));
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      const geo = new THREE.PlaneGeometry(0.32, 0.32);
      const mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
      this.disposables.push(tex, geo, mat);
      this.materials.push(mat);
      obj = new THREE.Mesh(geo, mat);
      obj.position.set(0.46, -0.34, -0.8);
      obj.rotation.set(0, -0.5, 0.1);
    } else {
      // Brazo: manga de tela turquesa y mano.
      const arm = new THREE.Group();
      const sleeveGeo = new THREE.BoxGeometry(0.2, 0.2, 0.55);
      const handGeo = new THREE.BoxGeometry(0.19, 0.19, 0.16);
      const sleeveMat = new THREE.MeshBasicMaterial({ color: 0x2f7a78 });
      const handMat = new THREE.MeshBasicMaterial({ color: 0xc99467 });
      this.disposables.push(sleeveGeo, handGeo, sleeveMat, handMat);
      this.materials.push(sleeveMat, handMat);
      const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      const hand = new THREE.Mesh(handGeo, handMat);
      hand.position.z = -0.35;
      arm.add(sleeve, hand);
      arm.position.set(0.5, -0.5, -0.65);
      arm.rotation.set(0.25, 0.25, 0);
      obj = arm;
    }
    this.current = obj;
    this.holder.add(obj);
    for (const m of this.materials) m.userData.base = m.color.clone();
  }

  update(dt: number, moving: number, brightness: number): void {
    this.bob += dt * moving * 9;
    const bobAmount = Math.min(1, moving) * 0.025;
    let rx = 0;
    let py = Math.abs(Math.sin(this.bob)) * bobAmount;
    let px = Math.sin(this.bob * 0.5) * bobAmount;
    let pz = 0;
    if (this.swing > 0) {
      this.swing = Math.max(0, this.swing - dt * 4.5);
      const s = Math.sin((1 - this.swing) * Math.PI);
      rx = -s * 0.9;
      py -= s * 0.12;
      px -= s * 0.1;
      pz -= s * 0.15;
    }
    this.holder.position.set(px, py, pz);
    this.holder.rotation.x = rx;
    for (const m of this.materials) {
      const base = m.userData.base as THREE.Color | undefined;
      if (base) m.color.copy(base).multiplyScalar(brightness);
      else m.color.setScalar(brightness);
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
  }
}
