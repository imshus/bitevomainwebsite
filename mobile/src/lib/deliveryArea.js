// Whether BiteVo delivers to a saved address, by the rule the API sends in /config (`delivery`, see
// backend/src/lib/deliveryArea.js): the address must name the city and one of the areas (Sector 40, 44 or 45
// in Gurugram). The server checks again when an order is placed, so this only decides what the app shows.
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
    return true; // a pattern this phone can't read: leave it to the server
  }
}

// "We deliver only to Sector 40, Sector 44 and Sector 45 in Gurugram for now."
export const whereWeDeliver = config => (config?.delivery ? `We deliver only to ${config.delivery.label} for now.` : 'This address is outside our delivery range.');
