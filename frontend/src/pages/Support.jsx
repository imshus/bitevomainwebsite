import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { PageHero } from '../components/Sections.jsx';
import { Phone, Mail, Check } from '../components/Icons.jsx';
import { PHONE, PHONE_HREF, EMAIL } from '../components/Footer.jsx';
import usePageTitle from '../lib/usePageTitle.js';

const FAQS = [
  { q: 'Where is my order?', a: <>Open <Link to="/orders">My Orders</Link> to follow it live. If it's taking longer than expected, call us on <a href={PHONE_HREF}>{PHONE}</a> with your order ID and we'll check right away.</> },
  { q: 'Something is wrong or missing in my order', a: "We're sorry about that! Please contact us as soon as possible with your order ID and, if you can, a photo of the issue. We'll make it right." },
  { q: 'Can I cancel my order?', a: <>Yes — until the kitchen accepts it, you can cancel from the order's page in <Link to="/orders">My Orders</Link>. After that, call us as soon as you can and we'll do our best to help.</> },
  { q: 'When will I get my refund?', a: 'Anything you paid from your BiteVo wallet goes straight back to it. Other approved refunds go back to your original payment method; how long that takes depends on your bank or payment provider.' },
  { q: 'Which payment methods do you accept?', a: 'On the website you can pay on delivery, in cash or by UPI, and use your BiteVo wallet balance. All the options available to you are shown at checkout.' },
  { q: 'Do you deliver to my area?', a: 'When you add a delivery address at checkout, you pick from the areas we currently deliver to.' },
  { q: 'How do I delete my account or my data?', a: <>Go to <Link to="/account">My Account</Link> and choose <b>Delete account</b>, just above Sign out. You can also email us at <a href={`mailto:${EMAIL}`}>{EMAIL}</a> from your registered email, or call us, and we'll take care of it. See our <Link to="/privacy">Privacy Policy</Link> for more.</> },
];

const TOPICS = ['Order issue', 'Payment or refund', 'Delivery', 'Account', 'Feedback', 'Other'];

function ContactForm() {
  const { customer } = useAuth();
  const [params] = useSearchParams();
  const order = params.get('order') || '';
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async e => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api.support({ name: d.get('name'), phone: d.get('phone'), topic: d.get('topic'), orderNo: d.get('order'), message: d.get('message') });
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div className="form form--sent">
        <span className="placed-banner__tick"><Check /></span>
        <h3>Thanks — we've got your message</h3>
        <p>Our support team will get back to you soon. If it's urgent, call us on <a href={PHONE_HREF}>{PHONE}</a>.</p>
      </div>
    );
  }

  return (
    // key: refill the defaults once the signed-in customer is known
    <form className="form" onSubmit={submit} key={customer?._id || 'guest'}>
      <div className="form__row">
        <label>Your name
          <input type="text" name="name" autoComplete="name" defaultValue={customer?.name || ''} required />
        </label>
        <label>Phone number
          <input type="tel" name="phone" autoComplete="tel" defaultValue={customer?.phone || ''} required />
        </label>
      </div>
      <div className="form__row">
        <label>Topic
          <select name="topic" defaultValue={order ? 'Order issue' : undefined} required>
            {TOPICS.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>
        <label>Order ID (optional)
          <input type="text" name="order" defaultValue={order} placeholder="e.g. BV1016-004" />
        </label>
      </div>
      <label>Message
        <textarea name="message" required minLength={10}></textarea>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn--red btn--lg" disabled={busy}>{busy ? 'Sending…' : 'Send Message'}</button>
      <p className="form__note">We usually reply within a few hours. You can also email {EMAIL}.</p>
    </form>
  );
}

export default function Support() {
  usePageTitle('Help & Support');

  return (
    <>
      <PageHero pill="Help & Support" title={<>How can we <em>help you?</em></>}>
        Questions about an order, a payment or your account? Our support team is just a call or an email away.
      </PageHero>

      <section className="container">
        <div className="contact-cards">
          <div className="contact-card">
            <div className="contact-card__icon"><Phone /></div>
            <h3>Call us</h3>
            <a className="contact-card__value" href={PHONE_HREF}>{PHONE}</a>
            <p>Speak to our support team directly.</p>
            <a href={PHONE_HREF} className="btn btn--red">Call Now</a>
          </div>
          <div className="contact-card">
            <div className="contact-card__icon"><Mail /></div>
            <h3>Email us</h3>
            <a className="contact-card__value" href={`mailto:${EMAIL}`}>{EMAIL}</a>
            <p>Write to us and we'll get back to you.</p>
            <a href={`mailto:${EMAIL}`} className="btn btn--outline">Send Email</a>
          </div>
        </div>
      </section>

      <section className="container support">
        <div className="faq">
          <span className="eyebrow">FAQs</span>
          <h2>Common questions</h2>
          {FAQS.map(f => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>

        <div>
          <span className="eyebrow">Write to us</span>
          <h2>Send a message</h2>
          <ContactForm />
        </div>
      </section>
    </>
  );
}
