// Live order status for the website: a WebSocket at /api/ws. A signed-in customer's pages open it and hear
// { type: 'order', id, status } whenever one of their orders changes: placed here; accepted, assigned or cancelled
// in the admin panel; accepted, picked up or delivered in the rider app; or the rider's position moving. The page
// then reloads that order through the API (GET /api/orders/:id), so what customers see is still shaped in one
// place (routes/orders.js), and the socket carries nothing but an order's id and status.
// The changes come from MongoDB change streams, so writes by the admin panel's and the rider app's APIs count as
// much as this API's own: `orders` for the order itself, and `agents` for the rider's position, which the rider app
// saves on the rider (agents.location) while heading to the kitchen; each position update goes to the customers
// whose live orders that rider has. Without MongoDB (the JSON demo store) there's no stream: pages refresh on a
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
const LIVE_STATUSES = ['placed', 'preparing', 'out_for_delivery'];

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
      if (!sockets.has(customerId)) {
        sockets.set(customerId, new Set());
        // Their live orders that already have a rider: that rider's position updates are for them.
        store.find('orders', { customerId, status: { $in: LIVE_STATUSES } })
          .then(orders => orders.forEach(track), () => {});
      }
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

  const queue = (orderId, customerId, status) => {
    pending.set(orderId, { customerId, status });
    flushTimer ??= setTimeout(flush, COALESCE_MS);
  };

  // Which connected customers' live orders each rider has: riderId → Map(orderId → { customerId, status }).
  const riding = new Map();
  const riderOf = new Map(); // orderId → riderId
  function track(order) {
    const id = String(order._id);
    const customerId = String(order.customerId);
    const riderId = order.agentId && LIVE_STATUSES.includes(order.status) ? String(order.agentId) : null;
    const before = riderOf.get(id);
    if (before && before !== riderId) {
      riding.get(before)?.delete(id);
      if (!riding.get(before)?.size) riding.delete(before);
    }
    if (!riderId || !sockets.has(customerId)) {
      riderOf.delete(id);
      return;
    }
    if (!riding.has(riderId)) riding.set(riderId, new Map());
    riding.get(riderId).set(id, { customerId, status: order.status });
    riderOf.set(id, riderId);
  }

  const streams = [];
  const watch = (collection, pipeline, options, onChange) => {
    const stream = store.watch(collection, pipeline, options);
    streams.push(stream);
    stream.on('change', onChange);
    stream.once('error', err => {
      console.error(`Live order updates: the ${collection} change stream stopped (${err.message}); retrying in ${RESTART_MS / 1000} s.`);
      streams.splice(streams.indexOf(stream), 1);
      stream.close().catch(() => {});
      setTimeout(() => watch(collection, pipeline, options, onChange), RESTART_MS).unref();
    });
  };
  watch('orders', [{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }], { fullDocument: 'updateLookup' }, change => {
    const order = change.fullDocument;
    if (!order?.customerId) return;
    const customerId = String(order.customerId);
    if (!sockets.has(customerId) && !riderOf.has(String(order._id))) return;
    track(order);
    if (sockets.has(customerId)) queue(String(order._id), customerId, order.status);
  });
  // The rider app saving a rider's position (agents.location): only the rider's id is needed.
  watch('agents', [
    { $match: { operationType: 'update', 'updateDescription.updatedFields.location': { $exists: true } } },
    { $project: { documentKey: 1 } },
  ], {}, change => {
    const orders = riding.get(String(change.documentKey?._id));
    for (const [orderId, { customerId, status }] of orders || []) {
      if (sockets.has(customerId)) queue(orderId, customerId, status);
    }
  });
  console.log(`Live order updates: ${PATH} (WebSocket)`);

  return {
    close() {
      clearInterval(ping);
      for (const stream of streams) stream.close().catch(() => {});
      for (const set of sockets.values()) for (const ws of set) ws.terminate();
      wss.close();
    },
  };
}
