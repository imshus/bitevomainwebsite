import { Link } from 'react-router-dom';
import { Phone, Mail } from './Icons.jsx';

export const PHONE = '+91 93193 46656';
export const PHONE_HREF = 'tel:+919319346656';
export const EMAIL = 'info@bitevo.in';

const Instagram = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r=".6" /></svg>;
const Facebook = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 3h-2.5A4.5 4.5 0 0 0 8 7.5V10H5.5v4H8v7h4v-7h2.8l.7-4H12V7.8c0-.7.4-1 1-1h2Z" /></svg>;
const LinkedIn = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7" /></svg>;

// Put the page addresses here to show the buttons (empty ones stay hidden, so there are no dead links).
const SOCIAL = [
  { name: 'Instagram', href: '', icon: <Instagram /> },
  { name: 'Facebook', href: '', icon: <Facebook /> },
  { name: 'LinkedIn', href: '', icon: <LinkedIn /> },
];

const COLUMNS = [
  { title: 'Order', links: [['/', 'Menu'], ['/orders', 'My orders'], ['/wallet', 'Wallet'], ['/refer', 'Refer & earn']] },
  { title: 'Company', links: [['/about', 'About us'], ['/support', 'Help & support'], ['/account', 'My account']] },
  { title: 'Legal', links: [['/privacy', 'Privacy policy'], ['/terms', 'Terms of service']], inline: true },
];

export default function Footer() {
  const social = SOCIAL.filter(s => s.href);
  return (
    <footer className="footer" id="contact">
      <div className="container footer__inner">
        <div className="footer__brand">
          <p>Fresh, chef-made food, cooked when you order and delivered hot to your door.</p>
          <div className="footer__contact">
            <a href={PHONE_HREF}><Phone />{PHONE}</a>
            <a href={`mailto:${EMAIL}`}><Mail />{EMAIL}</a>
          </div>
          {social.length > 0 && (
            <div className="footer__social">
              {social.map(s => <a key={s.name} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.name}>{s.icon}</a>)}
            </div>
          )}
        </div>
        <nav className="footer__links" aria-label="Footer">
          {COLUMNS.map(col => (
            <div className={`footer__col${col.inline ? ' footer__col--inline' : ''}`} key={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map(([to, label]) => <li key={to}><Link to={to}>{label}</Link></li>)}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="footer__bottom">
        <div className="container footer__bottom-inner">
          <span>&copy; {new Date().getFullYear()} BiteVo. All rights reserved.</span>
          <span>Good food &middot; Better mood</span>
        </div>
      </div>
    </footer>
  );
}
