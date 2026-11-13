// All backend settings come from environment variables, usually backend/.env (see .env.example).
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '..');
dotenv.config({ path: path.join(backendDir, '.env'), quiet: true });

// Accepts MONGODB_URI, or the MONGO_DB_URL / MONGO_DB_USER / MONGO_DB_PASSWORD trio (same as the admin panel).
function mongoUri() {
  const raw = (process.env.MONGODB_URI || process.env.MONGO_DB_URL || '').trim();
  if (!raw) return '';
  const user = process.env.MONGO_DB_USER;
  const pass = process.env.MONGO_DB_PASSWORD;
  const hasCredentials = /^mongodb(\+srv)?:\/\/[^/]*@/.test(raw);
  if (hasCredentials || !user || !pass) return raw;
  return raw.replace(/^(mongodb(\+srv)?:\/\/)/, `$1${encodeURIComponent(user)}:${encodeURIComponent(pass)}@`);
}

const list = value => (value || '').split(',').map(s => s.trim()).filter(Boolean);

// BiteVo's own websites may always call the API with cookies, besides any CLIENT_ORIGIN lists.
const SITE_ORIGINS = ['https://bitevo.in', 'https://www.bitevo.in'];
const num = (value, fallback) => (value !== undefined && value !== '' && Number.isFinite(Number(value)) ? Number(value) : fallback);

// The sender of customer emails: MAIL_FROM as given when it has an address; a name alone, or nothing, is paired
// with the mailbox's address (SMTP_USER).
function mailFrom(from, user) {
  const name = String(from || '').trim().replace(/^"(.*)"$/, '$1');
  const address = String(user || '').trim();
  if (name.includes('@')) return name;
  if (!address) return name;
  return `${name || 'BiteVo'} <${address}>`;
}

