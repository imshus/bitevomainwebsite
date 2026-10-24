// The menu's five tabs, the same rules as the website (frontend/src/lib/menuTabs.js): every dish belongs to
// exactly one tab, worked out from what the admin panel already stores (price, type, category, name).
//   ₹1 Store  - dishes priced ₹1 (or in a category named like "₹1 Store")
//   Combo     - combo dishes (or a category named "Combo…")
//   Drinks    - the Drinks category, plus shakes, coffee, lassi and the like from other categories
//   Food & Meals - everything else

export const TABS = [
  { key: 'all', label: 'All', title: 'All dishes' },
  { key: 'store', label: '1 Item', title: '₹1 Store', icon: require('../assets/icon-store.webp') },
  { key: 'meals', label: 'Food & Meals', title: 'Food and Meals', icon: require('../assets/icon-meals.webp') },
  { key: 'drinks', label: 'Drinks', title: 'Drinks', icon: require('../assets/icon-drinks.webp') },
  { key: 'combo', label: 'Combo', title: 'Combos', icon: require('../assets/icon-combo.webp') },
];
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

export function matches(product, { vegOnly }, query) {
  if (vegOnly && !product.isVeg) return false;
  const q = query.trim().toLowerCase();
  return !q || product.name.toLowerCase().includes(q) || product.description.toLowerCase().includes(q)
    || product.comboItems?.some(i => i.name.toLowerCase().includes(q));
}

// Sold-out dishes always go last.
export const availableFirst = list => [...list].sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable));
