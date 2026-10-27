import type { ItemStack } from '../items/Inventory';
import { CHUNK_HEIGHT } from '../world/constants';

export const SAVE_VERSION = 1;
const SAVE_KEY = 'cantera.save.v1';

export interface SaveData {
  version: number;
  name: string;
  seed: number;
  seedText: string;
  createdAt: number;
  savedAt: number;
  /** Hora del día (0 = amanecer, 0.25 = mediodía, 0.5 = atardecer, 0.75 = medianoche). */
  time: number;
  day: number;
  player: {
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    health: number;
    hunger: number;
    xp: number;
    spawn: { x: number; y: number; z: number };
  };
  inventory: (ItemStack | null)[];
  selected: number;
  edits: Record<string, number[]>;
}

export type LoadResult =
  | { status: 'none' }
  | { status: 'ok'; data: SaveData }
  | { status: 'corrupt'; reason: string };

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Valida la estructura sin confiar en nada: lo que no cuadre se rechaza o se corrige. */
export function validateSave(raw: unknown): LoadResult {
  if (!raw || typeof raw !== 'object') return { status: 'corrupt', reason: 'El guardado no es un objeto válido.' };
  const s = raw as Partial<SaveData>;
  if (s.version !== SAVE_VERSION) return { status: 'corrupt', reason: `Versión de guardado desconocida (${String(s.version)}).` };
  if (!num(s.seed)) return { status: 'corrupt', reason: 'Falta la semilla del mundo.' };
  const p = s.player;
  if (!p || !num(p.x) || !num(p.y) || !num(p.z)) return { status: 'corrupt', reason: 'La posición del jugador no es válida.' };
  const spawn = p.spawn && num(p.spawn.x) && num(p.spawn.y) && num(p.spawn.z) ? p.spawn : { x: p.x, y: p.y, z: p.z };
  const clampY = (y: number) => Math.min(CHUNK_HEIGHT + 20, Math.max(1, y));
  const data: SaveData = {
    version: SAVE_VERSION,
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 40) : 'Mundo sin nombre',
    seed: s.seed | 0,
    seedText: typeof s.seedText === 'string' ? s.seedText.slice(0, 64) : String(s.seed),
    createdAt: num(s.createdAt) ? s.createdAt : Date.now(),
    savedAt: num(s.savedAt) ? s.savedAt : Date.now(),
    time: num(s.time) ? ((s.time % 1) + 1) % 1 : 0.05,
    day: num(s.day) ? Math.max(1, Math.floor(s.day)) : 1,
    player: {
      x: p.x,
      y: clampY(p.y),
      z: p.z,
      yaw: num(p.yaw) ? p.yaw : 0,
      pitch: num(p.pitch) ? Math.max(-1.5, Math.min(1.5, p.pitch)) : 0,
      health: num(p.health) ? Math.min(20, Math.max(1, Math.round(p.health))) : 20,
      hunger: num(p.hunger) ? Math.min(20, Math.max(0, Math.round(p.hunger))) : 20,
      xp: num(p.xp) ? Math.max(0, Math.floor(p.xp)) : 0,
      spawn: { x: spawn.x, y: clampY(spawn.y), z: spawn.z },
    },
    inventory: Array.isArray(s.inventory) ? s.inventory : [],
    selected: num(s.selected) ? s.selected : 0,
    edits: s.edits && typeof s.edits === 'object' && !Array.isArray(s.edits) ? s.edits : {},
  };
  return { status: 'ok', data };
}

export function loadSave(): LoadResult {
  let text: string | null;
  try {
    text = localStorage.getItem(SAVE_KEY);
  } catch {
    return { status: 'corrupt', reason: 'El navegador no permite leer el almacenamiento local.' };
  }
  if (!text) return { status: 'none' };
  try {
    return validateSave(JSON.parse(text));
  } catch {
    return { status: 'corrupt', reason: 'El guardado está dañado y no se puede leer.' };
  }
}

export type WriteResult = { ok: true; bytes: number } | { ok: false; reason: string };

export function writeSave(data: SaveData): WriteResult {
  try {
    const text = JSON.stringify(data);
    localStorage.setItem(SAVE_KEY, text);
    return { ok: true, bytes: text.length };
  } catch (e) {
    const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
    return { ok: false, reason: quota ? 'No queda espacio en el almacenamiento del navegador.' : 'El navegador no permite guardar.' };
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nada que borrar si el almacenamiento no está disponible.
  }
}
