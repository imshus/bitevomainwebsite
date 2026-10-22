// The site's links in a drawer, opened from the ☰ in the menu page's red bar on phones, where the
// usual site header is hidden.
import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../state/auth.jsx';
import { useCart } from '../state/cart.jsx';
import Modal from './Modal.jsx';
import { Bag, User } from './Icons.jsx';

export default function SiteMenu({ onClose }) {
  const { customer, requireLogin } = useAuth();
  const cart = useCart();
  const firstName = customer?.name?.split(' ')[0];
  const navClass = ({ isActive }) => (isActive ? 'is-current' : undefined);

  return (
    <Modal onClose={onClose} label="Site menu" variant="drawer" className="site-menu">
      <Link to="/" className="site-menu__logo" onClick={onClose} aria-label="BiteVo home">
        <img src="/assets/logo-480.png" alt="BiteVo — Good Food, Better Mood" width="480" height="175" />
      </Link>
      <div className="site-menu__actions">
        {customer ? (
          <Link to="/account" className="site-menu__action" onClick={onClose}><User />{firstName || 'My account'}</Link>
        ) : (
          <button type="button" className="site-menu__action" onClick={() => { onClose(); requireLogin(); }}><User />Sign in</button>
        )}
        <Link to="/checkout" className="site-menu__action" onClick={onClose}>
          <Bag />Cart{cart.count > 0 && <span className="site-menu__count">{cart.count}</span>}
        </Link>
      </div>
      <nav className="site-menu__links" aria-label="Main">
        <NavLink to="/" end className={navClass} onClick={onClose}>Menu</NavLink>
        {customer && <NavLink to="/orders" className={navClass} onClick={onClose}>My Orders</NavLink>}
        {customer && <NavLink to="/wallet" className={navClass} onClick={onClose}>Wallet</NavLink>}
        <NavLink to="/refer" className={navClass} onClick={onClose}>Refer &amp; Earn</NavLink>
        <NavLink to="/about" className={navClass} onClick={onClose}>About</NavLink>
        <NavLink to="/support" className={navClass} onClick={onClose}>Support</NavLink>
      </nav>
    </Modal>
  );
}
