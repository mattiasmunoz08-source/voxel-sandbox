export type Quality = 'low' | 'medium' | 'high';
export type TouchMode = 'auto' | 'on' | 'off';

export interface Settings {
  /** 0..1 */
  volume: number;
  /** Multiplicador de sensibilidad del ratón (0.2..3). */
  sensitivity: number;
  invertY: boolean;
  fov: number;
  /** Radio de chunks visibles (2..8). */
  renderDistance: number;
  quality: Quality;
  showDebug: boolean;
  touchControls: TouchMode;
}

const KEY = 'cantera.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  volume: 0.6,
  sensitivity: 1,
  invertY: false,
  fov: 75,
  renderDistance: 5,
  quality: 'medium',
  showDebug: false,
  touchControls: 'auto',
};

function clamp(v: unknown, min: number, max: number, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

export function sanitizeSettings(raw: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const s = (raw && typeof raw === 'object' ? raw : {}) as Partial<Settings>;
  return {
    volume: clamp(s.volume, 0, 1, d.volume),
    sensitivity: clamp(s.sensitivity, 0.2, 3, d.sensitivity),
    invertY: typeof s.invertY === 'boolean' ? s.invertY : d.invertY,
    fov: Math.round(clamp(s.fov, 55, 100, d.fov)),
    renderDistance: Math.round(clamp(s.renderDistance, 2, 8, d.renderDistance)),
    quality: s.quality === 'low' || s.quality === 'medium' || s.quality === 'high' ? s.quality : d.quality,
    showDebug: typeof s.showDebug === 'boolean' ? s.showDebug : d.showDebug,
    touchControls: s.touchControls === 'auto' || s.touchControls === 'on' || s.touchControls === 'off' ? s.touchControls : d.touchControls,
  };
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return sanitizeSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Sin almacenamiento disponible (modo privado): los ajustes duran sólo esta sesión.
  }
}

/** Escucha los cambios de ajustes en toda la aplicación. */
export class SettingsStore {
  private listeners = new Set<(s: Settings) => void>();
  value: Settings = loadSettings();

  update(patch: Partial<Settings>): void {
    this.value = sanitizeSettings({ ...this.value, ...patch });
    saveSettings(this.value);
    for (const fn of this.listeners) fn(this.value);
  }

  subscribe(fn: (s: Settings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
