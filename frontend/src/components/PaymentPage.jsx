// The payment page, the step after the cart (Checkout.jsx, /checkout?step=pay), laid out like a delivery app's:
// the bill total on top, then every way to pay grouped as UPI (the customer's UPI apps on a phone, a QR code on
// a computer), cards, wallets and pay on delivery,
// with "Pay ₹…" pinned to the bottom. Paying online opens Razorpay's checkout straight on the chosen method
// (lib/payMethods.js); the order is placed once the server has checked the payment.
import { useEffect } from 'react';
import { UPI_APPS, onPhone, payLabel, sameChoice } from '../lib/payMethods.js';
import { money } from '../lib/format.js';
import { Shield, Wallet } from './Icons.jsx';

const Back = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" /></svg>;
const CardIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19M6 15h4" /></svg>;
const CashIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /><path d="M6 9.5v.01M18 14.5v.01" /></svg>;
const QrIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" /></svg>;

// A UPI app's badge: its initials in its colours (not the app's logo).
const AppMark = ({ app }) => <span className="pp-mark" style={{ background: app.bg, color: app.fg }} aria-hidden="true">{app.mark}</span>;
const UpiMark = () => <span className="pp-mark pp-mark--upi" aria-hidden="true">UPI</span>;
const IconMark = ({ children }) => <span className="pp-mark pp-mark--icon" aria-hidden="true">{children}</span>;

function Option({ choice, selected, onSelect, mark, title, text, disabled }) {
  const on = sameChoice(choice, selected);
  return (
    <button type="button" role="radio" aria-checked={on} disabled={disabled} className={`pp-opt${on ? ' is-on' : ''}`} onClick={() => onSelect(choice)}>
      {mark}
      <span className="pp-opt__text"><b>{title}</b>{text && <small>{text}</small>}</span>
      <span className="pp-radio" aria-hidden="true" />
    </button>
  );
}

/**
 * quote      the bill from the server (payable, total, discount, walletUsed, items)
 * itemCount  dishes in the cart
 * where      "20–25 mins to Home" line
 * choice     the chosen way to pay; onChoose(choice) picks another
 * onPay      pays (or places a pay-on-delivery order) with the chosen way
 * onBack     back to the cart
 */
export default function PaymentPage({ quote, itemCount, where, choice, onChoose, onPay, onBack, busy, error, recent }) {
  const phone = onPhone();
  useEffect(() => { window.scrollTo(0, 0); }, []);

  const saved = (quote.discount || 0);
  const cod = choice?.kind === 'cod';
  const button = busy ? (cod ? 'Placing your order…' : 'Opening payment…')
    : !choice ? 'Choose a payment method'
    : cod ? `Place order · ${money(quote.payable)}` : `Pay ${money(quote.payable)}`;

  const upiApps = phone ? UPI_APPS : [];
  return (
    <div className="pp">
      <header className="pp-head">
        <div className="pp-head__row">
          <button type="button" className="co-head__back" onClick={onBack} aria-label="Back to the cart"><Back /></button>
          <div className="pp-head__text">
            <h1>Payment options</h1>
            <small>{itemCount} item{itemCount === 1 ? '' : 's'} · Total {money(quote.payable)}</small>
          </div>
          <span className="pp-safe"><Shield />Secure</span>
        </div>
      </header>

      <div className="pp-body" role="radiogroup" aria-label="Ways to pay">
        <section className="pp-card pp-total">
          <div>
            <small>Bill total</small>
            <b>{money(quote.payable)}</b>
          </div>
          <p>
            {where}
            {saved > 0 && <span className="pp-total__save">You save {money(saved)} on this order</span>}
            {quote.walletUsed > 0 && <span className="pp-total__wallet"><Wallet />{money(quote.walletUsed)} paid from your BiteVo wallet</span>}
          </p>
        </section>

        {recent && (
          <section className="pp-card">
            <h2 className="pp-label">Recently used</h2>
            <Option choice={recent} selected={choice} onSelect={onChoose} title={payLabel(recent)}
              mark={recent.kind === 'upi_app' ? <AppMark app={UPI_APPS.find(a => a.app === recent.app) || UPI_APPS[0]} />
                : recent.kind === 'card' ? <IconMark><CardIcon /></IconMark>
                : recent.kind === 'wallet' ? <IconMark><Wallet /></IconMark>
                : recent.kind === 'cod' ? <IconMark><CashIcon /></IconMark> : <UpiMark />} />
          </section>
        )}

        <section className="pp-card">
          <h2 className="pp-label">Pay by any UPI app</h2>
          {upiApps.map(a => (
            <Option key={a.app} choice={{ kind: 'upi_app', app: a.app }} selected={choice} onSelect={onChoose} mark={<AppMark app={a} />} title={a.name} />
          ))}
          {phone
            ? <Option choice={{ kind: 'upi_any' }} selected={choice} onSelect={onChoose} mark={<UpiMark />} title="Other UPI apps" text="BHIM, CRED, Amazon Pay UPI and more" />
            : <Option choice={{ kind: 'upi_qr' }} selected={choice} onSelect={onChoose} mark={<IconMark><QrIcon /></IconMark>} title="Scan a QR code" text="Pay with any UPI app on your phone" />}
        </section>

        <section className="pp-card">
          <h2 className="pp-label">Credit &amp; debit cards</h2>
          <Option choice={{ kind: 'card' }} selected={choice} onSelect={onChoose} mark={<IconMark><CardIcon /></IconMark>} title="Add credit or debit card" text="Visa, Mastercard, RuPay, Amex" />
        </section>

        <section className="pp-card">
          <h2 className="pp-label">Wallets</h2>
          <Option choice={{ kind: 'wallet' }} selected={choice} onSelect={onChoose} mark={<IconMark><Wallet /></IconMark>} title="Wallets" text="Amazon Pay, MobiKwik and more" />
        </section>

        <section className="pp-card">
          <h2 className="pp-label">Pay on delivery</h2>
          <Option choice={{ kind: 'cod' }} selected={choice} onSelect={onChoose} mark={<IconMark><CashIcon /></IconMark>} title="Cash on delivery" text="Pay cash, or by UPI to the delivery partner" />
        </section>

        <p className="pp-secure"><Shield />100% secure payments by Razorpay. BiteVo never sees or stores your card or UPI details.</p>
      </div>

      <div className="co-pay pp-bar">
        {error && <p className="co-pay__error" role="alert">{error}</p>}
        <div className="co-pay__row">
          <div className="co-pay__using pp-bar__using">
            <small>Paying with</small>
            <b>{payLabel(choice)}</b>
            <span>{cod ? 'Pay when your food arrives' : choice ? 'Secured by Razorpay' : 'Pick one above'}</span>
          </div>
          <button type="button" className="co-pay__btn" onClick={onPay} disabled={busy || !choice}>{button}</button>
        </div>
      </div>
    </div>
  );
}
