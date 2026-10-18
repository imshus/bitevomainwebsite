// Starter menu for offline development (JSON-file mode only). With MongoDB, the admin panel owns the
// menu, coupons and settings, and this file is never used. Same ids and prices as the panel's demo data.
import { store } from '../db/index.js';

const DAY = 86400000;
const seedId = (kind, n) => `66f0${kind}${n.toString(16).padStart(18, '0')}`;
const photo = id => `https://images.unsplash.com/photo-${id}?w=600&h=450&fit=crop&q=75&auto=format`;

const CATEGORIES = [
  ['biryani', 'Biryani'], ['meals', 'Indian Meals'], ['fastfood', 'Burgers & Pizza'],
  ['snacks', 'Snacks'], ['sweets', 'Desserts & Drinks'], ['combos', 'Combos'],
];

// [category, name, price, mrp, isVeg, photo, description, prepTimeMins, isAvailable, isBestseller, heading]
const PRODUCTS = [
  ['biryani', 'Chicken Biryani', 249, 279, false, '1631515243349-e0cb75fb8d3a', 'Fragrant basmati rice slow-cooked with tender chicken and whole spices.', 25, true, true, 'Chef’s special'],
  ['biryani', 'Dum Biryani', 279, 299, false, '1589302168068-964664d93dc0', 'Layered, sealed and cooked slowly on dum for deep flavour.', 30, true, false],
  ['biryani', 'Biryani Platter', 549, 599, false, '1633945274405-b6c8069047b0', 'A generous, family-size biryani made for sharing.', 35, false, false],
  ['meals', 'Butter Chicken', 289, null, false, '1603894584373-5ac82b2ae398', 'Chargrilled chicken in a rich, creamy tomato gravy.', 25, true, true],
  ['meals', 'Paneer Tikka', 229, null, true, '1567188040759-fb8a883dc6d8', 'Smoky paneer cubes marinated in yogurt and spices.', 20, true, false],
  ['meals', 'Veg Thali', 199, 229, true, '1742281258189-3b933879867a', 'A complete meal with a little bit of everything.', 20, true, false, 'Value meal'],
  ['meals', 'Masala Dosa', 129, null, true, '1668236543090-82eba5ee5976', 'Crispy dosa with potato masala, sambar and chutneys.', 15, true, false],
  ['fastfood', 'Classic Burger', 149, 169, false, '1568901346375-23c9450c58cd', 'A juicy patty with fresh lettuce, tomato and house sauce.', 15, true, true],
  ['fastfood', 'Margherita Pizza', 249, null, true, '1513104890138-7c749659a591', 'Rich tomato sauce and melty cheese on a fresh base.', 20, true, false],
  ['fastfood', 'Loaded Pizza', 349, 399, false, '1604382354936-07c5d9983bd3', 'Piled high with toppings for serious cravings.', 25, true, false, 'Extra cheesy'],
  ['fastfood', 'Grilled Wrap', 159, null, false, '1666819615040-eff5e52c778a', 'A soft wrap packed with grilled filling and crunchy veggies.', 12, true, false],
  ['snacks', 'Steamed Momos', 119, null, true, '1694923450868-b432a8ee52aa', 'Soft dumplings served with a fiery red chutney.', 15, true, true],
  ['snacks', 'Samosa', 49, null, true, '1601050690597-df0568f70950', 'Golden, crisp pastry with a spiced potato filling.', 10, true, false],
  ['snacks', 'French Fries', 99, null, true, '1518013431117-eb1465fa5752', 'Crispy, golden and perfectly salted.', 10, true, false],
  ['snacks', 'Hakka Noodles', 169, null, true, '1617622141675-d3005b9067c5', 'Wok-tossed noodles with crunchy vegetables.', 15, true, false],
  ['sweets', 'Indian Sweets', 149, null, true, '1758910536889-43ce7b3199fd', 'A selection of classic mithai for your sweet tooth.', 5, true, false],
  ['sweets', 'Cookies & Cream Shake', 159, null, true, '1572490122747-3968b75cc699', 'Thick, creamy and loaded with cookie crumbs.', 8, true, false],
  ['sweets', 'Strawberry Shake', 149, null, true, '1579954115545-a95591f28bfc', 'Sweet, fruity and blended until smooth.', 8, true, false],
  ['sweets', 'Cold Coffee', 129, null, true, '1517701550927-30cf4ba1dba5', 'Chilled, creamy coffee for an instant pick-me-up.', 5, true, false, 'New'],
  ['sweets', 'Rose Lassi', 99, null, true, '1692620609860-be6717812f71', 'Cool, creamy yogurt drink with a hint of rose.', 5, false, false],
];

