import * as THREE from 'three';
import type { Sound } from '../audio/Sound';
import { ItemDrops } from '../entities/ItemDrops';
import { MobManager, type Mob } from '../entities/Mobs';
import type { Recipe } from '../items/crafting';
import { HOTBAR_SIZE, Inventory, type ItemStack } from '../items/Inventory';
import { blockItemId, itemDef } from '../items/items';
import { Input } from '../player/Input';
import { MAX_HUNGER, Player } from '../player/Player';
import { raycastVoxels, type VoxelHit } from '../player/raycast';
import { createChunkMaterials, type ChunkMaterials } from '../render/chunkMaterial';
import { HeldItem } from '../render/HeldItem';
import type { IconSet } from '../render/icons';
import { Particles } from '../render/Particles';
import { Selection } from '../render/Selection';
import { Sky } from '../render/Sky';
import { sampleTileColors, type Atlas } from '../render/textures';
import { SAVE_VERSION, type SaveData, type WriteResult, writeSave } from '../save/storage';
import type { Settings, SettingsStore } from '../settings';
import { Hud } from '../ui/Hud';
import { InventoryScreen } from '../ui/InventoryScreen';
import { TouchControls } from '../ui/TouchControls';
import { B, BLOCKS, IS_SOLID, blockDef } from '../world/blocks';
import { CHUNK_SIZE } from '../world/constants';
import { BIOME_NAMES, BIOME_TINT } from '../world/generator';
import { World } from '../world/World';

/** Duración de un día completo en segundos. */
const DAY_LENGTH = 600;
const REACH = 5;
const ATTACK_REACH = 3.6;
const AUTOSAVE_SECONDS = 120;

export type GameState = 'playing' | 'inventory' | 'paused' | 'dead';

export interface GameAssets {
  renderer: THREE.WebGLRenderer;
  atlas: Atlas;
  atlasTexture: THREE.Texture;
  icons: IconSet;
  sound: Sound;
  settings: SettingsStore;
  uiRoot: HTMLElement;
}

export interface NewWorldParams {
  name: string;
  seed: number;
  seedText: string;
}

export interface GameEvents {
  onPauseRequested(): void;
  onDeath(cause: string): void;
}

export class Game {
  readonly world: World;
  readonly player: Player;
  readonly inventory = new Inventory();
  state: GameState = 'paused';
  name: string;
  seedText: string;
  time = 0.04;
  day = 1;
  lastSavedAt: number | null = null;

  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private materials: ChunkMaterials;
  private sky: Sky;
  private selection: Selection;
  private particles = new Particles();
  private drops: ItemDrops;
  private mobs = new MobManager();
  private held: HeldItem;
  private input = new Input();
  private hud: Hud;
  private inventoryScreen: InventoryScreen;
  private touch: TouchControls;
  private createdAt = Date.now();

  private target: VoxelHit | null = null;
  private breakProgress = 0;
  private breakKey = '';
  private digSoundTimer = 0;
  private attackCooldown = 0;
  private useCooldown = 0;
  private autosaveTimer = AUTOSAVE_SECONDS;
  private expectUnlock = false;
  private lockFailed = false;
  private lockErrors = 0;
  private lockAttempt = 0;
  private lockErrorAttempt = -1;
  private rafId = 0;
  private lastFrame = 0;
  private fps = 0;
  private fpsAcc = 0;
  private fpsFrames = 0;
  private lastLevel = 0;
  private disposed = false;
  private unsubSettings: () => void;

