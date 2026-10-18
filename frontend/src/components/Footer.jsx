import { Link } from 'react-router-dom';

export const PHONE = '+91 93193 46656';
export const PHONE_HREF = 'tel:+919319346656';
export const EMAIL = 'info@bitevo.in';

export default function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="container footer__inner">
        <div className="footer__brand">
          <img src="/assets/logo-480.png" alt="BiteVo" width="480" height="175" />
          <p>Fresh, chef-made food delivered hot to your door.</p>
        </div>
        <div className="footer__col">
          <h4>Order</h4>
          <Link to="/menu">Menu</Link>
          <Link to="/orders">My Orders</Link>
          <Link to="/account">My Account</Link>
          <Link to="/refer">Refer &amp; Earn</Link>
        </div>
        <div className="footer__col">
          <h4>BiteVo</h4>
          <Link to="/">Home</Link>
          <Link to="/about">About Us</Link>
          <Link to="/support">Support</Link>
        </div>
        <div className="footer__col">
          <h4>Contact</h4>
          <a href={PHONE_HREF}>{PHONE}</a>
          <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
        </div>
        <div className="footer__col">
          <h4>Follow us</h4>
          {/* Replace # with your social media links */}
          <a href="#">Instagram</a>
          <a href="#">Facebook</a>
          <a href="#">LinkedIn</a>
        </div>
      </div>
      <div className="container footer__bottom">
        <span>&copy; {new Date().getFullYear()} BiteVo. All rights reserved.</span>
        <span className="footer__legal">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
          <Link to="/support">Support</Link>
        </span>
      </div>
    </footer>
  );
}
