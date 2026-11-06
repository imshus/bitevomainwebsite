// Live order status for the website: a WebSocket at /api/ws. A signed-in customer's pages open it and hear
// { type: 'order', id, status } whenever one of their orders changes: placed here; accepted, assigned or cancelled
// in the admin panel; accepted, picked up or delivered in the rider app; or the rider's position moving. The page
// then reloads that order through the API (GET /api/orders/:id), so what customers see is still shaped in one
// place (routes/orders.js), and the socket carries nothing but an order's id and status.
// The changes come from a MongoDB change stream on `orders`, so writes by the admin panel's and the rider app's
// APIs count as much as this API's own. Without MongoDB (the JSON demo store) there's no stream: pages refresh on a
// timer, as they also do whenever the socket is down.
// Behind nginx, /api/ws needs the WebSocket upgrade passed on (see README, Going live).
import { WebSocketServer } from 'ws';
import { store } from './db/index.js';
import { config } from './config.js';
import { findSession } from './auth.js';

const PATH = '/api/ws'; // the same path as the admin panel's live socket
const PING_MS = 25000; // keeps proxies from closing a quiet connection, and finds dead ones
const COALESCE_MS = 1000; // the rider's position moves an order every few seconds: one message a second at most
const RESTART_MS = 5000;

// "a=1; b=2" → { a: '1', b: '2' }
function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    const key = i > 0 ? part.slice(0, i).trim() : '';
    if (!key || key in out) continue;
    const value = part.slice(i + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

// The site's own pages (CLIENT_ORIGIN, bitevo.in), and any localhost page while developing (no secure cookies).
const devOrigin = origin => /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const originAllowed = origin => !origin || config.clientOrigins.includes(origin) || (!config.cookie.secure && devOrigin(origin));

function refuse(socket, status, text) {
  socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}

export function startLive(server) {
  if (typeof store.watch !== 'function') {
    console.log('Live order updates: off without MongoDB (order pages refresh on a timer).');
    return null;
  }
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const sockets = new Map(); // customerId → Set of open sockets

  server.on('upgrade', async (req, socket, head) => {
    let path = '';
    try {
      path = new URL(req.url, 'http://localhost').pathname;
    } catch {
      // not a URL: refused below
    }
    if (path !== PATH) return refuse(socket, 404, 'Not Found');
    if (!originAllowed(req.headers.origin)) return refuse(socket, 403, 'Forbidden');
    const found = await findSession({ cookies: parseCookies(req.headers.cookie) }).catch(() => null);
    if (!found) return refuse(socket, 401, 'Unauthorized');
    wss.handleUpgrade(req, socket, head, ws => {
      const customerId = String(found.customer._id);
      if (!sockets.has(customerId)) sockets.set(customerId, new Set());
      sockets.get(customerId).add(ws);
      ws.alive = true;
      ws.on('pong', () => { ws.alive = true; });
      ws.on('error', () => ws.terminate());
      ws.on('close', () => {
        const set = sockets.get(customerId);
        set?.delete(ws);
        if (!set?.size) sockets.delete(customerId);
      });
      ws.send(JSON.stringify({ type: 'hello' }));
    });
  });

  const ping = setInterval(() => {
    for (const set of sockets.values()) {
      for (const ws of set) {
        if (!ws.alive) {
          ws.terminate();
          continue;
        }
        ws.alive = false;
        ws.ping();
      }
    }
  }, PING_MS);
  ping.unref();

  // The latest status of each changed order, sent once per COALESCE_MS.
  const pending = new Map(); // orderId → { customerId, status }
  let flushTimer = null;
  const flush = () => {
    flushTimer = null;
    for (const [id, { customerId, status }] of pending) {
      const message = JSON.stringify({ type: 'order', id, status });
      for (const ws of sockets.get(customerId) || []) if (ws.readyState === ws.OPEN) ws.send(message);
    }
    pending.clear();
  };

  let stream = null;
  const watch = () => {
    stream = store.watch('orders', [{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }], { fullDocument: 'updateLookup' });
    stream.on('change', change => {
      const order = change.fullDocument;
      if (!order?.customerId) return;
      const customerId = String(order.customerId);
      if (!sockets.has(customerId)) return;
      pending.set(String(order._id), { customerId, status: order.status });
      flushTimer ??= setTimeout(flush, COALESCE_MS);
    });
    stream.once('error', err => {
      console.error(`Live order updates: the change stream stopped (${err.message}); retrying in ${RESTART_MS / 1000} s.`);
      stream.close().catch(() => {});
      setTimeout(watch, RESTART_MS).unref();
    });
  };
  watch();
  console.log(`Live order updates: ${PATH} (WebSocket)`);

  return {
    close() {
      clearInterval(ping);
      stream?.close().catch(() => {});
      for (const set of sockets.values()) for (const ws of set) ws.terminate();
      wss.close();
    },
  };
}
