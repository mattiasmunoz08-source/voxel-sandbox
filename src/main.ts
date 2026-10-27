import '@fontsource/pixelify-sans/latin-400.css';
import '@fontsource/pixelify-sans/latin-700.css';
import './styles.css';
import * as THREE from 'three';
import { Sound } from './audio/Sound';
import { Game } from './game/Game';
import { createIcons } from './render/icons';
import { createAtlas } from './render/textures';
import { deleteSave, loadSave, writeSave } from './save/storage';
import { SettingsStore } from './settings';
import { menuBackground } from './ui/menuBackground';
import { Menus } from './ui/Menus';
import { seedFromText } from './world/noise';

THREE.ColorManagement.enabled = false;

function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setClearColor(0x000000);
    return renderer;
  } catch {
    return null;
  }
}

class App {
  private settings = new SettingsStore();
  private sound = new Sound();
  private menus: Menus;
  private game: Game | null = null;
  private renderer: THREE.WebGLRenderer | null;
  private atlas = createAtlas();
  private atlasTexture: THREE.CanvasTexture;
  private icons = createIcons(this.atlas);
  private uiRoot: HTMLElement;
  private canvas: HTMLCanvasElement;
  private busy = false;

  constructor() {
    this.canvas = document.getElementById('game') as HTMLCanvasElement;
    this.uiRoot = document.getElementById('ui')!;
    this.renderer = createRenderer(this.canvas);
    this.atlasTexture = new THREE.CanvasTexture(this.atlas.canvas);
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.generateMipmaps = false;
    this.sound.setVolume(this.settings.value.volume);
    this.settings.subscribe((s) => this.sound.setVolume(s.volume));

    this.menus = new Menus(this.settings, this.sound, {
      continueGame: () => void this.continueGame(),
      createWorld: (name, seedText) => void this.createWorld(name, seedText),
      deleteCorruptSave: () => {
        deleteSave();
        this.showMain();
      },
      play: () => this.enterGame(),
      resume: () => this.enterGame(),
      save: () => {
        if (!this.game) return { ok: false, message: 'No hay partida en curso.' };
        const res = this.game.save();
        return res.ok
          ? { ok: true, message: `Partida guardada (${Math.max(1, Math.round(res.bytes / 1024))} KB).` }
          : { ok: false, message: `No se pudo guardar: ${res.reason}` };
      },
      quitToMenu: (save) => this.quitToMenu(save),
      respawn: () => void this.respawn(),
    });
    this.uiRoot.append(this.menus.root);
    document.body.style.backgroundImage = menuBackground();

    // Guardado al cerrar o recargar la pestaña, para no perder lo hecho desde el último guardado.
    window.addEventListener('pagehide', () => {
      if (this.game && this.game.state !== 'dead') writeSave(this.game.serialize());
    });

    if (!this.renderer) {
      this.menus.showError('WebGL no disponible', 'Tu navegador o tu tarjeta gráfica no permiten WebGL, necesario para mostrar el mundo en 3D. Prueba con una versión reciente de Chrome, Edge, Firefox o Safari.');
      return;
    }
    this.showMain();
  }

  private showMain(): void {
    document.body.classList.add('in-menu');
    this.menus.showMain(loadSave());
  }

  private assets() {
    return {
      renderer: this.renderer!,
      atlas: this.atlas,
      atlasTexture: this.atlasTexture,
      icons: this.icons,
      sound: this.sound,
      settings: this.settings,
      uiRoot: this.uiRoot,
    };
  }

  private events() {
    return {
      onPauseRequested: () => this.menus.showPause(this.game?.lastSavedAt ?? null),
      onDeath: (cause: string) => this.menus.showDeath(cause),
    };
  }

  private async continueGame(): Promise<void> {
    if (this.busy) return;
    const res = loadSave();
    if (res.status !== 'ok') {
      this.showMain();
      return;
    }
    this.busy = true;
    this.sound.unlock();
    try {
      this.disposeGame();
      this.game = new Game(this.assets(), this.events(), { save: res.data });
      this.menus.showLoading('Cargando el mundo…');
      await this.game.load((f) => this.menus.setProgress(f));
      document.body.classList.remove('in-menu');
      this.menus.showReady(res.data.name, false);
    } catch (err) {
      console.error(err);
      this.disposeGame();
      this.menus.showError('No se pudo cargar el mundo', 'Ocurrió un error inesperado al generar el terreno. Tu guardado no se ha modificado.');
    } finally {
      this.busy = false;
    }
  }

  private async createWorld(name: string, seedText: string): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.sound.unlock();
    const text = seedText || String(Math.floor(Math.random() * 2 ** 31));
    try {
      this.disposeGame();
      this.game = new Game(this.assets(), this.events(), { fresh: { name, seed: seedFromText(text), seedText: text } });
      this.game.giveStarterKit();
      this.menus.showLoading('Generando el mundo…');
      await this.game.load((f) => this.menus.setProgress(f));
      document.body.classList.remove('in-menu');
      const saved = this.game.save();
      if (!saved.ok) console.warn(saved.reason);
      this.menus.showReady(name, true);
    } catch (err) {
      console.error(err);
      this.disposeGame();
      this.menus.showError('No se pudo crear el mundo', 'Ocurrió un error inesperado al generar el terreno.');
    } finally {
      this.busy = false;
    }
  }

  private enterGame(): void {
    if (!this.game) return;
    this.menus.hide();
    this.game.resume();
  }

  private async respawn(): Promise<void> {
    if (!this.game || this.busy) return;
    this.busy = true;
    try {
      this.menus.showLoading('Reapareciendo…');
      await this.game.respawn((f) => this.menus.setProgress(f));
      this.enterGame();
    } finally {
      this.busy = false;
    }
  }

  private quitToMenu(save: boolean): void {
    if (this.game && save) {
      const res = this.game.save();
      if (!res.ok) {
        this.menus.confirm('No se pudo guardar', `${res.reason} ¿Salir de todas formas?`, [
          { label: 'Salir sin guardar', danger: true, action: () => this.quitToMenu(false) },
          { label: 'Volver', action: () => this.menus.showPause(this.game?.lastSavedAt ?? null) },
        ]);
        return;
      }
    }
    this.disposeGame();
    this.renderer?.clear();
    this.showMain();
  }

  private disposeGame(): void {
    this.game?.dispose();
    this.game = null;
  }

  /** Acceso para pruebas manuales desde la consola en desarrollo. */
  debugHandle() {
    return { game: () => this.game, menus: this.menus };
  }
}

const app = new App();
if (import.meta.env.DEV) (window as unknown as { cantera: unknown }).cantera = app.debugHandle();
