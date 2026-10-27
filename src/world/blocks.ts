import { Tile } from '../render/tiles';

export const B = {
  AIR: 0,
  GRASS: 1,
  DIRT: 2,
  STONE: 3,
  COBBLE: 4,
  SAND: 5,
  SANDSTONE: 6,
  LOG: 7,
  LEAVES: 8,
  PLANKS: 9,
  WATER: 10,
  COAL_ORE: 11,
  BEDROCK: 12,
  SNOW: 13,
  CACTUS: 14,
  WORKBENCH: 15,
  TORCH: 16,
  TALL_GRASS: 17,
  FLOWER_RED: 18,
  FLOWER_YELLOW: 19,
  BERRY_BUSH: 20,
  STONE_BRICKS: 21,
  CARVED_SANDSTONE: 22,
} as const;

export type RenderKind = 'none' | 'cube' | 'cross' | 'torch' | 'liquid';
export type ToolKind = 'pickaxe' | 'axe' | 'shovel' | 'sword';
export type SoundKind = 'grass' | 'stone' | 'wood' | 'sand' | 'leaves' | 'snow';

export interface DropSpec {
  item: string;
  count: number;
  chance?: number;
}

export interface BlockDef {
  id: number;
  /** Identificador del objeto que representa este bloque en el inventario. */
  key: string;
  name: string;
  render: RenderKind;
  /** El jugador y los enemigos chocan con él. */
  solid: boolean;
  /** Cubo completo que oculta las caras vecinas y bloquea la luz del cielo. */
  opaque: boolean;
  /** Casillas del atlas: arriba, abajo, lados y (opcional) frente. */
  tex: [number, number, number, number?];
  /** Segundos para romperlo a mano con la herramienta adecuada; Infinity = irrompible. */
  hardness: number;
  tool: ToolKind | null;
  /** Sin la herramienta adecuada no suelta nada. */
  needsTool: boolean;
  light: number;
  tint: boolean;
  /** Se puede colocar otro bloque encima de él (hierba alta, agua). */
  replaceable: boolean;
  /** Se cae si se rompe el bloque de debajo. */
  needsSupport: boolean;
  targetable: boolean;
  drops: DropSpec[] | null;
  sound: SoundKind;
}

type BlockInit = Partial<BlockDef> & Pick<BlockDef, 'key' | 'name' | 'tex'>;

const defs: BlockDef[] = [];

function def(id: number, init: BlockInit): void {
  defs[id] = {
    id,
    render: 'cube',
    solid: true,
    opaque: true,
    hardness: 1,
    tool: null,
    needsTool: false,
    light: 0,
    tint: false,
    replaceable: false,
    needsSupport: false,
    targetable: true,
    drops: null,
    sound: 'stone',
    ...init,
  };
}

