// The cart, kept in this browser (localStorage) until the order is placed.
// Each line keeps a snapshot of the dish for display; the server re-prices everything at checkout.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useToast } from './toast.jsx';

const KEY = 'bitevo_cart_v1';
const MAX_QTY = 20;
const CartContext = createContext(null);

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return { lines: Array.isArray(saved?.lines) ? saved.lines : [], coupon: saved?.coupon || '' };
  } catch {
    return { lines: [], coupon: '' };
  }
}

// ₹1 store items: one per order (once the rest reaches ₹399, see StoreLock.jsx). Menu dishes carry their tab;
// anything else priced ₹1 counts too.
const isStoreItem = p => p.store ?? (p.tab ? p.tab === 'store' : p.price <= 1);

// Dishes with a half-plate price (set in the admin panel) are ordered as a half or a full plate: each portion
// is its own cart line ("Butter Chicken (Half)"). Other dishes have one line, keyed by the dish's id.
export const hasHalfPlate = p => p?.type !== 'combo' && p?.halfPrice > 0;
const lineKey = (productId, portion) => (portion === 'half' ? `${productId}:half` : productId);
export const keyOf = line => line.key || line.productId; // lines saved before half plates have no key
const portionOf = (p, portion) => (hasHalfPlate(p) ? (portion === 'half' ? 'half' : 'full') : undefined);
const snapshot = (p, portion) => {
  const which = portionOf(p, portion);
  return {
    key: lineKey(p._id, which), productId: p._id, ...(which && { portion: which }),
    name: which ? `${p.name} (${which === 'half' ? 'Half' : 'Full'})` : p.name,
    price: which === 'half' ? p.halfPrice : p.price, image: p.image, isVeg: p.isVeg, store: isStoreItem(p),
  };
};

export function CartProvider({ children }) {
  const [state, setState] = useState(load);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: cart lasts for this visit */ }
  }, [state]);

  const toast = useToast();
  const latest = useRef(state);
  latest.current = state;

  // `target` is a dish (with `portion` 'half' or 'full' for dishes that have a half plate) or a cart line's key.
  const setQty = useCallback((target, qty, portion) => {
    const product = typeof target === 'object' ? target : null;
    const key = product ? lineKey(product._id, portionOf(product, portion)) : target;
    const before = latest.current;
    const line = before.lines.find(l => keyOf(l) === key);
    const store = line ? isStoreItem(line) : Boolean(product) && isStoreItem(product);
    // Only one ₹1 item: never more than 1 of it, and picking another one swaps it in.
    const n = Math.max(0, Math.min(store ? 1 : MAX_QTY, qty));
    const swapped = store && n > 0 && !line && before.lines.find(l => keyOf(l) !== key && isStoreItem(l));
    setState(s => {
      const exists = s.lines.some(l => keyOf(l) === key);
      let lines;
      if (n === 0) lines = s.lines.filter(l => keyOf(l) !== key);
      else if (exists) lines = s.lines.map(l => (keyOf(l) === key ? { ...l, qty: n } : l));
      else if (product) {
        lines = [...s.lines.filter(l => !(store && isStoreItem(l))), { ...snapshot(product, portion), qty: n }];
      } else return s;
      return { ...s, lines, coupon: lines.length ? s.coupon : '' };
    });
    if (swapped) toast(`One ₹1 item per order: ${swapped.name} swapped for ${product.name}.`, 'info');

    // Taking a dish out of the cart can be undone for a few seconds (back in the same place).
    const removed = n === 0 && before.lines.find(l => keyOf(l) === key);
    if (removed) {
      const at = before.lines.indexOf(removed);
      toast(`${removed.name} removed`, 'info', {
        action: {
          label: 'Undo',
          run: () => setState(s => (s.lines.some(l => keyOf(l) === key) ? s : {
            ...s,
            lines: [...s.lines.slice(0, at), removed, ...s.lines.slice(at)],
            coupon: s.coupon || before.coupon,
          })),
        },
      });
    }
  }, [toast]);

  // Refreshes names, prices and photos from the latest menu (and drops dishes that were removed, and half
  // plates of dishes that no longer come as a half).
  const syncWithMenu = useCallback(products => {
    const byId = new Map(products.map(p => [p._id, p]));
    setState(s => {
      const lines = s.lines
        .filter(l => byId.has(l.productId) && (l.portion !== 'half' || hasHalfPlate(byId.get(l.productId))))
        .map(l => ({ ...snapshot({ ...byId.get(l.productId), store: l.store }, l.portion), qty: l.qty }));
      const same = lines.length === s.lines.length && lines.every((l, i) => JSON.stringify(l) === JSON.stringify(s.lines[i]));
      return same ? s : { ...s, lines };
    });
  }, []);

  const value = useMemo(() => {
    // How many of a dish are in the cart: of one portion, or of both together when `portion` is left out.
    const qtyOf = (id, portion) => state.lines
      .filter(l => l.productId === id && (!portion || (l.portion || 'full') === portion))
      .reduce((sum, l) => sum + l.qty, 0);
    return {
      maxQtyOf: product => (isStoreItem(product) ? 1 : MAX_QTY),
      lines: state.lines,
      coupon: state.coupon,
      count: state.lines.reduce((s, l) => s + l.qty, 0),
      itemTotal: state.lines.reduce((s, l) => s + l.qty * l.price, 0),
      qtyOf,
      add: (product, portion) => setQty(product, qtyOf(product._id, portionOf(product, portion)) + 1, portion),
      setQty,
      setCoupon: coupon => setState(s => ({ ...s, coupon })),
      clear: () => setState({ lines: [], coupon: '' }),
      syncWithMenu,
      open,
      setOpen,
    };
  }, [state, open, setQty, syncWithMenu]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
