// Whether BiteVo delivers to a map place or saved address. The rule comes from the API (`delivery` in
// /api/config, see backend/src/lib/deliveryArea.js): the address must name the city and one of the areas.
// Without a rule, the place's own check (distance from the kitchen) decides. Orders are checked again on
// the server, so this only decides what the page shows.
const textOf = p => [p.name, p.street, p.line1, p.line2, p.landmark, p.area, p.city, p.mapAddress, p.formatted, p.pincode]
  .filter(Boolean).join(', ');

export function deliversTo(place, config) {
  if (!place) return true;
  const rule = config?.delivery;
  if (!rule) return place.check?.deliverable !== false;
  const text = textOf(place);
  try {
    return (!rule.cityPattern || new RegExp(rule.cityPattern, 'i').test(text)) && rule.areaPatterns.some(p => new RegExp(p, 'i').test(text));
  } catch {
    return true; // a pattern this browser can't read: leave it to the server
  }
}

// The delivery area a place or address is in ("Sector 44"), or '' when it names none of them (or there's
// no area rule). The same check as areaOf() on the server; `anyCity` also accepts text that doesn't name
// the city (older addresses typed as "Q383, Sector 40").
export function areaOf(place, config, { anyCity = false } = {}) {
  const rule = config?.delivery;
  if (!place || !rule?.areas?.length) return '';
  const text = textOf(place);
  try {
    if (!anyCity && rule.cityPattern && !new RegExp(rule.cityPattern, 'i').test(text)) return '';
    const at = rule.areaPatterns.findIndex(p => new RegExp(p, 'i').test(text));
    return at >= 0 ? rule.areas[at] : '';
  } catch {
    return '';
  }
}

// "We deliver only to Sector 40, Sector 44 and Sector 45 in Gurugram for now."
export const whereWeDeliver = config => (config?.delivery ? `We deliver only to ${config.delivery.label} for now.` : 'This spot is outside our delivery range.');
