// The cart: a drawer from the header's bag button, plus a floating bar while there's something in it.
import { useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCart } from '../state/cart.jsx';
import { useConfig, useMenu } from '../state/menu.js';
import { money } from '../lib/format.js';
import { sized } from '../lib/photo.js';
import Modal from './Modal.jsx';
import StoreLock from './StoreLock.jsx';
import { VegMark, Stepper } from './Dish.jsx';
import { Bag, ChevronRight } from './Icons.jsx';

export function CartDrawer() {
  const cart = useCart();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const { data: menu } = useMenu();

  // Keep names and prices in the cart up to date with the menu.
  useEffect(() => { if (menu) cart.syncWithMenu(menu.products); }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!cart.open) return null;
  const close = () => cart.setOpen(false);

  return (
    <Modal onClose={close} label="Your cart" variant="drawer" className="cart">
      <h2 className="cart__title">Your cart {cart.count > 0 && <span>{cart.count} item{cart.count > 1 ? 's' : ''}</span>}</h2>
      {cart.lines.length === 0 ? (
        <div className="empty">
          <div className="empty__icon"><Bag /></div>
          <h3>Your cart is empty</h3>
          <p>Good food is just a few taps away.</p>
          <Link to="/" className="btn btn--red" onClick={close}>Browse the menu</Link>
        </div>
      ) : (
        <>
          {config?.freeDeliveryOrders > 0 && (
            <div className="free-del">Free delivery on your <b>first {config.freeDeliveryOrders} orders</b>, then {money(config.deliveryFee)}</div>
          )}
          <StoreLock onPick={close} />
          <ul className="cart__lines">
            {cart.lines.map(l => (
              <li key={l.productId} className="line">
                {l.image ? <img src={sized(l.image, 120, 120)} alt="" loading="lazy" /> : <span className="line__ph" />}
                <div className="line__info">
                  <span className="line__name"><VegMark veg={l.isVeg} />{l.name}</span>
                  <span className="line__price">{money(l.price * l.qty)}</span>
                </div>
                <Stepper small qty={l.qty} label={l.name} onChange={n => cart.setQty(l.productId, n)} />
              </li>
            ))}
          </ul>
          <div className="cart__foot">
            <div className="cart__total"><span>Item total</span><b>{money(cart.itemTotal)}</b></div>
            <p className="cart__hint">Delivery, offers and wallet are applied at checkout.</p>
            <button className="btn btn--red btn--block btn--lg" onClick={() => { close(); navigate('/checkout'); }}>
              Checkout · {money(cart.itemTotal)}
            </button>
            <Link to="/" className="cart__more" onClick={close}>+ Add more dishes</Link>
          </div>
        </>
      )}
    </Modal>
  );
}

// While a bar is fixed to the bottom of the screen, the page gets extra space at the end so the
// footer isn't hidden behind it.
export function useBottomBar(shown) {
  useEffect(() => {
    if (!shown) return;
    document.body.classList.add('has-bottom-bar');
    return () => document.body.classList.remove('has-bottom-bar');
  }, [shown]);
}

// Floating "View cart" bar on the home and menu pages.
const BAR_PAGES = ['/'];

export function CartBar() {
  const cart = useCart();
  const { data: menu } = useMenu();
  const { pathname } = useLocation();
  const shown = Boolean(cart.count) && BAR_PAGES.includes(pathname) && !cart.open;
  useBottomBar(shown);
  if (!shown) return null;
  // Savings against the menu's crossed-out prices (MRP), worked out from the current menu.
  const mrpOf = id => menu?.products.find(p => p._id === id)?.mrp;
  const saved = cart.lines.reduce((sum, l) => sum + Math.max(0, (mrpOf(l.productId) || 0) - l.price) * l.qty, 0);
  const thumb = cart.lines.find(l => l.image)?.image;
  return (
    <button type="button" className="cart-bar" onClick={() => cart.setOpen(true)} aria-label={`View cart: ${cart.count} item${cart.count > 1 ? 's' : ''}, ${money(cart.itemTotal)}`}>
      <span className="cart-bar__thumb" aria-hidden="true">{thumb ? <img src={sized(thumb, 160, 120)} alt="" /> : <Bag />}</span>
      <span className="cart-bar__text">
        <span className="cart-bar__count">{cart.count} item{cart.count > 1 ? 's' : ''} · <b key={cart.itemTotal} className="pop">{money(cart.itemTotal)}</b></span>
        {saved > 0 && <span className="cart-bar__saved">You saved {money(saved)}</span>}
      </span>
      <span className="cart-bar__go">View Cart <ChevronRight /></span>
    </button>
  );
}
