// Live order updates from the website API's WebSocket (/api/live, backend/src/live.js). It says
// { type: 'order', id, status } when one of the signed-in customer's orders changes anywhere (the kitchen in the
// admin panel, the rider app), so pages reload that order at once instead of at their next refresh. After the
// socket was down, { type: 'resync' }: something may have changed meanwhile.
// One socket for the whole page, open while something listens; it reconnects by itself, and while it's down the
// pages keep refreshing on their timers.
import { useEffect, useRef, useState } from 'react';

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const socketUrl = () => `${(BASE || window.location.origin).replace(/^http/, 'ws')}/api/live`;

const listeners = new Set();
const upListeners = new Set();
let socket = null;
let up = false;
let wasUp = false;
let retries = 0;
let retryTimer = null;

function setUp(value) {
  if (up === value) return;
  up = value;
  upListeners.forEach(l => l(value));
}

function schedule() {
  if (!listeners.size || retryTimer) return;
  const wait = Math.min(30000, 1000 * 2 ** retries++);
  retryTimer = setTimeout(() => {
    retryTimer = null;
    open();
  }, wait);
}

function open() {
  if (socket || !listeners.size || typeof WebSocket === 'undefined') return;
  let ws;
  try {
    ws = new WebSocket(socketUrl());
  } catch {
    schedule();
    return;
  }
  socket = ws;
  ws.onopen = () => {
    retries = 0;
    setUp(true);
    if (wasUp) listeners.forEach(l => l({ type: 'resync' }));
    wasUp = true;
  };
  ws.onmessage = e => {
    let message;
    try {
      message = JSON.parse(e.data);
    } catch {
      return;
    }
    if (message?.type === 'order') listeners.forEach(l => l(message));
  };
  ws.onclose = () => {
    if (socket === ws) socket = null;
    setUp(false);
    schedule();
  };
}

function close() {
  clearTimeout(retryTimer);
  retryTimer = null;
  retries = 0;
  wasUp = false;
  const ws = socket;
  socket = null;
  ws?.close();
  setUp(false);
}

// Calls onOrder(message) for each change to the customer's orders while `who` is set (the signed-in customer's
// id: a different customer opens a new socket). Returns whether the socket is up, so pages can refresh less
// often meanwhile.
export function useLiveOrders(onOrder, who) {
  const handler = useRef(onOrder);
  handler.current = onOrder;
  const [isUp, setIsUp] = useState(up);
  useEffect(() => {
    if (!who) return undefined;
    const listener = message => handler.current(message);
    listeners.add(listener);
    upListeners.add(setIsUp);
    setIsUp(up);
    open();
    return () => {
      listeners.delete(listener);
      upListeners.delete(setIsUp);
      if (!listeners.size) close();
    };
  }, [who]);
  return isUp;
}
