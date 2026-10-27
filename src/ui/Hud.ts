import { HOTBAR_SIZE, type Inventory } from '../items/Inventory';
import { itemDef } from '../items/items';
import { MAX_HEALTH, MAX_HUNGER } from '../player/Player';
import type { IconSet } from '../render/icons';
import { h } from './dom';
import { createHudIcons } from './hudIcons';
import { createSlot, renderSlot } from './slot';

export class Hud {
  readonly root: HTMLDivElement;
  private hotbarSlots: HTMLDivElement[] = [];
  private hearts: HTMLImageElement[] = [];
  private foods: HTMLImageElement[] = [];
  private xpFill: HTMLDivElement;
  private xpLevel: HTMLSpanElement;
  private itemName: HTMLDivElement;
  private toasts: HTMLDivElement;
  private debug: HTMLPreElement;
  private vignette: HTMLDivElement;
  private water: HTMLDivElement;
  private hint: HTMLDivElement;
  private icons = createHudIcons();
  private lastHealth = -1;
  private lastHunger = -1;
  private nameTimer = 0;
  private lastSelected = -1;
  private lastSelectedId: string | null = null;

  constructor(private inventory: Inventory, private itemIcons: IconSet, onSelectSlot: (i: number) => void) {
    const hotbar = h('div', { class: 'hotbar', role: 'toolbar', 'aria-label': 'Barra rápida' });
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = createSlot(i, 'hotbar-slot');
      slot.append(h('span', { class: 'slot-key' }, String(i + 1)));
      slot.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onSelectSlot(i);
      });
      this.hotbarSlots.push(slot);
      hotbar.append(slot);
    }
    const heartsRow = h('div', { class: 'stat-row hearts', 'aria-label': 'Vida' });
    const foodRow = h('div', { class: 'stat-row foods', 'aria-label': 'Hambre' });
    for (let i = 0; i < 10; i++) {
      const heart = h('img', { alt: '', draggable: 'false' });
      const food = h('img', { alt: '', draggable: 'false' });
      this.hearts.push(heart);
      this.foods.unshift(food);
      heartsRow.append(heart);
      foodRow.append(food);
    }
    this.xpFill = h('div', { class: 'xp-fill' });
    this.xpLevel = h('span', { class: 'xp-level' });
    this.itemName = h('div', { class: 'item-name', 'aria-live': 'polite' });
    this.toasts = h('div', { class: 'toasts', 'aria-live': 'polite' });
    this.debug = h('pre', { class: 'debug', hidden: true });
    this.vignette = h('div', { class: 'vignette' });
    this.water = h('div', { class: 'underwater' });
    this.hint = h('div', { class: 'resume-hint', hidden: true });

    this.root = h('div', { class: 'hud', hidden: true },
      this.water,
      this.vignette,
      h('div', { class: 'crosshair', 'aria-hidden': 'true' }),
      this.debug,
      this.toasts,
      this.hint,
      h('div', { class: 'hud-bottom' },
        this.itemName,
        h('div', { class: 'stats' }, heartsRow, foodRow),
        h('div', { class: 'xp-bar', 'aria-label': 'Experiencia' }, this.xpFill, this.xpLevel),
        hotbar,
      ),
    );
    inventory.onChange(() => this.renderHotbar());
    this.renderHotbar();
  }

  show(v: boolean): void {
    this.root.hidden = !v;
  }

  renderHotbar(): void {
    for (let i = 0; i < HOTBAR_SIZE; i++) {
      const slot = this.hotbarSlots[i];
      renderSlot(slot, this.inventory.slots[i], this.itemIcons);
      slot.classList.toggle('selected', i === this.inventory.selected);
    }
    const stack = this.inventory.selectedStack();
    const id = stack?.id ?? null;
    if (this.inventory.selected !== this.lastSelected || id !== this.lastSelectedId) {
      this.lastSelected = this.inventory.selected;
      this.lastSelectedId = id;
      this.itemName.textContent = stack ? itemDef(stack.id)?.name ?? '' : '';
      this.itemName.classList.add('visible');
      this.nameTimer = 2.2;
    }
  }

  update(dt: number, stats: { health: number; hunger: number; level: number; progress: number }): void {
    if (stats.health !== this.lastHealth) {
      this.lastHealth = stats.health;
      for (let i = 0; i < MAX_HEALTH / 2; i++) {
        const v = stats.health - i * 2;
        this.hearts[i].src = v >= 2 ? this.icons.heart.full : v === 1 ? this.icons.heart.half : this.icons.heart.empty;
      }
      this.hearts[0].parentElement!.setAttribute('aria-label', `Vida ${stats.health} de ${MAX_HEALTH}`);
      this.hearts[0].parentElement!.classList.toggle('low', stats.health <= 6);
    }
    if (stats.hunger !== this.lastHunger) {
      this.lastHunger = stats.hunger;
      for (let i = 0; i < MAX_HUNGER / 2; i++) {
        const v = stats.hunger - i * 2;
        this.foods[i].src = v >= 2 ? this.icons.food.full : v === 1 ? this.icons.food.half : this.icons.food.empty;
      }
      this.foods[0].parentElement!.setAttribute('aria-label', `Hambre ${stats.hunger} de ${MAX_HUNGER}`);
    }
    this.xpFill.style.width = `${stats.progress * 100}%`;
    this.xpLevel.textContent = stats.level > 0 ? String(stats.level) : '';
    if (this.nameTimer > 0) {
      this.nameTimer -= dt;
      if (this.nameTimer <= 0) this.itemName.classList.remove('visible');
    }
  }

  toast(text: string, kind: 'info' | 'warn' | 'good' = 'info'): void {
    const el = h('div', { class: `toast ${kind}` }, text);
    this.toasts.append(el);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.classList.add('fade'), 2200);
    setTimeout(() => el.remove(), 2800);
  }

  flashDamage(): void {
    this.vignette.classList.remove('hit');
    void this.vignette.offsetWidth;
    this.vignette.classList.add('hit');
  }

  setUnderwater(v: boolean): void {
    this.water.classList.toggle('on', v);
  }

  setDebug(text: string | null): void {
    this.debug.hidden = text === null;
    if (text !== null) this.debug.textContent = text;
  }

  setHint(text: string | null, onClick?: () => void): void {
    this.hint.hidden = text === null;
    this.hint.textContent = text ?? '';
    this.hint.onclick = onClick ? (e) => { e.stopPropagation(); onClick(); } : null;
  }
}
