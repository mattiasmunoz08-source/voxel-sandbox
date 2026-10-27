import type { Inventory } from './Inventory';
import { itemDef } from './items';

export type Station = 'hand' | 'workbench';

export interface Recipe {
  id: string;
  result: { id: string; count: number };
  ingredients: { id: string; count: number }[];
  station: Station;
}

const r = (id: string, count: number, ingredients: [string, number][], station: Station = 'workbench'): Recipe => ({
  id: `${id}_${count}`,
  result: { id, count },
  ingredients: ingredients.map(([iid, n]) => ({ id: iid, count: n })),
  station,
});

export const RECIPES: Recipe[] = [
  r('planks', 4, [['log', 1]], 'hand'),
  r('stick', 4, [['planks', 2]], 'hand'),
  r('workbench', 1, [['planks', 4]], 'hand'),
  r('torch', 4, [['stick', 1], ['coal', 1]], 'hand'),
  r('wood_pickaxe', 1, [['planks', 3], ['stick', 2]]),
  r('wood_axe', 1, [['planks', 3], ['stick', 2]]),
  r('wood_shovel', 1, [['planks', 1], ['stick', 2]]),
  r('wood_sword', 1, [['planks', 2], ['stick', 1]]),
  r('stone_pickaxe', 1, [['cobble', 3], ['stick', 2]]),
  r('stone_axe', 1, [['cobble', 3], ['stick', 2]]),
  r('stone_shovel', 1, [['cobble', 1], ['stick', 2]]),
  r('stone_sword', 1, [['cobble', 2], ['stick', 1]]),
  r('stone_bricks', 4, [['cobble', 4]]),
  r('sandstone', 1, [['sand', 4]]),
  r('carved_sandstone', 2, [['sandstone', 2]]),
  r('berry_pie', 1, [['berries', 3], ['apple', 1]]),
];

export function stationAllows(recipe: Recipe, station: Station): boolean {
  return recipe.station === 'hand' || station === 'workbench';
}

export function hasIngredients(inv: Inventory, recipe: Recipe): boolean {
  return recipe.ingredients.every((ing) => inv.count(ing.id) >= ing.count);
}

export type CraftResult = { ok: true; leftover: number } | { ok: false; reason: string };

/**
 * Comprueba estación e ingredientes, los descuenta y entrega el resultado.
 * `leftover` es lo que no cupo en el inventario (quien llama lo suelta en el mundo).
 */
export function craft(inv: Inventory, recipe: Recipe, station: Station): CraftResult {
  if (!stationAllows(recipe, station)) return { ok: false, reason: 'Necesitas una mesa de trabajo.' };
  if (!hasIngredients(inv, recipe)) return { ok: false, reason: 'Faltan ingredientes.' };
  if (!itemDef(recipe.result.id)) return { ok: false, reason: 'Receta inválida.' };
  for (const ing of recipe.ingredients) inv.remove(ing.id, ing.count);
  const leftover = inv.add(recipe.result.id, recipe.result.count);
  return { ok: true, leftover };
}