  constructor(private assets: GameAssets, private events: GameEvents, params: { save?: SaveData; fresh?: NewWorldParams }) {
    const s = assets.settings.value;
    const seed = params.save ? params.save.seed : params.fresh!.seed;
    this.name = params.save?.name ?? params.fresh!.name;
    this.seedText = params.save?.seedText ?? params.fresh!.seedText;

    this.camera = new THREE.PerspectiveCamera(s.fov, window.innerWidth / window.innerHeight, 0.05, 900);
    this.materials = createChunkMaterials(assets.atlasTexture);
    this.world = new World(seed, this.materials, s.renderDistance, s.quality !== 'low');
    this.sky = new Sky(seed);
    this.selection = new Selection(assets.atlasTexture);
    this.drops = new ItemDrops(assets.atlasTexture, assets.icons);
    this.held = new HeldItem(assets.atlasTexture, assets.icons);
    this.scene.add(this.sky.group, this.world.group, this.selection.group, this.particles.points, this.drops.group, this.mobs.group);

    this.player = new Player({
      onDamage: (amount, cause) => {
        this.hud.flashDamage();
        assets.sound.hurt();
        if (cause === 'caída' && amount > 0) this.hud.toast(`Caída: −${amount} de vida`, 'warn');
        if (cause === 'hambre') this.hud.toast('Tienes hambre: come algo (clic derecho con comida).', 'warn');
      },
      onDeath: (cause) => this.handleDeath(cause),
      onStep: () => {
        const below = this.world.getBlock(Math.floor(this.player.x), Math.floor(this.player.y - 0.1), Math.floor(this.player.z));
        if (below) assets.sound.step(blockDef(below).sound);
      },
      onSplash: () => assets.sound.splash(),
    });

    this.hud = new Hud(this.inventory, assets.icons, (i) => {
      this.inventory.selected = i;
    });
    this.inventoryScreen = new InventoryScreen(this.inventory, assets.icons, {
      onClose: () => this.closeInventory(),
      onDrop: (stack) => this.throwStack(stack),
      onCrafted: (recipe: Recipe) => {
        assets.sound.craft();
        this.hud.toast(`Fabricado: ${itemDef(recipe.result.id)?.name ?? recipe.result.id} ×${recipe.result.count}`, 'good');
      },
      onMessage: (text, kind) => this.hud.toast(text, kind),
    });
    this.touch = new TouchControls(this.input, {
      onInventory: () => (this.state === 'inventory' ? this.closeInventory() : this.openInventory('hand')),
      onPause: () => this.requestPause(),
      onDrop: () => this.dropSelected(),
    });
    assets.uiRoot.append(this.hud.root, this.touch.root, this.inventoryScreen.root);

    if (params.save) this.loadFrom(params.save);
    else {
      const spawn = this.world.generator.findSpawn();
      this.player.spawn = spawn;
      this.player.setPosition(spawn.x, spawn.y, spawn.z);
      this.player.yaw = Math.PI * 0.75;
    }

    this.unsubSettings = assets.settings.subscribe((v) => this.applySettings(v));
    this.applySettings(s);
    this.input.attach();
    document.addEventListener('pointerlockchange', this.onLockChange);
    document.addEventListener('pointerlockerror', this.onLockError);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('resize', this.onResize);
    assets.renderer.domElement.addEventListener('mousedown', this.onCanvasClick);
    assets.renderer.domElement.addEventListener('contextmenu', this.preventMenu);
    this.onResize();
    this.lastLevel = this.player.xpLevel().level;
  }

  // ---------- Ciclo de vida ----------

