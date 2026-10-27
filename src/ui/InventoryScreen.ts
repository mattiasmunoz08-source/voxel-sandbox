import { RECIPES, craft, hasIngredients, stationAllows, type Recipe, type Station } from '../items/crafting';
import { HOTBAR_SIZE, INVENTORY_SIZE, type Inventory, type ItemStack } from '../items/Inventory';
import { itemDef } from '../items/items';
import type { IconSet } from '../render/icons';
import { clear, h } from './dom';
import { createSlot, renderSlot } from './slot';

export interface InventoryCallbacks {
  onClose(): void;
  /** Suelta objetos en el mundo (desde la zona «Tirar» o lo que no cupo al fabricar). */
  onDrop(stack: ItemStack): void;
  onCrafted(recipe: Recipe): void;
  onMessage(text: string, kind?: 'info' | 'warn' | 'good'): void;
}

interface DragState {
  from: number;
  pointerId: number;
  split: boolean;
  startX: number;
  startY: number;
  ghost: HTMLDivElement | null;
}

/** Pantalla de inventario con arrastrar y soltar, y lista de recetas de fabricación. */
export class InventoryScreen {
  readonly root: HTMLDivElement;
  private slots: HTMLDivElement[] = [];
  private title: HTMLHeadingElement;
  private info: HTMLParagraphElement;
  private recipeList: HTMLDivElement;
  private dropZone: HTMLDivElement;
  private station: Station = 'hand';
  private drag: DragState | null = null;
  private unsubscribe: () => void;

  constructor(private inventory: Inventory, private icons: IconSet, private cb: InventoryCallbacks) {
    this.title = h('h2', {}, 'Inventario');
    this.info = h('p', { class: 'inv-info' }, 'Arrastra objetos entre casillas. Mayús + clic los pasa entre mochila y barra rápida.');
    const main = h('div', { class: 'inv-grid' });
    const hotbar = h('div', { class: 'inv-grid inv-hotbar' });
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      const slot = createSlot(i);
      slot.addEventListener('pointerdown', (e) => this.onPointerDown(e, i));
      slot.addEventListener('contextmenu', (e) => e.preventDefault());
      this.slots.push(slot);
      (i < HOTBAR_SIZE ? hotbar : main).append(slot);
    }
    this.dropZone = h('div', { class: 'drop-zone', 'data-drop': '1' }, 'Suelta aquí para tirar al suelo');
    this.recipeList = h('div', { class: 'recipes' });

    this.root = h('div', { class: 'overlay inventory-overlay', hidden: true, role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Inventario' },
      h('div', { class: 'panel inventory-panel' },
        h('header', { class: 'panel-header' },
          this.title,
          h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Cerrar inventario', onclick: () => this.cb.onClose() }, '✕'),
        ),
        h('div', { class: 'inv-body' },
          h('section', { class: 'inv-section' },
            h('h3', {}, 'Mochila'),
            main,
            h('h3', {}, 'Barra rápida'),
            hotbar,
            this.dropZone,
            this.info,
          ),
          h('section', { class: 'inv-section craft-section' },
            h('h3', {}, 'Fabricación'),
            this.recipeList,
          ),
        ),
      ),
    );
    this.root.addEventListener('pointermove', (e) => this.onPointerMove(e));
    this.root.addEventListener('pointerup', (e) => this.onPointerUp(e));
    this.root.addEventListener('pointercancel', () => this.cancelDrag());
    this.unsubscribe = inventory.onChange(() => {
      if (!this.root.hidden) this.render();
    });
  }

  get isOpen(): boolean {
    return !this.root.hidden;
  }

  open(station: Station): void {
    this.station = station;
    this.title.textContent = station === 'workbench' ? 'Mesa de trabajo' : 'Inventario';
    this.root.hidden = false;
    this.render();
  }

  close(): void {
    this.cancelDrag();
    this.root.hidden = true;
  }

  private render(): void {
    for (let i = 0; i < INVENTORY_SIZE; i++) {
      renderSlot(this.slots[i], this.inventory.slots[i], this.icons);
      this.slots[i].classList.toggle('selected', i === this.inventory.selected);
    }
    this.renderRecipes();
  }

  private renderRecipes(): void {
    clear(this.recipeList);
    const groups: [string, Recipe[]][] = [
      ['A mano', RECIPES.filter((r) => r.station === 'hand')],
      ['Con mesa de trabajo', RECIPES.filter((r) => r.station === 'workbench')],
    ];
    for (const [label, recipes] of groups) {
      this.recipeList.append(h('h4', {}, label));
      if (label !== 'A mano' && this.station !== 'workbench') {
        this.recipeList.append(h('p', { class: 'recipe-note' }, 'Coloca una mesa de trabajo y úsala con clic derecho para fabricar estas recetas.'));
      }
      for (const recipe of recipes) this.recipeList.append(this.recipeRow(recipe));
    }
  }

