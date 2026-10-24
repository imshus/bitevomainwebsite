// The cart, kept on the phone until the order is placed (as the website keeps it in the browser).
// Each line keeps a snapshot of the dish for display; the server re-prices everything at checkout.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'bitevo_cart_v1';
const MAX_QTY = 20;
const CartContext = createContext(null);

const snapshot = p => ({ productId: p._id, name: p.name, price: p.price, image: p.image, isVeg: p.isVeg });

export function CartProvider({ children }) {
  const [state, setState] = useState({ lines: [], coupon: '' });
  const loaded = useRef(false);

  // Load the saved cart once, then save every change.
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(raw => {
        const saved = raw ? JSON.parse(raw) : null;
        if (Array.isArray(saved?.lines)) setState({ lines: saved.lines, coupon: saved.coupon || '' });
      })
      .catch(() => {})
      .finally(() => { loaded.current = true; });
  }, []);
  useEffect(() => {
    if (loaded.current) AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  const setQty = useCallback((productOrId, qty) => {
    const id = typeof productOrId === 'string' ? productOrId : productOrId._id;
    const n = Math.max(0, Math.min(MAX_QTY, qty));
    setState(s => {
      const exists = s.lines.some(l => l.productId === id);
      let lines;
      if (n === 0) lines = s.lines.filter(l => l.productId !== id);
      else if (exists) lines = s.lines.map(l => (l.productId === id ? { ...l, qty: n } : l));
      else if (typeof productOrId === 'object') lines = [...s.lines, { ...snapshot(productOrId), qty: n }];
      else return s;
      return { ...s, lines, coupon: lines.length ? s.coupon : '' };
    });
  }, []);

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
    };
  }, [state, setQty, syncWithMenu]);

  return createElement(CartContext.Provider, { value }, children);
}

export const useCart = () => useContext(CartContext);
