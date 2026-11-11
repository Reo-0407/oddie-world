import type { Ropes } from '../game/save.ts';

export type ShopItem = 'basic' | 'sturdy' | 'potion';

export const SHOP_ITEMS: readonly ShopItem[] = ['basic', 'sturdy', 'potion'];

/** 가격표 (코인) */
export const PRICES: Record<ShopItem, number> = { basic: 50, sturdy: 150, potion: 80 };

export const ITEM_NAMES: Record<ShopItem, string> = { basic: '로프', sturdy: '튼튼한 로프', potion: '회복약' };

export const ITEM_HELP: Record<ShopItem, string> = {
  basic: '야생 오디를 잡는 기본 로프',
  sturdy: '잡기 쉬운 튼튼한 로프 (확률 ×1.8)',
  potion: '전투 중 내 오디 체력 회복 (최대 체력의 50%, 최소 30)',
};

/** 한 종류를 가질 수 있는 최대 개수 */
export const MAX_STACK = 99;

export interface Inventory {
  coins: number;
  ropes: Ropes;
  potions: number;
}

export type BuyResult =
  | { ok: true; inventory: Inventory; cost: number }
  | { ok: false; reason: 'invalid' | 'coins' | 'full' };

export function owned(inventory: Inventory, item: ShopItem): number {
  return item === 'potion' ? inventory.potions : inventory.ropes[item];
}

/** 몇 개까지 살 수 있나 (코인과 최대 소지 수 기준) */
export function maxAffordable(inventory: Inventory, item: ShopItem): number {
  return Math.max(0, Math.min(Math.floor(inventory.coins / PRICES[item]), MAX_STACK - owned(inventory, item)));
}

/** 구입. 원본은 바꾸지 않고 새 소지품을 돌려준다 */
export function buy(inventory: Inventory, item: ShopItem, quantity: number): BuyResult {
  if (!Number.isInteger(quantity) || quantity < 1 || !(item in PRICES)) return { ok: false, reason: 'invalid' };
  if (owned(inventory, item) + quantity > MAX_STACK) return { ok: false, reason: 'full' };
  const cost = PRICES[item] * quantity;
  if (inventory.coins < cost) return { ok: false, reason: 'coins' };
  const next: Inventory = { coins: inventory.coins - cost, ropes: { ...inventory.ropes }, potions: inventory.potions };
  if (item === 'potion') next.potions += quantity;
  else next.ropes[item] += quantity;
  return { ok: true, inventory: next, cost };
}

/** 회복약이 채우는 양: 최대 체력의 50%, 최소 30. 부족한 체력보다 많이 채우지는 않는다 */
export function potionHeal(hp: number, maxHp: number): number {
  const amount = Math.max(30, Math.floor(maxHp * 0.5));
  return Math.max(0, Math.min(amount, maxHp - hp));
}
