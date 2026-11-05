// Where BiteVo delivers: a few named areas of one city (DELIVERY_AREAS in DELIVERY_CITY, see config.js).
// A location is served when its address names the city and one of the areas, as a Google address does:
// "Tower B, Sector 44, Gurugram, Haryana 122003". The website applies the same rule to show "Service
// unavailable" (the patterns go out in /api/config), and orders are checked with it here.
import { config } from '../config.js';

// Other ways a city is written.
const CITY_NAMES = { gurugram: ['gurugram', 'gurgaon'], gurgaon: ['gurugram', 'gurgaon'] };
const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// "Sector 44" also matches "Sec 44", "sector-44" and "Sector 044", but not "Sector 4", "Sector 144" or "Sector 440".
// (No look-behind: Safari on older iPhones can't run it, and the website uses these patterns too.)
const START = '(?:^|[^a-z0-9])';
function areaPattern(name) {
  const sector = name.match(/^sec(?:tor)?\.?\s*-?\s*0*(\d+)$/i);
  if (sector) return `${START}sec(?:tor)?\\.?[\\s-]*0*${sector[1]}(?!\\d)`;
  return `${START}${escape(name.toLowerCase())}(?![a-z0-9])`;
}

function rule() {
  const { city, areas } = config.delivery;
  if (!areas.length) return null;
  const cityNames = CITY_NAMES[city.toLowerCase()] || (city ? [city.toLowerCase()] : []);
  return {
    city,
    areas,
    cityPattern: cityNames.length ? `${START}(?:${cityNames.map(escape).join('|')})(?![a-z0-9])` : '',
    areaPatterns: areas.map(areaPattern),
  };
}

// "Sector 40, Sector 44 and Sector 45 in Gurugram"
const areaList = r => `${r.areas.length > 1 ? `${r.areas.slice(0, -1).join(', ')} and ${r.areas.at(-1)}` : r.areas[0]}${r.city ? ` in ${r.city}` : ''}`;

// The rule as the website needs it (null when every area is served, i.e. DELIVERY_AREAS is empty).
export function deliveryAreaRule() {
  const r = rule();
  return r && { ...r, label: areaList(r) };
}

// Everything an address or map place says about where it is, as one line of text.
export const addressText = p => [p.name, p.street, p.line1, p.line2, p.landmark, p.area, p.city, p.mapAddress, p.formatted, p.pincode]
  .filter(Boolean).join(', ');

// { inArea, message } for a map place or saved address, or null when there's no area rule.
export function areaCheck(place) {
  const r = rule();
  if (!r) return null;
  const text = addressText(place || {});
  const inArea = (!r.cityPattern || new RegExp(r.cityPattern, 'i').test(text)) && r.areaPatterns.some(p => new RegExp(p, 'i').test(text));
  return { inArea, message: inArea ? null : `Service unavailable at this location. We deliver only to ${areaList(r)} for now.` };
}
