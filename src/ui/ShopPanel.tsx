import { useState } from 'react';
import type { SaveData } from '../game/save.ts';
import { ITEM_HELP, ITEM_NAMES, PRICES, SHOP_ITEMS, buy, maxAffordable, owned, type ShopItem } from '../game/shop.ts';

const REASON = { coins: '코인이 모자라요.', full: '더 가질 수 없어요.', invalid: '살 수 없어요.' } as const;

/** 상점 창: 물건 고르기 → 개수 → 사기. 저장은 onBuy로 바로 바뀐다 */
export function ShopPanel({ data, onBuy, onClose }: { data: SaveData; onBuy(next: SaveData, text: string): void; onClose(): void }) {
  const [item, setItem] = useState<ShopItem>('basic');
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const inv = { coins: data.coins, ropes: data.ropes, potions: data.potions };
  const max = maxAffordable(inv, item);

  const pick = (it: ShopItem) => { setItem(it); setQty(1); setNote(''); };
  const doBuy = () => {
    const r = buy(inv, item, qty);
    if (!r.ok) return setNote(REASON[r.reason]);
    const text = `${ITEM_NAMES[item]} ${qty}개를 ${r.cost}코인에 샀다!`;
    setNote(text);
    setQty(1);
    onBuy({ ...data, ...r.inventory }, text);
  };

  return (
    <div className="gm shop" role="dialog" aria-label="상점" onPointerDown={(e) => e.stopPropagation()}>
      <div className="gm-body">
        <h2>오디 상점</h2>
        <p className="shop-coins">코인 <b>{data.coins}</b></p>
        <ul className="shop-list">
          {SHOP_ITEMS.map((it) => (
            <li key={it}>
              <button type="button" className={it === item ? 'on' : ''} onClick={() => pick(it)}>
                <span className="shop-name">{ITEM_NAMES[it]}</span>
                <span className="shop-price">{PRICES[it]}코인</span>
                <small>{ITEM_HELP[it]} · 가진 수 {owned(inv, it)}</small>
              </button>
            </li>
          ))}
        </ul>
        <div className="shop-qty">
          <button type="button" aria-label="하나 덜" disabled={qty <= 1} onClick={() => setQty((q) => q - 1)}>−</button>
          <b>{qty}개 · {PRICES[item] * qty}코인</b>
          <button type="button" aria-label="하나 더" disabled={qty >= max} onClick={() => setQty((q) => q + 1)}>＋</button>
        </div>
        <button type="button" className="wide shop-buy" disabled={max < 1} onClick={doBuy}>{max < 1 ? '살 수 없어요' : '사기'}</button>
        {note && <p className="note" role="status">{note}</p>}
      </div>
      <button type="button" className="gm-close" aria-label="닫기" onClick={onClose}>✕</button>
    </div>
  );
}