// A latitude or longitude: decimal ("28.4475"), or degrees, minutes and seconds as Google Maps shows them
// (28°26'51.0"N, 77°04'12.0"E; S and W are negative). Null for anything else. (parseFloat alone read
// 28°26'51.0"N as 28, putting the kitchen some 50 km away, so every address failed the delivery-radius check.)
function coordinate(value) {
  const m = String(value ?? '').trim()
    .match(/^(-?)(\d+(?:\.\d+)?)\s*°?\s*(?:(\d+(?:\.\d+)?)\s*['′’]\s*)?(?:(\d+(?:\.\d+)?)\s*(?:"|″|”|'')\s*)?([NSEW])?$/i);
  if (!m) return null;
  const n = (Number(m[2]) + (Number(m[3]) || 0) / 60 + (Number(m[4]) || 0) / 3600) * (m[1] || /[SW]/i.test(m[5] || '') ? -1 : 1);
  return Number.isFinite(n) ? Math.round(n * 1e6) / 1e6 : null;
}
const kitchenLat = coordinate(process.env.KITCHEN_LAT);
const kitchenLng = coordinate(process.env.KITCHEN_LNG);

// `--port 4001` on the command line wins over PORT (the dev script pins the API to 4001).
const argPort = Number(process.argv[process.argv.indexOf('--port') + 1] || 0) || 0;

export const config = {
  port: (process.argv.includes('--port') && argPort) || Number(process.env.PORT) || 4001,
  // The live site: started with `npm start` (which passes --live) or with NODE_ENV=production. It must have the
  // database (see server.js); `npm run dev` may use the local JSON file below.
  live: process.argv.includes('--live') || process.env.NODE_ENV === 'production',
  // ALLOW_FILE_STORE=true lets a live start use the local JSON file anyway (e.g. to try a build without a database).
  allowFileStore: process.env.ALLOW_FILE_STORE === 'true',
  mongoUri: mongoUri(),
  mongoDbName: process.env.MONGO_DB_NAME || 'bitevo',
  // Without MongoDB the API stores data in this JSON file instead (handy for offline work).
  dataFile: process.env.DATA_FILE || path.join(backendDir, 'data', 'db.json'),
  // Origins of the website allowed to call the API with cookies.
  // Browsers send an origin without a trailing slash, so "https://bitevo.in/" is accepted as "https://bitevo.in".
  clientOrigins: [...new Set([...list(process.env.CLIENT_ORIGIN || 'http://localhost:2002').map(o => o.replace(/\/+$/, '')), ...SITE_ORIGINS])],
  // Image uploads (POST /api/uploads) go to the same public Supabase Storage bucket the admin panel uses,
  // so every link works on the website, in the panel and in the app.
  supabase: {
    url: (process.env.SUPABASE_URL || '').replace(/\/+$/, ''),
    key: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
    bucket: process.env.SUPABASE_BUCKET || 'bitevo-images',
  },
  // Optional: lets a script or another server upload with an `x-upload-key` header instead of a customer sign-in.
  uploadApiKey: (process.env.UPLOAD_API_KEY || '').trim(),
  // Prefix for menu photos the admin panel uploaded (stored as /uploads/<file>).
  adminPublicUrl: (process.env.ADMIN_PUBLIC_URL || '').replace(/\/$/, ''),
  // Delivery fee (₹). 0 = free delivery on every order. Above 0: free on each customer's first
  // FREE_DELIVERY_ORDERS orders (cancelled ones don't count), then DELIVERY_FEE on every order.
  deliveryFee: num(process.env.DELIVERY_FEE, 0),
  freeDeliveryOrders: Math.max(0, num(process.env.FREE_DELIVERY_ORDERS, 3)),
  minOrderValue: num(process.env.MIN_ORDER_VALUE, 99),
  // The "Order more, save more" offers (see lib/offers.js). 0 switches one off.
  offers: {
    signupBonus: num(process.env.SIGNUP_BONUS, 20), // wallet coins for every new account
    deliveryCashback: num(process.env.DELIVERY_CASHBACK, 0), // wallet coins for every delivered order (0 = off: only the signup bonus)
    storeUnlockAt: num(process.env.STORE_UNLOCK_AT, 399), // other items needed before one ₹1 store item can be added
  },
  otpDevMode: process.env.OTP_DEV_MODE !== 'false',
  // Sign-in codes on WhatsApp/SMS through MiniMoth (see lib/sms.js). Used once OTP_DEV_MODE=false.
  sms: { minimothKey: (process.env.MINIMOTH_API_KEY || '').trim() },
  // Online payments through Razorpay (see lib/razorpay.js). Both keys set = "Pay online" at checkout. The admin
  // panel's and rider app's .env call them ROZERPAY_API / ROZERPAY_SECRET; those names work here too.
  razorpay: {
    keyId: (process.env.RAZORPAY_KEY_ID || process.env.ROZERPAY_API || '').trim(),
    keySecret: (process.env.RAZORPAY_KEY_SECRET || process.env.ROZERPAY_SECRET || '').trim(),
    // The secret of the webhook set up in the Razorpay dashboard for /api/payments/razorpay-webhook (optional).
    webhookSecret: (process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_WEBHOOK || process.env.ROZERPAY_WEBHOOK || '').trim(),
  },
  // Google Maps Platform. The server key is used only here, for place search, place details and
  // turning a map pin into an address. The browser key draws the map, so restrict it to the
  // website's domains in Google Cloud (it falls back to the server key, which is fine on localhost).
  maps: {
    serverKey: (process.env.GOOGLE_MAPS_KEY || '').trim(),
    browserKey: (process.env.GOOGLE_MAPS_BROWSER_KEY || process.env.GOOGLE_MAPS_KEY || '').trim(),
    // Optional: the kitchen's position and how far it delivers. Addresses further away are refused,
    // and searches favour places near the kitchen. Leave empty to skip the distance check.
    kitchen: kitchenLat != null && kitchenLng != null ? { lat: kitchenLat, lng: kitchenLng } : null,
    radiusKm: num(process.env.DELIVERY_RADIUS_KM, 0),
  },
  // The kitchen's name on the order page's live map (its pin is at KITCHEN_LAT / KITCHEN_LNG above).
  kitchenName: (process.env.KITCHEN_NAME || 'BiteVo Kitchen').trim(),
  // Road routes on the order page's live map, from an OSRM server: the same as the rider app's ROUTING_URL.
  // The public demo server is for light use; set your own for heavy traffic. Empty = a straight line.
  routingUrl: (process.env.ROUTING_URL ?? 'https://router.project-osrm.org').trim().replace(/\/+$/, ''),
  // About how long the kitchen takes to cook an order, in minutes: the order page's arrival time waits for it
  // when the delivery partner gets to the kitchen before the food is ready.
  prepMinutes: Math.max(0, num(process.env.PREP_MINUTES, 12)),
  // The business details on order invoices (lib/invoice.js). With GSTIN set the invoice is a "Tax invoice" that
  // splits the GST included in the prices (GST_RATE, 5% for restaurants) into CGST and SGST.
  business: {
    name: (process.env.BUSINESS_NAME || 'BiteVo').trim(),
    legalName: (process.env.BUSINESS_LEGAL_NAME || '').trim(),
    address: (process.env.BUSINESS_ADDRESS || '').replace(/\\n/g, '\n').trim(), // "\n" in .env starts a new line
    gstin: (process.env.GSTIN || '').trim().toUpperCase(),
    gstRate: Math.max(0, num(process.env.GST_RATE, 5)),
    fssai: (process.env.FSSAI_LICENSE || '').trim(),
    phone: (process.env.SUPPORT_PHONE || '+91 93193 46656').trim(),
    email: (process.env.SUPPORT_EMAIL || 'info@bitevo.in').trim(),
  },
  // Where the kitchen delivers: these areas of this city (see lib/deliveryArea.js); everywhere else shows
  // "Service unavailable". DELIVERY_AREAS set but empty = no area rule (then the distance above decides).
  delivery: {
    city: (process.env.DELIVERY_CITY ?? 'Gurugram').trim(),
    areas: list(process.env.DELIVERY_AREAS ?? 'Sector 40, Sector 44, Sector 45'),
  },
  // Public address of the website, used for links in emails.
  // This API's own public address, for links in emails (the invoice). Empty = the address the order request came
  // in on (set TRUST_PROXY=true behind a proxy, so it's https).
  apiUrl: (process.env.API_PUBLIC_URL || '').trim().replace(/\/+$/, ''),
  siteUrl: (process.env.SITE_URL || list(process.env.CLIENT_ORIGIN || 'http://localhost:2002')[0]).replace(/\/$/, ''),
  // "Continue with Google": the OAuth 2.0 Client ID (Web application) from Google Cloud. Empty = hidden.
  googleClientId: (process.env.GOOGLE_CLIENT_ID || '').trim(),
  // Signs the short-lived ticket that carries a Google sign-in over to the phone step. Set it in
  // production so tickets survive a restart; without it a random one is made at start-up.
  authSecret: process.env.AUTH_SECRET || crypto.randomBytes(32).toString('hex'),
  // Emails (welcome, order confirmations) from your Hostinger mailbox. Empty SMTP_PASS = no emails.
  mail: {
    host: process.env.SMTP_HOST || 'smtp.hostinger.com',
    port: num(process.env.SMTP_PORT, 465),
    user: (process.env.SMTP_USER || '').trim(),
    pass: process.env.SMTP_PASS || '',
    // "BiteVo <hello@bitevo.in>". A name alone ("BiteVo") gets the mailbox address added, since mail servers
    // refuse a sender without an address.
    from: mailFrom(process.env.MAIL_FROM, process.env.SMTP_USER),
  },
  // Refer & earn: a new customer signs up with a friend's code; once they have this many orders
  // delivered, the friend who invited them gets the reward in their wallet (as cashback).
  referral: {
    enabled: process.env.REFERRAL_ENABLED !== 'false',
    reward: num(process.env.REFERRAL_REWARD, 100),
    orders: Math.max(1, num(process.env.REFERRAL_ORDERS, 2)),
  },
  cookie: {
    name: 'bitevo_session',
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAMESITE || 'lax', // use "none" (with COOKIE_SECURE=true) when the site is on another domain
  },
  sessionDays: Number(process.env.SESSION_DAYS) || 30,
  trustProxy: process.env.TRUST_PROXY === 'true',
};
