// Google Maps Platform calls, made only from the server so the key stays private.
//  - Places API (New): autocomplete while the customer types, then the chosen place's details.
//  - Geocoding API: the address at a map pin (the customer's GPS position or where they dragged the map).
// Every answer is turned into one small address shape the website uses, with a delivery check.
import { config } from '../config.js';
import { HttpError } from './http.js';
import { getSettings } from './settings.js';
import { areaCheck } from './deliveryArea.js';

const PLACES = 'https://places.googleapis.com/v1';
const GEOCODE = 'https://maps.googleapis.com/maps/api/geocode/json';
const TIMEOUT_MS = 6000;

export const mapsEnabled = () => Boolean(config.maps.serverKey);

const unavailable = () => new HttpError(502, 'Location search isn’t working right now. Please type your address instead.');

async function google(url, init = {}) {
  let res;
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (err) {
    console.error(`Google Maps request failed: ${err.message}`);
    throw unavailable();
  }
  const data = await res.json().catch(() => null);
  const problem = data?.error?.message || (data?.status && !['OK', 'ZERO_RESULTS'].includes(data.status) && `${data.status} ${data.error_message || ''}`);
  if (!res.ok || problem) {
    console.error(`Google Maps error (${res.status}): ${problem || 'no details'}`);
    throw unavailable();
  }
  return data;
}

// A few hundred recent answers, so the same pin or place isn't paid for twice in a row.
function smallCache(size = 500) {
  const map = new Map();
  return {
    get: key => map.get(key),
    set(key, value) {
      map.set(key, value);
      if (map.size > size) map.delete(map.keys().next().value);
      return value;
    },
  };
}
const placeCache = smallCache();
const pinCache = smallCache();

// Straight-line distance in km.
export function distanceKm(a, b) {
  const rad = d => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

// Whether the kitchen delivers to a map place or saved address: inside the delivery areas when they're set
// (lib/deliveryArea.js), else within the radius of the kitchen. Without either, everywhere is fine.
// `message` says why not.
export function deliveryCheck(place) {
  const area = areaCheck(place);
  if (area) return { deliverable: area.inArea, distanceKm: null, radiusKm: null, message: area.message };
  const { kitchen, radiusKm } = config.maps;
  if (!kitchen || !radiusKm || place?.lat == null) return { deliverable: true, distanceKm: null, radiusKm: radiusKm || null, message: null };
  const km = Math.round(distanceKm(kitchen, place) * 10) / 10;
  const deliverable = km <= radiusKm;
  return { deliverable, distanceKm: km, radiusKm, message: deliverable ? null : `Service unavailable at this location: it’s ${km} km from our kitchen, and we deliver up to ${radiusKm} km away.` };
}

// Picks the admin panel's delivery zone whose name matches the place's area or city, if any.
async function suggestZone(names) {
  const { zones } = await getSettings();
  const wanted = names.filter(Boolean).map(n => n.toLowerCase());
  return zones.find(z => wanted.includes(z.toLowerCase()))
    || zones.find(z => wanted.some(n => n.length > 3 && (z.toLowerCase().includes(n) || n.includes(z.toLowerCase()))))
    || '';
}

// Places (New) and Geocoding name their address parts differently; both become { long, short, types }.
const parts = list => (list || []).map(c => ({ long: c.longText ?? c.long_name, short: c.shortText ?? c.short_name, types: c.types || [] }));
const pick = (list, ...types) => types.map(t => list.find(c => c.types.includes(t))?.long).find(Boolean) || '';
const PLUS_CODE = /^[23456789CFGHJMPQRVWX]{4,8}\+[23456789CFGHJMPQRVWX]{2,3},?\s*/;
const tidy = s => (s || '').replace(PLUS_CODE, '').replace(/,\s*India$/, '').trim();

async function shape({ components, lat, lng, formatted, name = '' }) {
  const c = parts(components);
  const area = pick(c, 'sublocality_level_1', 'neighborhood', 'sublocality', 'sublocality_level_2', 'locality');
  const city = pick(c, 'locality', 'administrative_area_level_3', 'administrative_area_level_2');
  const street = [pick(c, 'premise', 'street_number'), pick(c, 'route')].filter(Boolean).join(', ');
  const place = {
    lat: Math.round(lat * 1e6) / 1e6,
    lng: Math.round(lng * 1e6) / 1e6,
    name: name && name !== area && name !== city ? name : '',
    street,
    area,
    city,
    state: pick(c, 'administrative_area_level_1'),
    pincode: pick(c, 'postal_code'),
    formatted: tidy(formatted),
  };
  // A named place (a PG, office or society) leads the address line, as people would write it.
  if (place.name && !place.formatted.toLowerCase().includes(place.name.toLowerCase())) place.formatted = `${place.name}, ${place.formatted}`;
  place.line2 = [area, city !== area && city].filter(Boolean).join(', ');
  place.zone = await suggestZone([area, pick(c, 'sublocality_level_2'), pick(c, 'neighborhood'), city]);
  place.check = deliveryCheck(place);
  return place;
}

// ---- Calls -------------------------------------------------------------------------------

export async function autocomplete(input, { session, near } = {}) {
  const center = config.maps.kitchen || near;
  const body = {
    input,
    includedRegionCodes: ['in'],
    languageCode: 'en',
    ...(session && { sessionToken: session }),
    ...(center && { locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 30000 } } }),
    ...(center && { origin: { latitude: center.lat, longitude: center.lng } }),
  };
  const data = await google(`${PLACES}/places:autocomplete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': config.maps.serverKey },
    body: JSON.stringify(body),
  });
  return (data.suggestions || [])
    .map(s => s.placePrediction)
    .filter(Boolean)
    .slice(0, 6)
    .map(p => ({
      placeId: p.placeId,
      main: p.structuredFormat?.mainText?.text || p.text?.text || '',
      secondary: tidy(p.structuredFormat?.secondaryText?.text || ''),
      distanceKm: p.distanceMeters != null ? Math.round(p.distanceMeters / 100) / 10 : null,
    }));
}

export async function placeDetails(placeId, { session } = {}) {
  const cached = placeCache.get(placeId);
  if (cached) return { ...cached, check: deliveryCheck(cached) };
  const qs = new URLSearchParams({ languageCode: 'en', ...(session && { sessionToken: session }) });
  const p = await google(`${PLACES}/places/${encodeURIComponent(placeId)}?${qs}`, {
    headers: {
      'X-Goog-Api-Key': config.maps.serverKey,
      'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,addressComponents',
    },
  });
  if (!p.location) throw new HttpError(404, 'We couldn’t find that place. Try another search.');
  return placeCache.set(placeId, await shape({
    components: p.addressComponents,
    lat: p.location.latitude,
    lng: p.location.longitude,
    formatted: p.formattedAddress,
    name: p.displayName?.text,
  }));
}

export async function addressAt(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`; // about 10 m
  const cached = pinCache.get(key);
  if (cached) return { ...cached, lat, lng, check: deliveryCheck({ ...cached, lat, lng }) };
  const qs = new URLSearchParams({ latlng: `${lat},${lng}`, language: 'en', region: 'in', key: config.maps.serverKey });
  const data = await google(`${GEOCODE}?${qs}`);
  const results = data.results || [];
  const best = results.find(r => !r.types?.includes('plus_code')) || results[0];
  if (!best) throw new HttpError(404, 'We couldn’t find an address there. Move the pin a little and try again.');
  // The pin stays exactly where the customer put it; only the address text comes from Google.
  return pinCache.set(key, await shape({ components: best.address_components, lat, lng, formatted: best.formatted_address }));
}
