import { itemDef } from './items';

export interface ItemStack {
  id: string;
  count: number;
  /** Usos restantes de una herramienta. */
  durability?: number;
}

export const HOTBAR_SIZE = 9;
export const INVENTORY_SIZE = 36;

function maxStack(id: string): number {
  return itemDef(id)?.maxStack ?? 64;
}

export class Inventory {
  readonly slots: (ItemStack | null)[] = new Array(INVENTORY_SIZE).fill(null);
  private selectedIndex = 0;
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }

  get selected(): number {
    return this.selectedIndex;
  }

  set selected(i: number) {
    const next = ((i % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    if (next === this.selectedIndex) return;
    this.selectedIndex = next;
    this.emit();
  }

  selectedStack(): ItemStack | null {
    return this.slots[this.selectedIndex];
  }

  count(id: string): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  /** Cuántas unidades de `id` cabrían ahora mismo. */
  spaceFor(id: string): number {
    const max = maxStack(id);
    let space = 0;
    for (const s of this.slots) {
      if (!s) space += max;
      else if (s.id === id && s.durability === undefined) space += max - s.count;
    }
    return space;
  }

  /** Añade objetos y devuelve los que no cupieron. */
  add(id: string, count: number, durability?: number): number {
    const def = itemDef(id);
    if (!def || count <= 0) return count;
    const max = def.maxStack;
    let left = count;
    if (durability === undefined && max > 1) {
      for (const s of this.slots) {
        if (left === 0) break;
        if (s && s.id === id && s.durability === undefined && s.count < max) {
          const moved = Math.min(max - s.count, left);
          s.count += moved;
          left -= moved;
        }
      }
    }
    for (let i = 0; i < INVENTORY_SIZE && left > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(max, left);
      this.slots[i] = { id, count: moved, durability: durability ?? def.tool?.durability };
      left -= moved;
    }
    if (left !== count) this.emit();
    return left;
  }

  /** Quita `count` unidades de `id` si las hay todas; si no, no toca nada. */
  remove(id: string, count: number): boolean {
    if (this.count(id) < count) return false;
    let left = count;
    // Primero de la mochila, para respetar lo que el jugador tiene a mano.
    for (let k = 0; k < INVENTORY_SIZE && left > 0; k++) {
      const i = (k + HOTBAR_SIZE) % INVENTORY_SIZE;
      const s = this.slots[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count === 0) this.slots[i] = null;
    }
    this.emit();
    return true;
  }

  takeFromSlot(i: number, count: number): ItemStack | null {
    const s = this.slots[i];
    if (!s) return null;
    const take = Math.min(count, s.count);
    s.count -= take;
    if (s.count === 0) this.slots[i] = null;
    this.emit();
    return { id: s.id, count: take, durability: s.durability };
  }

  /** Desgasta la herramienta seleccionada. Devuelve true si se rompió. */
  wearSelected(amount: number): boolean {
    const s = this.slots[this.selectedIndex];
    if (!s || s.durability === undefined) return false;
    s.durability -= amount;
    const broken = s.durability <= 0;
    if (broken) this.slots[this.selectedIndex] = null;
    this.emit();
    return broken;
  }

  /** Mover por arrastrar y soltar: une montones iguales o intercambia. */
  move(from: number, to: number): void {
    if (from === to) return;
    const a = this.slots[from];
    const b = this.slots[to];
    if (!a) return;
    if (b && b.id === a.id && a.durability === undefined && b.durability === undefined) {
      const moved = Math.min(maxStack(a.id) - b.count, a.count);
      if (moved > 0) {
        b.count += moved;
        a.count -= moved;
        if (a.count === 0) this.slots[from] = null;
        this.emit();
        return;
      }
    }
    this.slots[from] = b;
    this.slots[to] = a;
    this.emit();
  }

  /** Lleva la mitad de un montón a una casilla vacía (arrastrar con clic derecho). */
  split(from: number, to: number): void {
    const a = this.slots[from];
    if (!a || a.count < 2 || this.slots[to]) return;
    const half = Math.floor(a.count / 2);
    a.count -= half;
    this.slots[to] = { id: a.id, count: half };
    this.emit();
  }

  /** Mueve un montón entre la barra rápida y la mochila (Mayús + clic). */
  quickMove(from: number): void {
    const s = this.slots[from];
    if (!s) return;
    const toHotbar = from >= HOTBAR_SIZE;
    const start = toHotbar ? 0 : HOTBAR_SIZE;
    const end = toHotbar ? HOTBAR_SIZE : INVENTORY_SIZE;
    for (let i = start; i < end && s.count > 0; i++) {
      const t = this.slots[i];
      if (t && t.id === s.id && t.durability === undefined && s.durability === undefined) {
        const moved = Math.min(maxStack(s.id) - t.count, s.count);
        t.count += moved;
        s.count -= moved;
      }
    }
    for (let i = start; i < end && s.count > 0; i++) {
      if (!this.slots[i]) {
        this.slots[i] = { ...s };
        s.count = 0;
      }
    }
    if (s.count === 0) this.slots[from] = null;
    this.emit();
  }

  serialize(): (ItemStack | null)[] {
    return this.slots.map((s) => (s ? { ...s } : null));
  }

  /** Carga datos guardados descartando objetos desconocidos o cantidades inválidas. */
  load(data: unknown, selected: unknown): void {
    this.slots.fill(null);
    if (Array.isArray(data)) {
      for (let i = 0; i < Math.min(data.length, INVENTORY_SIZE); i++) {
        const s = data[i] as Partial<ItemStack> | null;
        if (!s || typeof s.id !== 'string') continue;
        const def = itemDef(s.id);
        const count = Math.floor(Number(s.count));
        if (!def || !Number.isFinite(count) || count <= 0) continue;
        const stack: ItemStack = { id: s.id, count: Math.min(count, def.maxStack) };
        if (def.tool) {
          const d = Math.floor(Number(s.durability));
          stack.durability = Number.isFinite(d) && d > 0 ? Math.min(d, def.tool.durability) : def.tool.durability;
        }
        this.slots[i] = stack;
      }
    }
    const sel = Math.floor(Number(selected));
    this.selectedIndex = Number.isFinite(sel) && sel >= 0 && sel < HOTBAR_SIZE ? sel : 0;
    this.emit();
  }
}
