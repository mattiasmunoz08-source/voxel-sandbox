import type { ItemStack } from '../items/Inventory';
import { itemDef } from '../items/items';
import type { IconSet } from '../render/icons';
import { h } from './dom';

/** Casilla de objeto reutilizable: icono, cantidad y barra de desgaste. */
export function createSlot(index: number, extraClass = ''): HTMLDivElement {
  return h('div', { class: `slot ${extraClass}`.trim(), 'data-slot': index },
    h('div', { class: 'slot-icon' }),
    h('span', { class: 'slot-count' }),
    h('div', { class: 'slot-wear' }, h('div', { class: 'slot-wear-fill' })),
  );
}

export function renderSlot(el: HTMLElement, stack: ItemStack | null, icons: IconSet): void {
  const icon = el.querySelector<HTMLElement>('.slot-icon')!;
  const count = el.querySelector<HTMLElement>('.slot-count')!;
  const wear = el.querySelector<HTMLElement>('.slot-wear')!;
  const fill = el.querySelector<HTMLElement>('.slot-wear-fill')!;
  const key = stack ? `${stack.id}|${stack.count}|${stack.durability ?? ''}` : '';
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  if (!stack) {
    icon.style.backgroundImage = '';
    count.textContent = '';
    wear.style.display = 'none';
    el.removeAttribute('title');
    el.setAttribute('aria-label', 'Casilla vacía');
    return;
  }
  const def = itemDef(stack.id);
  icon.style.backgroundImage = `url(${icons.url(stack.id)})`;
  count.textContent = stack.count > 1 ? String(stack.count) : '';
  const max = def?.tool?.durability;
  if (max && stack.durability !== undefined && stack.durability < max) {
    const f = Math.max(0, stack.durability / max);
    wear.style.display = 'block';
    fill.style.width = `${f * 100}%`;
    fill.style.background = f > 0.5 ? '#6ad04a' : f > 0.2 ? '#e8c03a' : '#e2483a';
  } else {
    wear.style.display = 'none';
  }
  const name = def?.name ?? stack.id;
  el.title = stack.count > 1 ? `${name} ×${stack.count}` : name;
  el.setAttribute('aria-label', el.title);
}