export async function seedStarterMenu(now = Date.now()) {
  if ((await store.count('products')) > 0) return 0;
  const at = days => new Date(now - days * DAY).toISOString();
  const day = (offset, end) => {
    const d = new Date(now + offset * DAY);
    d.setHours(end ? 23 : 0, end ? 59 : 0, 0, 0);
    return d.toISOString();
  };

  await store.insertMany('categories', CATEGORIES.map(([key, label], i) => ({ _id: seedId('ca', i + 1), key, label, image: '', order: i + 1 })));

  const singles = PRODUCTS.map(([category, name, price, mrp, isVeg, img, description, prepTimeMins, isAvailable, isBestseller, heading = ''], i) => ({
    _id: seedId('a1', i + 1), type: 'single', name, heading, category, price, mrp, isVeg, description, prepTimeMins, isAvailable, isBestseller,
    image: photo(img), createdAt: at(150 + i), updatedAt: at(20 + i),
  }));
  const line = (name, qty = 1) => ({ productId: singles.find(p => p.name === name)._id, name, qty });
  const combos = [
    { _id: seedId('a1', 21), type: 'combo', name: 'Biryani Feast Combo', heading: 'Best value', category: 'combos', comboItems: [line('Chicken Biryani'), line('Samosa', 2), line('Cold Coffee')], price: 399, mrp: 476, isVeg: false, prepTimeMins: 25, isAvailable: true, isBestseller: true, description: 'Chicken biryani, two samosas and a cold coffee.', image: photo('1633945274405-b6c8069047b0'), createdAt: at(5), updatedAt: at(5) },
    { _id: seedId('a1', 22), type: 'combo', name: 'Burger Meal', heading: '', category: 'combos', comboItems: [line('Classic Burger'), line('French Fries'), line('Cold Coffee')], price: 299, mrp: 377, isVeg: false, prepTimeMins: 15, isAvailable: true, isBestseller: false, description: 'Classic burger with fries and a cold coffee.', image: photo('1568901346375-23c9450c58cd'), createdAt: at(8), updatedAt: at(8) },
  ];
  await store.insertMany('products', [...singles, ...combos]);

  const samosa = singles.find(p => p.name === 'Samosa');
  const coupon = (n, c) => ({ _id: seedId('c0', n), maxDiscount: null, freeItem: null, cashbackUnit: null, usageLimit: null, perUserLimit: 1, firstOrderOnly: false, isActive: true, startsAt: day(-30), expiresAt: day(60, true), createdAt: at(32), updatedAt: at(30), ...c });
  await store.insertMany('coupons', [
    coupon(1, { code: 'WELCOME50', description: 'Flat ₹50 off on your first BiteVo order', discountType: 'flat', discountValue: 50, minOrderValue: 199, usageLimit: 5000, firstOrderOnly: true }),
    coupon(2, { code: 'BITE20', description: '20% off up to ₹100', discountType: 'percent', discountValue: 20, maxDiscount: 100, minOrderValue: 299, usageLimit: 3000, perUserLimit: 3 }),
    coupon(3, { code: 'FREEDEL', description: 'Free delivery on orders above ₹149', discountType: 'free_delivery', discountValue: 0, minOrderValue: 149, perUserLimit: 5 }),
    coupon(8, { code: 'FREESAMOSA', description: 'A free Samosa on orders above ₹299', discountType: 'free_item', discountValue: 0, freeItem: { productId: samosa._id, name: 'Samosa', qty: 1 }, minOrderValue: 299, usageLimit: 1000, perUserLimit: 2 }),
    coupon(9, { code: 'WALLET10', description: '10% back in your BiteVo wallet', discountType: 'cashback', cashbackUnit: 'percent', discountValue: 10, maxDiscount: 50, minOrderValue: 249, usageLimit: 2000, perUserLimit: 3 }),
  ]);
  return singles.length + combos.length;
}
