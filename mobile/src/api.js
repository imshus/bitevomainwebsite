// The app's only connection to the BiteVo backend: the same API (and the same account cookie) as the website.
// React Native keeps the sign-in cookie between launches by itself.
import { API_URL } from './config';

const TIMEOUT_MS = 20000;

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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res;
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(body !== undefined && { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError('Can’t reach BiteVo right now. Check your internet connection and try again.');
  } finally {
    clearTimeout(timer);
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

export const api = {
  config: () => get('/config'),
  menu: () => get('/menu'),
  offers: () => get('/offers', { quiet401: true }),

  sendOtp: phone => post('/auth/otp', { phone }),
  verifyOtp: (phone, code) => post('/auth/verify', { phone, code }, { quiet401: true }),
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
  applyReferral: code => post('/me/referrals/apply', { code }),

  quote: cart => post('/orders/quote', cart, { quiet401: true }),
  placeOrder: order => post('/orders', order),
  orders: () => get('/orders'),
  order: id => get(`/orders/${id}`),
  cancelOrder: id => post(`/orders/${id}/cancel`),
};
