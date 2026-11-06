import { describe, expect, it } from 'vitest';
import { buy, MAX_STACK, maxAffordable, potionHeal, PRICES, type Inventory } from './shop.ts';

const inv = (coins: number): Inventory => ({ coins, ropes: { basic: 1, sturdy: 0 }, potions: 0 });

describe('상점', () => {
  it('가격표', () => {
    expect(PRICES).toEqual({ basic: 50, sturdy: 150, potion: 80 });
  });
  it('구입하면 코인이 줄고 개수가 늘며 원본은 그대로', () => {
    const start = inv(400);
    const result = buy(start, 'sturdy', 2);
    expect(result).toMatchObject({ ok: true, cost: 300 });
    if (result.ok) {
      expect(result.inventory).toEqual({ coins: 100, ropes: { basic: 1, sturdy: 2 }, potions: 0 });
    }
    expect(start).toEqual(inv(400));
    const potion = buy(start, 'potion', 1);
    expect(potion.ok && potion.inventory.potions).toBe(1);
    const rope = buy(start, 'basic', 3);
    expect(rope.ok && rope.inventory.ropes.basic).toBe(4);
  });
  it('코인이 모자라면 거절', () => {
    expect(buy(inv(149), 'sturdy', 1)).toEqual({ ok: false, reason: 'coins' });
    expect(buy(inv(0), 'basic', 1)).toEqual({ ok: false, reason: 'coins' });
    expect(buy(inv(50), 'basic', 1).ok).toBe(true);
  });
  it('잘못된 수량과 최대 소지 수', () => {
    expect(buy(inv(999), 'basic', 0)).toEqual({ ok: false, reason: 'invalid' });
    expect(buy(inv(999), 'basic', -1)).toEqual({ ok: false, reason: 'invalid' });
    expect(buy(inv(999), 'basic', 1.5)).toEqual({ ok: false, reason: 'invalid' });
    expect(buy(inv(99999), 'potion', MAX_STACK + 1)).toEqual({ ok: false, reason: 'full' });
    expect(buy({ ...inv(99999), potions: MAX_STACK }, 'potion', 1)).toEqual({ ok: false, reason: 'full' });
  });
  it('살 수 있는 최대 개수', () => {
    expect(maxAffordable(inv(260), 'basic')).toBe(5);
    expect(maxAffordable(inv(10), 'basic')).toBe(0);
    expect(maxAffordable({ ...inv(99999), potions: 95 }, 'potion')).toBe(4);
  });
  it('회복약: 최대 체력의 50%, 최소 30, 부족분까지만', () => {
    expect(potionHeal(10, 100)).toBe(50);
    expect(potionHeal(10, 40)).toBe(30);
    expect(potionHeal(90, 100)).toBe(10);
    expect(potionHeal(20, 20)).toBe(0);
  });
});
