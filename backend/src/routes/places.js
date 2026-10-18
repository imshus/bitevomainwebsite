// Location search for picking a delivery address: suggestions while typing, a chosen place's details,
// and the address at a map pin. Open to guests too, so the menu can show where they're ordering to.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { badRequest, HttpError, text, MIN } from '../lib/http.js';
import { mapsEnabled, autocomplete, placeDetails, addressAt } from '../lib/maps.js';

export const router = Router();

router.use((req, res, next) => {
  if (!mapsEnabled()) throw new HttpError(503, 'Location search isn’t set up yet. Please type your address instead.');
  next();
});

router.use(rateLimit({
  windowMs: 10 * MIN, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false,
  message: { error: 'Too many location searches. Please wait a minute and try again.' },
}));

// Places bills a search and the place picked from it together when they share a session token.
const session = value => (/^[A-Za-z0-9_-]{8,36}$/.test(String(value || '')) ? String(value) : undefined);

function point(lat, lng, { required = true } = {}) {
  const p = { lat: Number(lat), lng: Number(lng) };
  const ok = lat !== undefined && lng !== undefined && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
  if (!ok && required) throw badRequest('That location doesn’t look right.');
  return ok ? p : undefined;
}

router.get('/search', async (req, res) => {
  const q = text(req.query.q, 100);
  if (q.length < 2) return res.json([]);
  res.json(await autocomplete(q, { session: session(req.query.session), near: point(req.query.lat, req.query.lng, { required: false }) }));
});

router.get('/reverse', async (req, res) => {
  const { lat, lng } = point(req.query.lat, req.query.lng);
  res.json(await addressAt(lat, lng));
});

router.get('/:placeId', async (req, res) => {
  if (!/^[A-Za-z0-9_-]{10,300}$/.test(req.params.placeId)) throw badRequest('That place doesn’t look right.');
  res.json(await placeDetails(req.params.placeId, { session: session(req.query.session) }));
});
