// The website's only connection to the BiteVo backend (Node.js API in ../backend).
// In development Vite forwards /api to the API (see vite.config.js); in production set VITE_API_URL
// to the API's address, e.g. https://api.bitevo.in.

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message, status = 0, data = null) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

// Called when the server says the session has ended (signed out elsewhere, expired, revoked).
let onUnauthorized = () => {};
export function setUnauthorizedHandler(handler) {
  onUnauthorized = handler;
}

async function request(method, path, body, { quiet401 } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api${path}`, {
      method,
      credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Can’t reach BiteVo right now. Check your internet connection and try again.');
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !quiet401) onUnauthorized();
    throw new ApiError(data?.error || `Something went wrong (${res.status}).`, res.status, data);
  }
  return data;
}

const get = (path, opts) => request('GET', path, undefined, opts);
const post = (path, body, opts) => request('POST', path, body ?? {}, opts);
const patch = (path, body) => request('PATCH', path, body);
const del = path => request('DELETE', path);

// Uploads an image (a File or Blob, e.g. from <input type="file" accept="image/*">) to POST /api/uploads.
// Resolves with { url, name, type, size }; `url` is a public link that works in any <img>.
async function uploadImage(file) {
  let res;
  try {
    res = await fetch(`${BASE}/api/uploads`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file });
  } catch {
    throw new ApiError('Can’t reach BiteVo right now. Check your internet connection and try again.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) onUnauthorized();
    throw new ApiError(data?.error || (res.status === 413 ? 'That image is too big (5 MB at most).' : `Upload failed (${res.status}).`), res.status, data);
  }
  return data;
}

// The page starts fetching the menu and site settings before this code has even arrived (see earlyStart in
// vite.config.js). The first ask for each uses that answer; if it failed, it asks again the usual way.
function early(path) {
  const started = window.__bitevoEarly?.[path];
  if (!started) return get(path);
  delete window.__bitevoEarly[path];
  return started.catch(() => get(path));
}

export const api = {
  uploadImage,
  config: () => early('/config'),
  menu: () => early('/menu'),
  offers: () => get('/offers', { quiet401: true }),
  support: message => post('/support', message),

  sendOtp: phone => post('/auth/otp', { phone }),
  verifyOtp: (phone, code, googleTicket) => post('/auth/verify', { phone, code, ...(googleTicket && { googleTicket }) }, { quiet401: true }),
  googleLogin: credential => post('/auth/google', { credential }, { quiet401: true }),
  sendEmailCode: email => post('/auth/email', { email }),
  verifyEmailCode: (email, code) => post('/auth/email/verify', { email, code }, { quiet401: true }),
  logout: () => post('/auth/logout'),

  me: () => get('/me', { quiet401: true }),
  updateMe: changes => patch('/me', changes),
  addAddress: address => post('/me/addresses', address),
  updateAddress: (id, address) => patch(`/me/addresses/${id}`, address),
  deleteAddress: id => del(`/me/addresses/${id}`),
  wallet: () => get('/me/wallet'),
  referralLookup: code => get(`/referrals/${encodeURIComponent(code)}`),
  myReferrals: () => get('/me/referrals'),
  applyReferral: code => post('/me/referrals/apply', { code }),
  deleteAccount: () => del('/me'),

  searchPlaces: (q, session) => get(`/places/search?${new URLSearchParams({ q, session })}`),
  place: (placeId, session) => get(`/places/${encodeURIComponent(placeId)}?${new URLSearchParams({ session })}`),
  placeAt: (lat, lng) => get(`/places/reverse?${new URLSearchParams({ lat, lng })}`),

  quote: cart => post('/orders/quote', cart, { quiet401: true }),
  payOnline: order => post('/orders/pay', order),
  placeOrder: order => post('/orders', order),
  orders: () => get('/orders'),
  order: id => get(`/orders/${id}`),
  cancelOrder: id => post(`/orders/${id}/cancel`),
  rateOrder: (id, rating) => post(`/orders/${id}/rating`, { rating }),
};
