// The ₹1 store's lock, shown on the menu's ₹1 Store section and in the cart: one ₹1 item per order, once
// the other items reach config.offers.storeUnlockAt. The server checks the same rule (backend/src/pricing.js).
import { Link } from 'react-router-dom';
import { useCart } from '../state/cart.jsx';
import { useConfig, useMenu } from '../state/menu.js';
import { tabOf } from '../lib/menuTabs.js';
import { money } from '../lib/format.js';

const Lock = ({ open }) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d={open ? 'M8 10.5V7a4 4 0 0 1 7.6-1.8' : 'M8 10.5V7a4 4 0 0 1 8 0v3.5'} />
  </svg>
);

function useStoreLock() {
  const cart = useCart();
  const { data: config } = useConfig();
  const { data: menu } = useMenu();
  const unlockAt = config?.offers?.storeUnlockAt || 0;
  if (!unlockAt || !menu) return null;
  const labels = new Map(menu.categories.map(c => [c.key, c.label]));
  const byId = new Map(menu.products.map(p => [p._id, p]));
  const isStore = line => {
    const p = byId.get(line.productId);
    return p ? tabOf(p, labels.get(p.category) || '') === 'store' : line.price <= 1;
  };
  const storeQty = cart.lines.filter(isStore).reduce((s, l) => s + l.qty, 0);
  const others = cart.lines.filter(l => !isStore(l)).reduce((s, l) => s + l.price * l.qty, 0);
  return { storeQty, moreNeeded: Math.max(0, unlockAt - others) };
}

export default function StoreLock({ onPick }) {
  const lock = useStoreLock();
  if (!lock) return null;
  const { storeQty, moreNeeded } = lock;

  if (storeQty > 1) {
    return <p className="store-lock store-lock--warn"><Lock /><span>Only <b>one ₹1 item</b> per order. Remove the extra to check out.</span></p>;
  }
  if (moreNeeded > 0) {
    return (
      <p className={`store-lock${storeQty ? ' store-lock--warn' : ''}`}>
        <Lock /><span>Add <b>{money(moreNeeded)}</b> more to unlock {storeQty ? 'your' : 'one'} ₹1 item</span>
      </p>
    );
  }
  return (
    <p className="store-lock store-lock--open">
      <Lock open />
      <span>{storeQty ? <>Your <b>₹1 item</b> is unlocked</> : <>You’ve unlocked <b>one ₹1 item</b>{onPick && <> · <Link to="/#store" onClick={onPick}>Pick it</Link></>}</>}</span>
    </p>
  );
}