const T = Tile;
def(B.AIR, { key: 'air', name: 'Aire', tex: [0, 0, 0], render: 'none', solid: false, opaque: false, targetable: false, replaceable: true, hardness: 0 });
def(B.GRASS, { key: 'grass', name: 'Césped', tex: [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], hardness: 0.6, tool: 'shovel', tint: true, drops: [{ item: 'dirt', count: 1 }], sound: 'grass' });
def(B.DIRT, { key: 'dirt', name: 'Tierra', tex: [T.DIRT, T.DIRT, T.DIRT], hardness: 0.5, tool: 'shovel', sound: 'grass' });
def(B.STONE, { key: 'stone', name: 'Piedra', tex: [T.STONE, T.STONE, T.STONE], hardness: 1.5, tool: 'pickaxe', needsTool: true, drops: [{ item: 'cobble', count: 1 }] });
def(B.COBBLE, { key: 'cobble', name: 'Roca', tex: [T.COBBLE, T.COBBLE, T.COBBLE], hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.SAND, { key: 'sand', name: 'Arena', tex: [T.SAND, T.SAND, T.SAND], hardness: 0.5, tool: 'shovel', sound: 'sand' });
def(B.SANDSTONE, { key: 'sandstone', name: 'Arenisca', tex: [T.SANDSTONE_TOP, T.SANDSTONE_TOP, T.SANDSTONE_SIDE], hardness: 0.8, tool: 'pickaxe', needsTool: true });
def(B.LOG, { key: 'log', name: 'Tronco', tex: [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE], hardness: 2, tool: 'axe', sound: 'wood' });
def(B.LEAVES, { key: 'leaves', name: 'Hojas', tex: [T.LEAVES, T.LEAVES, T.LEAVES], hardness: 0.25, opaque: false, tint: true, sound: 'leaves', drops: [{ item: 'apple', count: 1, chance: 0.1 }, { item: 'stick', count: 1, chance: 0.06 }] });
def(B.PLANKS, { key: 'planks', name: 'Tablones', tex: [T.PLANKS, T.PLANKS, T.PLANKS], hardness: 2, tool: 'axe', sound: 'wood' });
def(B.WATER, { key: 'water', name: 'Agua', tex: [T.WATER, T.WATER, T.WATER], render: 'liquid', solid: false, opaque: false, targetable: false, replaceable: true, hardness: Infinity, drops: [], sound: 'sand' });
def(B.COAL_ORE, { key: 'coal_ore', name: 'Veta de carbón', tex: [T.COAL_ORE, T.COAL_ORE, T.COAL_ORE], hardness: 3, tool: 'pickaxe', needsTool: true, drops: [{ item: 'coal', count: 1 }] });
def(B.BEDROCK, { key: 'bedrock', name: 'Basalto profundo', tex: [T.BEDROCK, T.BEDROCK, T.BEDROCK], hardness: Infinity, drops: [] });
def(B.SNOW, { key: 'snow', name: 'Nieve', tex: [T.SNOW, T.DIRT, T.SNOW_SIDE], hardness: 0.4, tool: 'shovel', sound: 'snow' });
def(B.CACTUS, { key: 'cactus', name: 'Cactus', tex: [T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE], hardness: 0.5, sound: 'leaves' });
def(B.WORKBENCH, { key: 'workbench', name: 'Mesa de trabajo', tex: [T.BENCH_TOP, T.PLANKS, T.BENCH_SIDE, T.BENCH_FRONT], hardness: 2.5, tool: 'axe', sound: 'wood' });
def(B.TORCH, { key: 'torch', name: 'Antorcha', tex: [T.TORCH, T.TORCH, T.TORCH], render: 'torch', solid: false, opaque: false, hardness: 0, light: 14, sound: 'wood' });
def(B.TALL_GRASS, { key: 'tall_grass', name: 'Hierba alta', tex: [T.TALL_GRASS, T.TALL_GRASS, T.TALL_GRASS], render: 'cross', solid: false, opaque: false, hardness: 0, tint: true, replaceable: true, needsSupport: true, drops: [{ item: 'berries', count: 1, chance: 0.04 }], sound: 'grass' });
def(B.FLOWER_RED, { key: 'flower_red', name: 'Amapola de cantera', tex: [T.FLOWER_RED, T.FLOWER_RED, T.FLOWER_RED], render: 'cross', solid: false, opaque: false, hardness: 0, needsSupport: true, sound: 'grass' });
def(B.FLOWER_YELLOW, { key: 'flower_yellow', name: 'Flor de sol', tex: [T.FLOWER_YELLOW, T.FLOWER_YELLOW, T.FLOWER_YELLOW], render: 'cross', solid: false, opaque: false, hardness: 0, needsSupport: true, sound: 'grass' });
def(B.BERRY_BUSH, { key: 'berry_bush', name: 'Arbusto de bayas', tex: [T.BERRY_BUSH, T.BERRY_BUSH, T.BERRY_BUSH], render: 'cross', solid: false, opaque: false, hardness: 0.1, needsSupport: true, drops: [{ item: 'berries', count: 3 }], sound: 'leaves' });
def(B.STONE_BRICKS, { key: 'stone_bricks', name: 'Ladrillo de piedra', tex: [T.STONE_BRICKS, T.STONE_BRICKS, T.STONE_BRICKS], hardness: 2, tool: 'pickaxe', needsTool: true });
def(B.CARVED_SANDSTONE, { key: 'carved_sandstone', name: 'Arenisca tallada', tex: [T.SANDSTONE_TOP, T.SANDSTONE_TOP, T.CARVED_SANDSTONE], hardness: 1, tool: 'pickaxe', needsTool: true });

export const BLOCKS: readonly BlockDef[] = defs;
export const BLOCK_COUNT = defs.length;

/** Tablas planas para los bucles calientes del mallado y la física. */
export const IS_SOLID = new Uint8Array(256);
export const IS_OPAQUE = new Uint8Array(256);
export const RENDER = new Uint8Array(256); // 0 none, 1 cube, 2 cross, 3 torch, 4 liquid
const RENDER_CODE: Record<RenderKind, number> = { none: 0, cube: 1, cross: 2, torch: 3, liquid: 4 };
for (const d of defs) {
  IS_SOLID[d.id] = d.solid ? 1 : 0;
  IS_OPAQUE[d.id] = d.opaque ? 1 : 0;
  RENDER[d.id] = RENDER_CODE[d.render];
}

export function blockDef(id: number): BlockDef {
  return defs[id] ?? defs[B.AIR];
}

export function blockByKey(key: string): BlockDef | undefined {
  return defs.find((d) => d.key === key);
}

export function isValidBlockId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < defs.length;
}