  async load(onProgress: (f: number) => void): Promise<void> {
    await this.world.preload(this.player.x, this.player.z, onProgress);
    this.ensureSafePosition();
    this.updateCamera();
    this.held.setItem(this.inventory.selectedStack()?.id ?? null);
    this.lastFrame = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  /** Volver al juego. Debe llamarse desde un gesto del usuario para poder capturar el ratón. */
  resume(): void {
    if (this.disposed) return;
    this.state = 'playing';
    this.hud.show(true);
    this.inventoryScreen.close();
    this.assets.sound.unlock();
    this.input.releaseAll();
    this.input.active = true;
    this.updateTouchVisibility();
    this.requestLock();
  }

  pause(): void {
    if (this.state === 'dead') return;
    this.state = 'paused';
    this.input.active = false;
    this.input.releaseAll();
    this.inventoryScreen.close();
    this.touch.show(false);
    this.hud.setHint(null);
    this.exitLock();
  }

  private requestPause(): void {
    if (this.state === 'playing' || this.state === 'inventory') {
      this.pause();
      this.events.onPauseRequested();
    }
  }

  // ---------- Ratón capturado ----------

  private get useTouch(): boolean {
    const mode = this.assets.settings.value.touchControls;
    const noLock = !('requestPointerLock' in this.assets.renderer.domElement);
    if (mode === 'on' || noLock) return true;
    if (mode === 'off') return false;
    return this.lockFailed || window.matchMedia('(pointer: coarse)').matches;
  }

  private updateTouchVisibility(): void {
    this.touch.show(this.state === 'playing' && this.useTouch);
  }

  private requestLock(): void {
    if (this.useTouch) {
      this.hud.setHint(null);
      return;
    }
    const canvas = this.assets.renderer.domElement;
    this.lockAttempt++;
    try {
      const result = canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (result && typeof result.catch === 'function') result.catch(() => this.onLockError());
    } catch {
      this.onLockError();
    }
  }

  private exitLock(): void {
    if (document.pointerLockElement) {
      this.expectUnlock = true;
      document.exitPointerLock();
    }
  }

  private onLockChange = () => {
    const locked = document.pointerLockElement === this.assets.renderer.domElement;
    this.input.pointerLocked = locked;
    if (locked) {
      this.lockErrors = 0;
      this.hud.setHint(null);
      return;
    }
    if (this.expectUnlock) {
      this.expectUnlock = false;
      return;
    }
    if (this.state === 'playing') this.requestPause();
  };

  private onLockError = () => {
    if (this.state !== 'playing' || document.pointerLockElement) return;
    // El rechazo llega a la vez como promesa y como evento: se cuenta una vez por intento.
    if (this.lockErrorAttempt === this.lockAttempt) return;
    this.lockErrorAttempt = this.lockAttempt;
    this.lockErrors++;
    if (this.lockErrors >= 2 && this.assets.settings.value.touchControls !== 'off') {
      // El navegador no deja capturar el ratón: se pasa a los controles en pantalla.
      this.enableFallbackControls();
      this.hud.toast('Tu navegador no permite capturar el ratón: usa los controles en pantalla (arrastra para mirar).', 'warn');
      return;
    }
    // Justo después de soltar el ratón el navegador puede negar la captura: se ofrece reintentar.
    this.hud.setHint('Haz clic en la pantalla para seguir jugando', () => this.requestLock());
  };

  private onCanvasClick = (e: MouseEvent) => {
    if (this.state === 'playing' && !this.input.pointerLocked && !this.useTouch) {
      e.preventDefault();
      this.requestLock();
    }
  };

  private preventMenu = (e: Event) => e.preventDefault();

  /** Activa los controles en pantalla si la captura del ratón no está disponible. */
  enableFallbackControls(): void {
    this.lockFailed = true;
    this.hud.setHint(null);
    this.updateTouchVisibility();
  }

  // ---------- Teclado de interfaz ----------

  private onKey = (e: KeyboardEvent) => {
    if (e.code === 'KeyE' && !e.repeat) {
      if (this.state === 'playing') {
        e.preventDefault();
        this.openInventory('hand');
      } else if (this.state === 'inventory') {
        e.preventDefault();
        this.closeInventory();
      }
    } else if (e.code === 'Escape') {
      if (this.state === 'inventory') {
        e.preventDefault();
        this.closeInventory();
      } else if (this.state === 'playing' && !this.input.pointerLocked) {
        this.requestPause();
      }
    }
  };

  private openInventory(station: 'hand' | 'workbench'): void {
    if (this.state !== 'playing') return;
    this.state = 'inventory';
    this.input.active = false;
    this.input.releaseAll();
    this.touch.show(false);
    this.hud.setHint(null);
    this.selection.setProgress(0);
    this.breakProgress = 0;
    this.exitLock();
    this.inventoryScreen.open(station);
  }

  private closeInventory(): void {
    if (this.state !== 'inventory') return;
    this.inventoryScreen.close();
    this.resume();
  }

  // ---------- Ajustes ----------

  private applySettings(s: Settings): void {
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
    this.held.camera.fov = 70;
    this.assets.sound.setVolume(s.volume);
    if (this.world.renderDistance !== s.renderDistance) this.world.renderDistance = s.renderDistance;
    const fancy = s.quality !== 'low';
    if (this.world.fancyLeaves !== fancy) {
      this.world.fancyLeaves = fancy;
      this.world.markAllDirty();
    }
    const ratio = s.quality === 'low' ? 0.75 : s.quality === 'medium' ? Math.min(window.devicePixelRatio, 1.25) : Math.min(window.devicePixelRatio, 2);
    this.assets.renderer.setPixelRatio(ratio);
    this.onResize();
    this.sky.setCloudsVisible(s.quality !== 'low');
    if (!s.showDebug) this.hud.setDebug(null);
    if (this.state === 'playing') this.updateTouchVisibility();
  }

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.assets.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.held.setAspect(w / h);
  };

