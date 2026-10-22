import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../state/auth.jsx';
import { useCart } from '../state/cart.jsx';
import { Bag, User } from './Icons.jsx';
import Logo from './Logo.jsx';

export default function Header() {
  const { pathname } = useLocation();
  const { customer, ready, requireLogin } = useAuth();
  const cart = useCart();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => setOpen(false), [pathname]);

  // On phones, tapping anywhere outside the open menu (or pressing Escape) closes it.
  const header = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onTap = e => { if (!header.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onTap);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onTap);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const navClass = ({ isActive }) => (isActive ? 'is-current' : undefined);
  const firstName = customer?.name?.split(' ')[0];

  return (
    <header ref={header} className={`nav${scrolled ? ' is-scrolled' : ''}`} id="top">
      <div className="container nav__inner">
        <Link to="/" className="nav__logo" aria-label="BiteVo home">
          <Logo width={138} lazy />
        </Link>
        <nav className={`nav__links${open ? ' is-open' : ''}`} id="navLinks" aria-label="Main">
          <NavLink to="/" end className={navClass}>Menu</NavLink>
          {customer && <NavLink to="/orders" className={navClass}>My Orders</NavLink>}
          {customer && <NavLink to="/wallet" className={navClass}>Wallet</NavLink>}
          <NavLink to="/about" className={navClass}>About</NavLink>
          <NavLink to="/support" className={navClass}>Support</NavLink>
          <Link to="/" className="btn btn--red nav__cta">Order Now</Link>
        </nav>
        <div className="nav__actions">
          {ready && (customer ? (
            <Link to="/account" className="nav__icon nav__account" aria-label="My account">
              <User /><span>{firstName || 'Account'}</span>
            </Link>
          ) : (
            <button type="button" className="nav__icon nav__account" onClick={() => requireLogin()}>
              <User /><span>Sign in</span>
            </button>
          ))}
          <Link to="/checkout" className="nav__icon nav__cart" aria-label={`Cart, ${cart.count} item${cart.count === 1 ? '' : 's'}`}>
            <Bag />
            {cart.count > 0 && <span className="nav__badge" key={cart.count}>{cart.count}</span>}
          </Link>
          <button
            className="nav__toggle"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="navLinks"
            onClick={() => setOpen(o => !o)}
          >
            <span></span><span></span><span></span>
          </button>
        </div>
      </div>
    </header>
  );
}
