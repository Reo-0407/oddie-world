import { useState } from 'react';
import { speciesById } from '../data/index.ts';
import type { OwnedOddie } from '../game/owned.ts';
import {
  buy, ITEM_HELP, ITEM_NAMES, maxAffordable, owned, PRICES, SHOP_ITEMS, type Inventory, type ShopItem,
} from '../game/shop.ts';

interface ShopProps {
  inventory: Inventory;
  onChange: (next: Inventory) => void;
  onClose: () => void;
}

/** 상점: 로프, 튼튼한 로프, 회복약을 코인으로 산다 */
export function ShopOverlay({ inventory, onChange, onClose }: ShopProps) {
  const [quantities, setQuantities] = useState<Record<ShopItem, number>>({ basic: 1, sturdy: 1, potion: 1 });
  const [note, setNote] = useState('어서 와! 뭘 살래?');

  const setQuantity = (item: ShopItem, quantity: number) => {
    const limit = Math.max(1, maxAffordable(inventory, item));
    setQuantities({ ...quantities, [item]: Math.min(Math.max(1, quantity), Math.max(limit, 1)) });
  };

  const purchase = (item: ShopItem) => {
    const quantity = Math.min(quantities[item], Math.max(1, maxAffordable(inventory, item)));
    const result = buy(inventory, item, quantity);
    if (result.ok) {
      onChange(result.inventory);
      setNote(`${ITEM_NAMES[item]} ${quantity}개를 샀어! (-${result.cost}코인)`);
      setQuantities({ ...quantities, [item]: 1 });
    } else if (result.reason === 'coins') {
      setNote('코인이 부족해!');
    } else if (result.reason === 'full') {
      setNote('더 이상 들고 다닐 수 없어!');
    } else {
      setNote('수량을 확인해 줘.');
    }
  };

  return (
    <div className="panel-overlay" role="dialog" aria-label="상점">
      <div className="panel">
        <h2>상점</h2>
        <p className="coins">보유 코인 <strong>{inventory.coins}</strong></p>
        <p className="note" aria-live="polite">{note}</p>
        {SHOP_ITEMS.map((item) => {
          const quantity = quantities[item];
          const total = PRICES[item] * quantity;
          const affordable = inventory.coins >= total;
          return (
            <div key={item} className="shop-row">
              <div className="shop-info">
                <strong>{ITEM_NAMES[item]}</strong> <small>{PRICES[item]}코인 · 가진 수 {owned(inventory, item)}</small>
                <small className="help">{ITEM_HELP[item]}</small>
              </div>
              <div className="shop-buy">
                <button aria-label="수량 줄이기" onClick={() => setQuantity(item, quantity - 1)}>-</button>
                <span className="qty">{quantity}</span>
                <button aria-label="수량 늘리기" onClick={() => setQuantity(item, quantity + 1)}>+</button>
                <button className={affordable ? '' : 'poor'} onClick={() => purchase(item)}>
                  {affordable ? `사기 (${total})` : '코인 부족'}
                </button>
              </div>
            </div>
          );
        })}
        <button className="wide" onClick={onClose}>나가기</button>
      </div>
    </div>
  );
}

interface HealerProps {
  team: OwnedOddie[];
  onHeal: () => void;
  onClose: () => void;
}

/** 회복소: 무료. 팀 전체가 회복된다(전투가 끝나면 자동으로도 회복되므로 연출에 가깝다) */
export function HealerOverlay({ team, onHeal, onClose }: HealerProps) {
  const [healed, setHealed] = useState(false);
  return (
    <div className="panel-overlay" role="dialog" aria-label="회복소">
      <div className="panel">
        <h2>회복소</h2>
        <p className="note" aria-live="polite">
          {healed ? '모두 건강해졌어! 또 놀러 와.' : '쉬었다 갈래? 무료야.'}
        </p>
        <ul className="team-list">
          {team.map((oddie, index) => (
            <li key={index}>{speciesById(oddie.speciesId).name} Lv.{oddie.level} {healed ? '· 체력 가득' : ''}</li>
          ))}
        </ul>
        {!healed && (
          <button className="wide" onClick={() => { setHealed(true); onHeal(); }}>팀 모두 회복하기</button>
        )}
        <button className="wide" onClick={onClose}>나가기</button>
      </div>
    </div>
  );
}