  // ---------- Bucle principal ----------

  private frame = (now: number) => {
    if (this.disposed) return;
    this.rafId = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsAcc);
      this.fpsAcc = 0;
      this.fpsFrames = 0;
    }
    if (this.state === 'playing' || this.state === 'inventory') this.simulate(dt);
    this.world.update(this.player.x, this.player.z, this.state === 'playing' ? 5 : 3);
    this.updateCamera();
    this.sky.update(this.time, this.camera, this.state === 'paused' ? 0 : dt);
    this.materials.setDaylight(this.sky.daylight);
    const far = this.world.renderDistance * CHUNK_SIZE;
    const underwater = this.isCameraUnderwater();
    if (underwater) {
      this.materials.setFog(new THREE.Color(0.08, 0.22, 0.42).multiplyScalar(0.4 + 0.6 * this.sky.daylight), 2, 22);
    } else {
      this.materials.setFog(this.sky.fogColor, far * 0.55, far - 4);
    }
    this.hud.setUnderwater(underwater);
    this.render();
  };

  private simulate(dt: number): void {
    const playing = this.state === 'playing';
    const p = this.player;

    if (playing) this.handleHotbarInput();
    if (playing) {
      const [lx, ly] = this.input.takeLook();
      const s = this.assets.settings.value;
      p.look(lx, ly, s.sensitivity, s.invertY);
    }

    if (this.world.isLoadedAt(p.x, p.z)) p.update(dt, playing ? this.input : null, this.world);

    const prevTime = this.time;
    this.time = (this.time + dt / DAY_LENGTH) % 1;
    if (this.time < prevTime) this.day++;

    if (playing && !p.dead) this.handleInteraction(dt);
    else {
      this.selection.hide();
      this.target = null;
    }

    this.mobs.update(dt, {
      world: this.world,
      player: p,
      daylight: this.sky.daylight,
      night: this.sky.night,
      onMobKilled: (mob) => this.onMobKilled(mob),
      onPlayerHit: () => undefined,
      onGrowl: (d) => {
        if (d < 16) this.assets.sound.mobGrowl();
      },
      smoke: (x, y, z) => this.particles.burst(x, y, z, [[0.2, 0.2, 0.22], [0.35, 0.33, 0.38]], 6, 1, 1.5),
    });
    this.drops.update(dt, this.world, p, this.inventory, this.sky.daylight, (id, count) => {
      this.assets.sound.pickup();
      this.hud.toast(`+${count} ${itemDef(id)?.name ?? id}`);
    });
    this.particles.update(dt, this.world);

    const lvl = p.xpLevel();
    if (lvl.level > this.lastLevel) {
      this.assets.sound.levelUp();
      this.hud.toast(`¡Nivel ${lvl.level}!`, 'good');
    }
    this.lastLevel = lvl.level;
    this.hud.update(dt, { health: p.health, hunger: p.hunger, level: lvl.level, progress: lvl.progress });

    const speed = Math.hypot(p.body.vx, p.body.vz);
    const light = this.world.lightAt(p.x, p.y + p.eyeHeight, p.z);
    const brightness = 0.35 + 0.65 * Math.max(light.sky * this.sky.daylight, light.block, 0.15);
    this.held.setItem(this.inventory.selectedStack()?.id ?? null);
    this.held.update(dt, p.body.onGround ? speed / 4.3 : 0, brightness);

    if (this.assets.settings.value.showDebug) this.hud.setDebug(this.debugText());

    if (playing) {
      this.autosaveTimer -= dt;
      if (this.autosaveTimer <= 0) {
        this.autosaveTimer = AUTOSAVE_SECONDS;
        const res = this.save();
        if (res.ok) this.hud.toast('Guardado automático', 'good');
        else this.hud.toast(`No se pudo guardar: ${res.reason}`, 'warn');
      }
    }
  }

  private handleHotbarInput(): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      if (this.input.consumePress(`Digit${i + 1}`)) this.inventory.selected = i;
    }
    const wheel = this.input.takeWheel();
    if (wheel !== 0) this.inventory.selected = this.inventory.selected + wheel;
    if (this.input.consumePress('KeyQ')) this.dropSelected();
  }

  private eyePosition(): [number, number, number] {
    return [this.player.x, this.player.y + this.player.eyeHeight, this.player.z];
  }

  private handleInteraction(dt: number): void {
    const [ox, oy, oz] = this.eyePosition();
    const [dx, dy, dz] = this.player.lookDirection();
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.useCooldown = Math.max(0, this.useCooldown - dt);

    this.target = raycastVoxels(ox, oy, oz, dx, dy, dz, REACH, (x, y, z) => this.world.getBlock(x, y, z), (id) => BLOCKS[id].targetable);
    const mobHit = this.mobs.pick(ox, oy, oz, dx, dy, dz, ATTACK_REACH);
    const aimingMob = mobHit && (!this.target || mobHit.distance < this.target.distance);

    if (this.target && !aimingMob) this.selection.show(this.target.x, this.target.y, this.target.z);
    else this.selection.hide();

    const clicked = this.input.consumeLeftClick();
    if (clicked) this.held.punch();

    if (aimingMob && (clicked || this.input.breaking) && this.attackCooldown === 0) {
      this.attack(mobHit.mob);
      this.breakProgress = 0;
      this.selection.setProgress(0);
    } else if (this.input.breaking && this.target && !aimingMob) {
      this.continueBreaking(dt, this.target);
    } else {
      this.breakProgress = 0;
      this.breakKey = '';
      this.selection.setProgress(0);
    }

    if (this.input.consumeRightClick() || (this.input.rightDown && this.useCooldown === 0)) {
      if (this.useCooldown === 0) {
        this.useCooldown = 0.22;
        this.use();
      }
    }
  }

  private breakTime(blockId: number, stack: ItemStack | null): { time: number; harvest: boolean } {
    const def = blockDef(blockId);
    if (def.hardness === Infinity) return { time: Infinity, harvest: false };
    const tool = stack ? itemDef(stack.id)?.tool : undefined;
    const effective = !!tool && def.tool === tool.kind;
    const harvest = !def.needsTool || effective;
    if (def.hardness === 0) return { time: 0.05, harvest };
    let time = def.hardness * (harvest ? 1.5 : 5);
    if (effective && tool) time /= tool.speed;
    return { time, harvest };
  }

  private continueBreaking(dt: number, hit: VoxelHit): void {
    // Cambiar de herramienta reinicia el progreso de rotura.
    const key = `${hit.x},${hit.y},${hit.z},${this.inventory.selected}`;
    if (key !== this.breakKey) {
      this.breakKey = key;
      this.breakProgress = 0;
    }
    const { time } = this.breakTime(hit.block, this.inventory.selectedStack());
    if (time === Infinity) {
      this.selection.setProgress(0);
      return;
    }
    this.breakProgress += dt / time;
    this.digSoundTimer -= dt;
    if (this.digSoundTimer <= 0) {
      this.digSoundTimer = 0.24;
      this.assets.sound.dig(blockDef(hit.block).sound);
      this.held.punch();
    }
    if (this.breakProgress >= 1) {
      this.breakBlock(hit.x, hit.y, hit.z, true);
      this.breakProgress = 0;
      this.breakKey = '';
      this.selection.setProgress(0);
    } else {
      this.selection.setProgress(this.breakProgress);
    }
  }

  private blockColors(blockId: number, x: number, z: number): [number, number, number][] {
    const def = blockDef(blockId);
    const chunk = this.world.getChunk(Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE));
    const biome = chunk ? chunk.biomes[(x - chunk.cx * CHUNK_SIZE) + (z - chunk.cz * CHUNK_SIZE) * CHUNK_SIZE] : 0;
    return sampleTileColors(this.assets.atlas, def.tex[2], def.tint ? BIOME_TINT[biome] : null);
  }

  /** Rompe un bloque: lo quita, entrega lo que suelta y hace caer lo que se apoyaba en él. */
  private breakBlock(x: number, y: number, z: number, byPlayer: boolean): void {
    const id = this.world.getBlock(x, y, z);
    const def = blockDef(id);
    if (id === B.AIR || def.hardness === Infinity) return;
    const stack = this.inventory.selectedStack();
    const { harvest } = byPlayer ? this.breakTime(id, stack) : { harvest: true };

    // Si hay agua al lado o encima, el hueco se inunda.
    const waterNear = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(
      ([ax, ay, az]) => this.world.getBlock(x + ax, y + ay, z + az) === B.WATER,
    );
    this.world.setBlock(x, y, z, waterNear ? B.WATER : B.AIR);

    const light = this.world.lightAt(x + 0.5, y + 0.5, z + 0.5);
    const brightness = 0.3 + 0.7 * Math.max(light.sky * this.sky.daylight, light.block, 0.2);
    this.particles.burst(x + 0.5, y + 0.5, z + 0.5, this.blockColors(id, x, z), 18, brightness);
    this.assets.sound.breakBlock(def.sound);

    if (harvest) {
      const drops = def.drops ?? [{ item: blockItemId(id) ?? '', count: 1 }];
      for (const d of drops) {
        if (!d.item || (d.chance !== undefined && Math.random() > d.chance)) continue;
        this.give(d.item, d.count, x + 0.5, y + 0.5, z + 0.5);
      }
      if (id === B.COAL_ORE) this.player.xp += 2;
    } else if (byPlayer && def.needsTool) {
      this.hud.toast(`Necesitas ${def.tool === 'pickaxe' ? 'un pico' : 'otra herramienta'} para obtener ${def.name.toLowerCase()}.`, 'warn');
    }

    if (byPlayer) {
      this.player.addExhaustion(0.025);
      const tool = stack ? itemDef(stack.id)?.tool : undefined;
      if (tool && def.hardness > 0 && this.inventory.wearSelected(tool.kind === 'sword' ? 2 : 1)) {
        this.assets.sound.toolBreak();
        this.hud.toast(`Se rompió: ${itemDef(stack!.id)?.name}`, 'warn');
      }
    }

    const above = this.world.getBlock(x, y + 1, z);
    if (above !== B.AIR && blockDef(above).needsSupport) this.breakBlock(x, y + 1, z, false);
  }

  /** Mete objetos en el inventario; lo que no cabe cae al suelo. */
  private give(id: string, count: number, x: number, y: number, z: number): void {
    const left = this.inventory.add(id, count);
    const got = count - left;
    if (got > 0) this.hud.toast(`+${got} ${itemDef(id)?.name ?? id}`);
    if (left > 0) {
      this.drops.spawn(x, y, z, { id, count: left });
      this.hud.toast('Inventario lleno', 'warn');
    }
  }

  private attack(mob: Mob): void {
    const stack = this.inventory.selectedStack();
    const tool = stack ? itemDef(stack.id)?.tool : undefined;
    const damage = tool ? tool.damage : 1;
    this.attackCooldown = 0.42;
    this.held.punch();
    this.assets.sound.hit();
    this.player.addExhaustion(0.1);
    const b = mob.body;
    this.particles.burst(b.x, b.y + 1.1, b.z, [[0.35, 0.25, 0.5], [0.25, 0.9, 0.85]], 8, 1, 2.5);
    this.mobs.hurt(mob, damage, this.player.x, this.player.z, 7);
    if (tool && this.inventory.wearSelected(tool.kind === 'sword' ? 1 : 2)) {
      this.assets.sound.toolBreak();
      this.hud.toast(`Se rompió: ${itemDef(stack!.id)?.name}`, 'warn');
    }
  }

  private onMobKilled(mob: Mob): void {
    const b = mob.body;
    this.particles.burst(b.x, b.y + 0.8, b.z, [[0.22, 0.17, 0.32], [0.43, 0.97, 0.9]], 20, 1, 3);
    this.player.xp += 5;
    if (Math.random() < 0.35) this.drops.spawn(b.x, b.y + 0.5, b.z, { id: 'coal', count: 1 });
  }

  private use(): void {
    const hit = this.target;
    const stack = this.inventory.selectedStack();
    const def = stack ? itemDef(stack.id) : undefined;

    if (hit && hit.block === B.WORKBENCH && !this.player.sneaking) {
      this.openInventory('workbench');
      return;
    }
    if (def?.food) {
      if (this.player.hunger >= MAX_HUNGER) {
        this.hud.toast('No tienes hambre ahora.');
        return;
      }
      this.player.eat(def.food);
      this.inventory.takeFromSlot(this.inventory.selected, 1);
      this.assets.sound.eat();
      this.held.punch();
      this.hud.toast(`Comiste: ${def.name} (+${def.food} de hambre)`, 'good');
      return;
    }
    if (def?.block === undefined || !hit) return;

    const targetDef = blockDef(hit.block);
    const [px, py, pz] = targetDef.replaceable ? [hit.x, hit.y, hit.z] : [hit.x + hit.nx, hit.y + hit.ny, hit.z + hit.nz];
    if (py < 1 || py >= 96) return;
    const current = this.world.getBlock(px, py, pz);
    if (!blockDef(current).replaceable) return;
    const placing = blockDef(def.block);
    if (placing.solid && (this.player.body.intersectsBlock(px, py, pz) || this.mobs.occupies(px, py, pz))) return;
    if (placing.needsSupport) {
      const below = this.world.getBlock(px, py - 1, pz);
      if (below !== B.GRASS && below !== B.DIRT && below !== B.SNOW) {
        this.hud.toast(`${placing.name} necesita tierra o césped debajo.`, 'warn');
        return;
      }
    }
    // Plantas y antorchas no se pueden poner dentro del agua.
    if (!IS_SOLID[placing.id] && current === B.WATER) return;
    if (this.world.setBlock(px, py, pz, def.block)) {
      this.inventory.takeFromSlot(this.inventory.selected, 1);
      this.assets.sound.place(placing.sound);
      this.held.punch();
    }
  }

  private dropSelected(): void {
    if (this.state !== 'playing') return;
    const taken = this.inventory.takeFromSlot(this.inventory.selected, 1);
    if (taken) this.throwStack(taken);
  }

  /** Lanza objetos hacia delante; tardan un momento en poder recogerse. */
  private throwStack(stack: ItemStack): void {
    const [ox, oy, oz] = this.eyePosition();
    const [dx, dy, dz] = this.player.lookDirection();
    this.drops.spawn(ox + dx * 0.6, oy - 0.3 + dy * 0.6, oz + dz * 0.6, stack, [dx * 5, dy * 5 + 2, dz * 5], 1.5);
  }

  private handleDeath(cause: string): void {
    this.state = 'dead';
    this.input.active = false;
    this.input.releaseAll();
    this.inventoryScreen.close();
    this.touch.show(false);
    this.selection.hide();
    this.exitLock();
    this.events.onDeath(cause);
  }

  async respawn(onProgress: (f: number) => void): Promise<void> {
    this.player.respawn();
    await this.world.preload(this.player.x, this.player.z, onProgress);
    this.ensureSafePosition();
    this.state = 'paused';
  }

  /** Si el punto de aparición quedó dentro de bloques, sube hasta encontrar hueco. */
  private ensureSafePosition(): void {
    const b = this.player.body;
    let guard = 0;
    while (b.collides(this.world, b.x, b.y, b.z) && guard++ < 100) b.y = Math.floor(b.y) + 1;
    if (b.y < 1) {
      const top = this.world.topSolidY(Math.floor(b.x), Math.floor(b.z));
      b.y = top + 1;
    }
  }

  private isCameraUnderwater(): boolean {
    const c = this.camera.position;
    return this.world.getBlock(Math.floor(c.x), Math.floor(c.y), Math.floor(c.z)) === B.WATER;
  }

  private updateCamera(): void {
    const p = this.player;
    this.camera.position.set(p.x, p.y + p.eyeHeight, p.z);
    this.camera.rotation.set(p.pitch, p.yaw, 0, 'YXZ');
    const targetFov = this.assets.settings.value.fov * (p.sprinting ? 1.08 : 1);
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov += (targetFov - this.camera.fov) * 0.15;
      this.camera.updateProjectionMatrix();
    }
  }

  private render(): void {
    const r = this.assets.renderer;
    r.autoClear = false;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state !== 'dead') {
      r.clearDepth();
      r.render(this.held.scene, this.held.camera);
    }
  }

  private debugText(): string {
    const p = this.player;
    const cx = Math.floor(p.x / CHUNK_SIZE);
    const cz = Math.floor(p.z / CHUNK_SIZE);
    const chunk = this.world.getChunk(cx, cz);
    const biome = chunk ? BIOME_NAMES[chunk.biomes[(Math.floor(p.x) - cx * CHUNK_SIZE) + (Math.floor(p.z) - cz * CHUNK_SIZE) * CHUNK_SIZE]] : '—';
    const hours = Math.floor(((this.time * 24 + 6) % 24));
    const mins = Math.floor((((this.time * 24 + 6) % 1) * 60));
    return [
      `${this.fps} FPS · ${this.world.chunks.size} chunks · ${this.mobs.mobs.length} enemigos`,
      `X ${p.x.toFixed(1)}  Y ${p.y.toFixed(1)}  Z ${p.z.toFixed(1)}`,
      `Chunk ${cx}, ${cz} · ${biome}`,
      `Día ${this.day} · ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`,
      `Semilla ${this.world.seed}`,
    ].join('\n');
  }

  // ---------- Guardado ----------

  serialize(): SaveData {
    const p = this.player;
    return {
      version: SAVE_VERSION,
      name: this.name,
      seed: this.world.seed,
      seedText: this.seedText,
      createdAt: this.createdAt,
      savedAt: Date.now(),
      time: this.time,
      day: this.day,
      player: {
        x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch,
        health: p.dead ? 20 : p.health, hunger: p.hunger, xp: p.xp,
        spawn: { ...p.spawn },
      },
      inventory: this.inventory.serialize(),
      selected: this.inventory.selected,
      edits: this.world.serializeEdits(),
    };
  }

  save(): WriteResult {
    const res = writeSave(this.serialize());
    if (res.ok) {
      this.lastSavedAt = Date.now();
      this.autosaveTimer = AUTOSAVE_SECONDS;
    }
    return res;
  }

  private loadFrom(save: SaveData): void {
    this.createdAt = save.createdAt;
    this.time = save.time;
    this.day = save.day;
    this.lastSavedAt = save.savedAt;
    this.world.loadEdits(save.edits);
    const p = this.player;
    p.spawn = { ...save.player.spawn };
    p.setPosition(save.player.x, save.player.y, save.player.z);
    p.yaw = save.player.yaw;
    p.pitch = save.player.pitch;
    p.health = save.player.health;
    p.hunger = save.player.hunger;
    p.xp = save.player.xp;
    this.inventory.load(save.inventory, save.selected);
  }

  /** Objetos iniciales de un mundo nuevo: dos manzanas para el primer día. */
  giveStarterKit(): void {
    this.inventory.add('apple', 2);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.rafId);
    this.exitLock();
    this.input.detach();
    this.unsubSettings();
    document.removeEventListener('pointerlockchange', this.onLockChange);
    document.removeEventListener('pointerlockerror', this.onLockError);
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('resize', this.onResize);
    this.assets.renderer.domElement.removeEventListener('mousedown', this.onCanvasClick);
    this.assets.renderer.domElement.removeEventListener('contextmenu', this.preventMenu);
    this.world.dispose();
    this.mobs.clear();
    this.drops.dispose();
    this.particles.dispose();
    this.selection.dispose();
    this.sky.dispose();
    this.held.dispose();
    this.materials.dispose();
    this.inventoryScreen.dispose();
    this.hud.root.remove();
    this.touch.root.remove();
  }
}
