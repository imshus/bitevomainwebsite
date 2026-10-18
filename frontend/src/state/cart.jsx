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

const snapshot = p => ({ productId: p._id, name: p.name, price: p.price, image: p.image, isVeg: p.isVeg });

export function CartProvider({ children }) {
  const [state, setState] = useState(load);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: cart lasts for this visit */ }
  }, [state]);

  const toast = useToast();
  const latest = useRef(state);
  latest.current = state;

  const setQty = useCallback((productOrId, qty) => {
    const id = typeof productOrId === 'string' ? productOrId : productOrId._id;
    const n = Math.max(0, Math.min(MAX_QTY, qty));
    const before = latest.current;
    setState(s => {
      const exists = s.lines.some(l => l.productId === id);
      let lines;
      if (n === 0) lines = s.lines.filter(l => l.productId !== id);
      else if (exists) lines = s.lines.map(l => (l.productId === id ? { ...l, qty: n } : l));
      else if (typeof productOrId === 'object') lines = [...s.lines, { ...snapshot(productOrId), qty: n }];
      else return s;
      return { ...s, lines, coupon: lines.length ? s.coupon : '' };
    });

    // Taking a dish out of the cart can be undone for a few seconds (back in the same place).
    const removed = n === 0 && before.lines.find(l => l.productId === id);
    if (removed) {
      const at = before.lines.indexOf(removed);
      toast(`${removed.name} removed`, 'info', {
        action: {
          label: 'Undo',
          run: () => setState(s => (s.lines.some(l => l.productId === id) ? s : {
            ...s,
            lines: [...s.lines.slice(0, at), removed, ...s.lines.slice(at)],
            coupon: s.coupon || before.coupon,
          })),
        },
      });
    }
  }, [toast]);

  // Refreshes names, prices and photos from the latest menu (and drops dishes that were removed).
  const syncWithMenu = useCallback(products => {
    const byId = new Map(products.map(p => [p._id, p]));
    setState(s => {
      const lines = s.lines.filter(l => byId.has(l.productId)).map(l => ({ ...snapshot(byId.get(l.productId)), qty: l.qty }));
      const same = lines.length === s.lines.length && lines.every((l, i) => JSON.stringify(l) === JSON.stringify(s.lines[i]));
      return same ? s : { ...s, lines };
    });
  }, []);

  const value = useMemo(() => {
    const qtyOf = id => state.lines.find(l => l.productId === id)?.qty || 0;
    return {
      lines: state.lines,
      coupon: state.coupon,
      count: state.lines.reduce((s, l) => s + l.qty, 0),
      itemTotal: state.lines.reduce((s, l) => s + l.qty * l.price, 0),
      qtyOf,
      add: product => setQty(product, qtyOf(product._id) + 1),
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
