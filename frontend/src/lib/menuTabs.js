// The menu's five tabs and its filters. Every dish belongs to exactly one tab, worked out from what the
// admin panel already stores (price, type, category, name), so no new admin settings are needed:
//   ₹1 Store  - dishes priced ₹1 (or in a category named like "₹1 Store")
//   Combo     - combo dishes (or a category named "Combo…")
//   Drinks    - the Drinks category, plus shakes, coffee, lassi and the like from other categories
//   Food & Meals - everything else

export const TABS = [
  { key: 'all', label: 'All', title: 'All dishes' },
  { key: 'store', label: '1 Item', title: '₹1 Store', icon: '/assets/menu/icon-store.webp' },
  { key: 'meals', label: 'Food & Meals', title: 'Food and Meals', icon: '/assets/menu/icon-meals.webp' },
  { key: 'drinks', label: 'Drinks', title: 'Drinks', icon: '/assets/menu/icon-drinks.webp' },
  { key: 'combo', label: 'Combo', title: 'Combos', icon: '/assets/menu/icon-combo.webp' },
];
export const TAB_KEYS = TABS.map(t => t.key);
// The order the sections follow on the "All" tab.
export const FEED_ORDER = ['meals', 'drinks', 'combo', 'store'];

const STORE = /₹\s?1\b|\b1\s?item|rupee|rupay|\bstore\b/i;
const DRINK_CATEGORY = /^(drinks?|beverages?|shakes?|juices?)$/i;
// Whole words only ("Classic" must not count as "lassi", nor "chocolate" as "cola").
const DRINK_NAME = /\b(shakes?|milkshakes?|coffee|lassi|juices?|tea|chai|mojitos?|soda|cola|smoothies?|lemonade|drinks?|frappes?|coolers?|lattes?|mocktails?)\b/i;

export function tabOf(product, categoryLabel = '') {
  const category = `${product.category} ${categoryLabel}`;
  if (product.price <= 1 || STORE.test(category)) return 'store';
  if (product.type === 'combo' || /combo/i.test(category)) return 'combo';
  if (DRINK_CATEGORY.test(product.category) || DRINK_CATEGORY.test(categoryLabel.trim()) || DRINK_NAME.test(product.name)) return 'drinks';
  return 'meals';
}

export const NO_FILTERS = { diet: 'all', price: 'any', bestsellers: false, offers: false, fast: false, sort: 'relevance' };
export const FAST_MINS = 15;

export const PRICE_RANGES = [
  { key: 'any', label: 'Any price' },
  { key: 'u100', label: 'Under ₹100', test: p => p.price < 100 },
  { key: '100-200', label: '₹100 – ₹200', test: p => p.price >= 100 && p.price <= 200 },
  { key: 'o200', label: 'Above ₹200', test: p => p.price > 200 },
];

export const SORTS = [
  { key: 'relevance', label: 'Relevance' },
  { key: 'price-asc', label: 'Price: low to high' },
  { key: 'price-desc', label: 'Price: high to low' },
  { key: 'fast', label: 'Quickest to make' },
];

// How many of the sheet's filters are on (shown as a count on the Filters chip).
export const filterCount = f => [f.diet !== 'all', f.price !== 'any', f.bestsellers].filter(Boolean).length;

export function matches(product, f, query) {
  if (f.diet === 'veg' && !product.isVeg) return false;
  if (f.diet === 'nonveg' && product.isVeg) return false;
  if (f.bestsellers && !product.isBestseller) return false;
  if (f.offers && !(product.mrp > product.price)) return false;
  if (f.fast && !(product.prepTimeMins && product.prepTimeMins <= FAST_MINS)) return false;
  const range = PRICE_RANGES.find(r => r.key === f.price);
  if (range?.test && !range.test(product)) return false;
  const q = query.trim().toLowerCase();
  return !q || product.name.toLowerCase().includes(q) || product.description.toLowerCase().includes(q)
    || product.comboItems?.some(i => i.name.toLowerCase().includes(q));
}

// Sold-out dishes always go last; otherwise the chosen order (the menu's own order for "Relevance").
export function sortDishes(list, sort) {
  const by = {
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    fast: (a, b) => (a.prepTimeMins || 99) - (b.prepTimeMins || 99),
  }[sort];
  return [...list].sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable) || (by ? by(a, b) : 0));
}
