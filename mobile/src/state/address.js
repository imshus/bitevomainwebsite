// Which saved address the customer is ordering to, kept on the phone. The menu shows it (with "Service
// unavailable" when it's outside the delivery area) and checkout uses it.
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './auth';

const KEY = 'bitevo_address_id';
let currentId = null;
const listeners = new Set();
AsyncStorage.getItem(KEY).then(id => { currentId = id; listeners.forEach(fn => fn()); }).catch(() => {});

export function chooseAddress(id) {
  currentId = id || null;
  if (id) AsyncStorage.setItem(KEY, id).catch(() => {});
  else AsyncStorage.removeItem(KEY).catch(() => {});
  listeners.forEach(fn => fn());
}

// The chosen saved address, else the first one. Null when signed out or with no addresses yet.
export function useChosenAddress() {
  const { customer } = useAuth();
  const [, rerender] = useState(0);
  useEffect(() => {
    const fn = () => rerender(n => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  const addresses = customer?.addresses || [];
  const address = addresses.find(a => a._id === currentId) || addresses[0] || null;
  const choose = useCallback(id => chooseAddress(id), []);
  return [address, choose];
}
