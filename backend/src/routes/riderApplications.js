// "Become a delivery partner": the website's apply-online form (frontend/src/pages/DeliveryPartner.jsx).
// Applications are saved in `riderApplications` for the team to review in the admin panel (Rider applications),
// where approving one adds the person as a delivery agent with the ID check still to do. No sign-in needed.
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { store } from '../db/index.js';
import { config } from '../config.js';
import { badRequest, conflict, nowIso, text, MIN } from '../lib/http.js';
import { normalizePhone, clientIp } from '../lib/rules.js';
import { getSettings } from '../lib/settings.js';

export const router = Router();

// The admin panel keeps the vehicle types (settings "app" → vehicleTypes); these are its defaults.
const DEFAULT_VEHICLES = ['Bike', 'Scooter', 'E-bike', 'Bicycle'];
// A driving licence is needed for these (motor vehicles); not for a bicycle or a low-speed e-bike.
const NEEDS_LICENCE = /^(bike|motorbike|motorcycle|scooter)$/i;
const SHIFTS = ['Morning (7 am to 12 pm)', 'Afternoon (12 to 5 pm)', 'Evening (5 to 11 pm)', 'Full day', 'Weekends only'];
const ANY_AREA = 'Any of them';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OPEN = ['new', 'contacted'];

const digits = phone => String(phone || '').replace(/\D/g, '').slice(-10);

async function options() {
  const { vehicleTypes } = await getSettings();
  return {
    vehicleTypes: Array.isArray(vehicleTypes) && vehicleTypes.length ? vehicleTypes : DEFAULT_VEHICLES,
    areas: config.delivery.areas.length ? [...config.delivery.areas, ANY_AREA] : [],
    city: config.delivery.city,
    shifts: SHIFTS,
  };
}

// Five applications an hour from one address. Attempts the form turned back (a missing field) don't count.
const applyLimiter = rateLimit({
  windowMs: 60 * MIN, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, skipFailedRequests: true,
  message: { error: 'You’ve sent a few applications already. Please call us if something went wrong.' },
});

// What the form offers: vehicle types, areas and shifts.
router.get('/options', async (req, res) => {
  res.json(await options());
});

router.post('/', applyLimiter, async (req, res) => {
  const body = req.body || {};
  // A hidden field people never see; forms filled in by bots usually fill it. Answer as if it worked.
  if (text(body.website, 100)) return res.status(201).json({ ok: true });

  const { vehicleTypes, areas, shifts } = await options();
  const name = text(body.name, 60);
  const phone = normalizePhone(body.phone);
  const email = text(body.email, 120).toLowerCase();
  const vehicleType = vehicleTypes.find(v => v === body.vehicleType);
  const vehicleNumber = text(body.vehicleNumber, 15).toUpperCase();
  const area = areas.length ? areas.find(a => a === body.area) : '';
  const shift = shifts.find(s => s === body.shift);
  const experience = typeof body.experience === 'string' ? body.experience.trim().slice(0, 300) : '';

  if (name.length < 2) throw badRequest('Enter your full name.');
  if (!phone) throw badRequest('Enter a valid 10-digit mobile number.');
  if (email && !EMAIL.test(email)) throw badRequest('That email address doesn’t look right, or leave it empty.');
  if (body.adult !== true) throw badRequest('You need to be 18 or older to deliver with BiteVo.');
  if (!vehicleType) throw badRequest('Pick the vehicle you’ll deliver on.');
  const motor = NEEDS_LICENCE.test(vehicleType);
  if (vehicleType !== 'Bicycle' && vehicleNumber.replace(/\W/g, '').length < 4) throw badRequest('Enter your vehicle number, e.g. HR26 AB 1234.');
  if (motor && body.hasLicence !== true) throw badRequest(`A valid driving licence is needed to deliver on a ${vehicleType.toLowerCase()}.`);
  if (areas.length && !area) throw badRequest('Pick the area you’d like to deliver in.');
  if (!shift) throw badRequest('Pick the hours that suit you.');

  // Already a rider, or already applied (and not turned down yet)?
  const agents = await store.find('agents', {}, { projection: { phone: 1 } });
  if (agents.some(a => digits(a.phone) === digits(phone))) {
    throw conflict('This number is already a BiteVo delivery partner. Sign in to the BiteVo rider app with it.');
  }
  const [open] = await store.find('riderApplications', { phone, status: { $in: OPEN } }, { sort: { createdAt: -1 }, limit: 1 });
  if (open) throw conflict('We already have your application with this number. We’ll call you soon.');

  await store.insert('riderApplications', {
    name, phone, email,
    vehicleType, vehicleNumber: vehicleType === 'Bicycle' ? '' : vehicleNumber,
    hasLicence: motor ? true : body.hasLicence === true,
    area, shift, experience,
    status: 'new', // new → contacted → approved (becomes an agent) or rejected, in the admin panel
    source: 'web', ip: clientIp(req), createdAt: nowIso(),
  });
  res.status(201).json({ ok: true });
});