  private recipeRow(recipe: Recipe): HTMLElement {
    const result = itemDef(recipe.result.id);
    const allowed = stationAllows(recipe, this.station);
    const enough = hasIngredients(this.inventory, recipe);
    const ingredients = h('div', { class: 'ingredients' });
    for (const ing of recipe.ingredients) {
      const have = this.inventory.count(ing.id);
      ingredients.append(
        h('span', { class: `ingredient ${have >= ing.count ? 'ok' : 'missing'}`, title: itemDef(ing.id)?.name ?? ing.id },
          h('img', { src: this.icons.url(ing.id), alt: '' }),
          `${itemDef(ing.id)?.name ?? ing.id} ${Math.min(have, 999)}/${ing.count}`,
        ),
      );
    }
    const button = h('button', {
      class: 'btn btn-small',
      type: 'button',
      disabled: !allowed || !enough,
      onclick: () => {
        const res = craft(this.inventory, recipe, this.station);
        if (!res.ok) {
          this.cb.onMessage(res.reason, 'warn');
          return;
        }
        if (res.leftover > 0) {
          this.cb.onDrop({ id: recipe.result.id, count: res.leftover });
          this.cb.onMessage('Inventario lleno: el resultado cayó al suelo.', 'warn');
        }
        this.cb.onCrafted(recipe);
      },
    }, allowed ? 'Fabricar' : 'Requiere mesa');
    return h('div', { class: `recipe ${allowed && enough ? 'ready' : ''} ${allowed ? '' : 'locked'}` },
      h('img', { class: 'recipe-icon', src: this.icons.url(recipe.result.id), alt: '' }),
      h('div', { class: 'recipe-main' },
        h('div', { class: 'recipe-name' }, `${result?.name ?? recipe.result.id}${recipe.result.count > 1 ? ` ×${recipe.result.count}` : ''}`),
        ingredients,
      ),
      button,
    );
  }

  private describe(i: number): void {
    const s = this.inventory.slots[i];
    if (!s) return;
    const def = itemDef(s.id);
    const parts = [def?.name ?? s.id];
    if (s.count > 1) parts.push(`×${s.count}`);
    if (def?.tool && s.durability !== undefined) parts.push(`· desgaste ${s.durability}/${def.tool.durability}`);
    if (def?.food) parts.push(`· recupera ${def.food} de hambre (clic derecho para comer)`);
    else if (def?.description) parts.push(`· ${def.description}`);
    this.info.textContent = parts.join(' ');
  }

  private onPointerDown(e: PointerEvent, i: number): void {
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    if (!this.inventory.slots[i]) return;
    if (e.button === 0 && e.shiftKey) {
      this.inventory.quickMove(i);
      return;
    }
    this.describe(i);
    this.drag = { from: i, pointerId: e.pointerId, split: e.button === 2, startX: e.clientX, startY: e.clientY, ghost: null };
    try {
      this.root.setPointerCapture(e.pointerId);
    } catch {
      // Sin captura, el arrastre sigue funcionando mientras el puntero esté sobre el panel.
    }
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    if (!d.ghost && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > 4) {
      const stack = this.inventory.slots[d.from];
      if (!stack) return;
      d.ghost = h('div', { class: 'drag-ghost' });
      d.ghost.style.backgroundImage = `url(${this.icons.url(stack.id)})`;
      const shown = d.split ? Math.floor(stack.count / 2) : stack.count;
      if (shown > 1) d.ghost.append(h('span', {}, String(shown)));
      document.body.append(d.ghost);
      this.slots[d.from].classList.add('dragging');
    }
    if (d.ghost) {
      d.ghost.style.left = `${e.clientX}px`;
      d.ghost.style.top = `${e.clientY}px`;
      const over = document.elementFromPoint(e.clientX, e.clientY);
      this.dropZone.classList.toggle('hover', !!over?.closest('[data-drop]'));
    }
  }

  private onPointerUp(e: PointerEvent): void {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    const dragged = !!d.ghost;
    this.cancelDrag();
    if (!dragged) return;
    const over = document.elementFromPoint(e.clientX, e.clientY);
    if (over?.closest('[data-drop]')) {
      const s = this.inventory.slots[d.from];
      if (!s) return;
      const taken = this.inventory.takeFromSlot(d.from, d.split ? Math.floor(s.count / 2) || 1 : s.count);
      if (taken) this.cb.onDrop(taken);
      return;
    }
    const target = over?.closest<HTMLElement>('[data-slot]');
    if (!target || !this.root.contains(target)) return;
    const to = Number(target.dataset.slot);
    if (!Number.isInteger(to)) return;
    if (d.split && !this.inventory.slots[to]) this.inventory.split(d.from, to);
    else this.inventory.move(d.from, to);
  }

  private cancelDrag(): void {
    const d = this.drag;
    if (!d) return;
    if (this.root.hasPointerCapture(d.pointerId)) this.root.releasePointerCapture(d.pointerId);
    d.ghost?.remove();
    this.slots[d.from]?.classList.remove('dragging');
    this.dropZone.classList.remove('hover');
    this.drag = null;
  }

  dispose(): void {
    this.cancelDrag();
    this.unsubscribe();
    this.root.remove();
  }
}
