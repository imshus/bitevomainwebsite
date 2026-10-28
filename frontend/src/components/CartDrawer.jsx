// The floating "View cart" bar while there's something in the cart. The cart itself is the checkout
// page (pages/Checkout.jsx): the header's bag, the site menu and this bar all open it.
import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../state/cart.jsx';
import { useMenu } from '../state/menu.js';
import { money } from '../lib/format.js';
import { sized } from '../lib/photo.js';
import { Bag, ChevronRight } from './Icons.jsx';

// While a bar is fixed to the bottom of the screen, the page gets extra space at the end so the
// footer isn't hidden behind it.
export function useBottomBar(shown) {
  useEffect(() => {
    if (!shown) return;
    document.body.classList.add('has-bottom-bar');
    return () => document.body.classList.remove('has-bottom-bar');
  }, [shown]);
}

// Floating "View cart" bar on the menu (the home page).
const BAR_PAGES = ['/'];

export function CartBar() {
  const cart = useCart();
  const navigate = useNavigate();
  const { data: menu } = useMenu();
  const { pathname } = useLocation();

  // Keep names and prices in the cart up to date with the menu (this bar is on every page).
  useEffect(() => { if (menu) cart.syncWithMenu(menu.products); }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = Boolean(cart.count) && BAR_PAGES.includes(pathname);
  useBottomBar(shown);
  if (!shown) return null;
  // Savings against the menu's crossed-out prices (MRP), worked out from the current menu.
  const mrpOf = id => menu?.products.find(p => p._id === id)?.mrp;
  // MRP is the full plate's, so half plates don't count towards the saving.
  const saved = cart.lines.reduce((sum, l) => sum + (l.portion === 'half' ? 0 : Math.max(0, (mrpOf(l.productId) || 0) - l.price) * l.qty), 0);
  const thumb = cart.lines.find(l => l.image)?.image;
  return (
    <button type="button" className="cart-bar" onClick={() => navigate('/checkout')} aria-label={`View cart: ${cart.count} item${cart.count > 1 ? 's' : ''}, ${money(cart.itemTotal)}`}>
      <span className="cart-bar__thumb" aria-hidden="true">{thumb ? <img src={sized(thumb, 160, 120)} alt="" /> : <Bag />}</span>
      <span className="cart-bar__text">
        <span className="cart-bar__count">{cart.count} item{cart.count > 1 ? 's' : ''} · <b key={cart.itemTotal} className="pop">{money(cart.itemTotal)}</b></span>
        {saved > 0 && <span className="cart-bar__saved">You saved {money(saved)}</span>}
      </span>
      <span className="cart-bar__go">View Cart <ChevronRight /></span>
    </button>
  );
}
