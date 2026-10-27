import { B, BLOCKS, type ToolKind } from '../world/blocks';

export interface ToolSpec {
  kind: ToolKind;
  /** 1 = madera, 2 = piedra. */
  tier: number;
  /** Multiplicador de velocidad al romper bloques de su tipo. */
  speed: number;
  damage: number;
  durability: number;
}

export interface ItemDef {
  id: string;
  name: string;
  maxStack: number;
  /** Bloque que se coloca con este objeto. */
  block?: number;
  tool?: ToolSpec;
  /** Puntos de hambre que recupera al comerlo. */
  food?: number;
  description?: string;
}

const items = new Map<string, ItemDef>();

function add(item: ItemDef): void {
  items.set(item.id, item);
}

const NOT_ITEMS = new Set<number>([B.AIR, B.WATER, B.BEDROCK]);
for (const block of BLOCKS) {
  if (NOT_ITEMS.has(block.id)) continue;
  add({ id: block.key, name: block.name, maxStack: 64, block: block.id });
}

add({ id: 'stick', name: 'Palo', maxStack: 64, description: 'Mango para herramientas y antorchas.' });
add({ id: 'coal', name: 'Carbón', maxStack: 64, description: 'Combustible para antorchas.' });
add({ id: 'apple', name: 'Manzana', maxStack: 16, food: 4, description: 'Recupera 4 de hambre.' });
add({ id: 'berries', name: 'Bayas', maxStack: 32, food: 2, description: 'Recupera 2 de hambre.' });
add({ id: 'berry_pie', name: 'Tarta de bayas', maxStack: 8, food: 8, description: 'Recupera 8 de hambre.' });

const MATERIALS = [
  { key: 'wood', label: 'de madera', tier: 1, speed: 2, durability: 60 },
  { key: 'stone', label: 'de piedra', tier: 2, speed: 4, durability: 132 },
] as const;

const TOOL_KINDS: { kind: ToolKind; label: string; damage: [number, number] }[] = [
  { kind: 'pickaxe', label: 'Pico', damage: [2, 3] },
  { kind: 'axe', label: 'Hacha', damage: [3, 4] },
  { kind: 'shovel', label: 'Pala', damage: [1.5, 2.5] },
  { kind: 'sword', label: 'Espada', damage: [4, 5] },
];

for (const mat of MATERIALS) {
  for (const t of TOOL_KINDS) {
    add({
      id: `${mat.key}_${t.kind}`,
      name: `${t.label} ${mat.label}`,
      maxStack: 1,
      tool: {
        kind: t.kind,
        tier: mat.tier,
        speed: t.kind === 'sword' ? 1 : mat.speed,
        damage: t.damage[mat.tier - 1],
        durability: mat.durability,
      },
    });
  }
}

export const ITEMS: ReadonlyMap<string, ItemDef> = items;

export function itemDef(id: string): ItemDef | undefined {
  return items.get(id);
}

/** Objeto que suelta un bloque al romperse por defecto: él mismo. */
export function blockItemId(blockId: number): string | null {
  const key = BLOCKS[blockId]?.key;
  return key && items.has(key) ? key : null;
}
