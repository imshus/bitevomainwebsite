// Menu content. Dish names, descriptions and photos are examples — replace with the real BiteVo menu.

export const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'biryani', label: 'Biryani' },
  { key: 'meals', label: 'Indian Meals' },
  { key: 'fastfood', label: 'Burgers & Pizza' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'sweets', label: 'Desserts & Drinks' },
];

export const DISHES = [
  { cat: 'biryani', name: 'Chicken Biryani', photo: '1631515243349-e0cb75fb8d3a', alt: 'Chicken biryani', desc: 'Fragrant basmati rice slow-cooked with tender chicken and whole spices.' },
  { cat: 'biryani', name: 'Dum Biryani', photo: '1589302168068-964664d93dc0', alt: 'Dum biryani', desc: 'Layered, sealed and cooked slowly on dum for deep flavour.' },
  { cat: 'biryani', name: 'Biryani Platter', photo: '1633945274405-b6c8069047b0', alt: 'Biryani platter', desc: 'A generous, family-size biryani made for sharing.' },

  { cat: 'meals', name: 'Butter Chicken', photo: '1603894584373-5ac82b2ae398', alt: 'Butter chicken', desc: 'Chargrilled chicken in a rich, creamy tomato gravy.' },
  { cat: 'meals', name: 'Paneer Tikka', photo: '1567188040759-fb8a883dc6d8', alt: 'Paneer tikka', desc: 'Smoky paneer cubes marinated in yogurt and spices.' },
  { cat: 'meals', name: 'Veg Thali', photo: '1742281258189-3b933879867a', alt: 'Thali with several dishes', desc: 'A complete meal with a little bit of everything.' },
  { cat: 'meals', name: 'Masala Dosa', photo: '1668236543090-82eba5ee5976', alt: 'Masala dosa with sambar and chutneys', desc: 'Crispy dosa with potato masala, sambar and chutneys.' },

  { cat: 'fastfood', name: 'Classic Burger', photo: '1568901346375-23c9450c58cd', alt: 'Burger with lettuce and tomato', desc: 'A juicy patty with fresh lettuce, tomato and house sauce.' },
  { cat: 'fastfood', name: 'Margherita Pizza', photo: '1513104890138-7c749659a591', alt: 'Margherita pizza', desc: 'Rich tomato sauce and melty cheese on a fresh base.' },
  { cat: 'fastfood', name: 'Loaded Pizza', photo: '1604382354936-07c5d9983bd3', alt: 'Pizza with toppings', desc: 'Piled high with toppings for serious cravings.' },
  { cat: 'fastfood', name: 'Grilled Wrap', photo: '1666819615040-eff5e52c778a', alt: 'Grilled wrap', desc: 'A soft wrap packed with grilled filling and crunchy veggies.' },

  { cat: 'snacks', name: 'Steamed Momos', photo: '1694923450868-b432a8ee52aa', alt: 'Steamed momos with chutney', desc: 'Soft dumplings served with a fiery red chutney.' },
  { cat: 'snacks', name: 'Samosa', photo: '1601050690597-df0568f70950', alt: 'Samosas with green chilli', desc: 'Golden, crisp pastry with a spiced potato filling.' },
  { cat: 'snacks', name: 'French Fries', photo: '1518013431117-eb1465fa5752', alt: 'French fries with ketchup', desc: 'Crispy, golden and perfectly salted.' },
  { cat: 'snacks', name: 'Hakka Noodles', photo: '1617622141675-d3005b9067c5', alt: 'Hakka noodles', desc: 'Wok-tossed noodles with crunchy vegetables.' },

  { cat: 'sweets', name: 'Indian Sweets', photo: '1758910536889-43ce7b3199fd', alt: 'Assorted Indian sweets', desc: 'A selection of classic mithai for your sweet tooth.' },
  { cat: 'sweets', name: 'Cookies & Cream Shake', photo: '1572490122747-3968b75cc699', alt: 'Cookies and cream shake', desc: 'Thick, creamy and loaded with cookie crumbs.' },
  { cat: 'sweets', name: 'Strawberry Shake', photo: '1579954115545-a95591f28bfc', alt: 'Strawberry shake', desc: 'Sweet, fruity and blended until smooth.' },
  { cat: 'sweets', name: 'Cold Coffee', photo: '1517701550927-30cf4ba1dba5', alt: 'Iced coffee', desc: 'Chilled, creamy coffee for an instant pick-me-up.' },
  { cat: 'sweets', name: 'Rose Lassi', photo: '1692620609860-be6717812f71', alt: 'Pink rose lassi', desc: 'Cool, creamy yogurt drink with a hint of rose.' },
];

// Home page "Popular picks"
export const POPULAR = [
  { name: 'Chicken Biryani', photo: '1631515243349-e0cb75fb8d3a', alt: 'Chicken biryani', desc: 'Fragrant, slow-cooked rice layered with spices.' },
  { name: 'Burgers', photo: '1586190848861-99aa4a171e90', alt: 'Burger with lettuce and tomato', desc: 'Loaded, juicy and made to grab on the go.' },
  { name: 'Pizza', photo: '1513104890138-7c749659a591', alt: 'Cheese pizza', desc: 'Hot, cheesy and baked fresh to order.' },
  { name: 'Thali', photo: '1742281258189-3b933879867a', alt: 'Indian thali', desc: 'A complete, wholesome meal that feels like home.' },
];

// Dishes that rotate on the hero plate
export const HERO_DISHES = [
  { name: 'Chicken Biryani', photo: '1589302168068-964664d93dc0', alt: 'Chicken biryani' },
  { name: 'Wood-fired Pizza', photo: '1565299624946-b28f40a0ae38', alt: 'Pizza' },
  { name: 'Classic Thali', photo: '1589778655375-3e622a9fc91c', alt: 'Indian thali' },
  { name: 'Steamed Momos', photo: '1694923450868-b432a8ee52aa', alt: 'Steamed momos' },
  { name: 'Masala Dosa', photo: '1694849789325-914b71ab4075', alt: 'Masala dosa' },
  { name: 'Cheese Burger', photo: '1568901346375-23c9450c58cd', alt: 'Cheese burger' },
];

// Small thumbnails circling the hero plate
export const ORBIT = [
  '1572490122747-3968b75cc699',
  '1626700051175-6818013e1d4f',
  '1666001120694-3ebe8fd207be',
  '1572802419224-296b0aeee0d9',
  '1604382354936-07c5d9983bd3',
  '1563379091339-03b21ab4a4f8',
];

// Scrolling photo strip on the home page
export const GALLERY = [
  { photo: '1633945274405-b6c8069047b0', alt: 'Biryani platter' },
  { photo: '1680993032090-1ef7ea9b51e5', alt: 'Thali with rice and curries' },
  { photo: '1625220194771-7ebdea0b70b9', alt: 'Fried momos' },
  { photo: '1631452180519-c014fe946bc7', alt: 'Curry with rice' },
  { photo: '1631452180539-96aca7d48617', alt: 'Table of Indian dishes' },
  { photo: '1553787499-6f9133860278', alt: 'Cold coffee shake' },
  { photo: '1762284513012-a00abd38c179', alt: 'Wrap with juice' },
  { photo: '1742281257687-092746ad6021', alt: 'Thali with side dishes' },
  { photo: '1593504049359-74330189a345', alt: 'Cheesy pizza' },
  { photo: '1716550781939-beb7d7247aae', alt: 'Biryani plate' },
  { photo: '1577805947697-89e18249d767', alt: 'Chocolate shake' },
  { photo: '1743517894265-c86ab035adef', alt: 'Dosa with dips' },
];
