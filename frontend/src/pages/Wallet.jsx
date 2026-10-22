// The BiteVo wallet: balance, how to earn more, and every wallet transaction. Cashback (from the admin
// panel when an order is delivered), referral rewards and refunds add to it; checkout can spend it.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useConfig } from '../state/menu.js';
import { PageHero, Loading } from '../components/Sections.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';
import { Wallet as WalletIcon, Receipt, Gift, ChevronRight } from '../components/Icons.jsx';
import { money, formatWhen } from '../lib/format.js';
import usePageTitle from '../lib/usePageTitle.js';

function WalletDetails() {
  const { data: config } = useConfig();
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api.wallet().then(setWallet, err => setError(err.message)); }, []);

  if (error) return <p className="form-error" role="alert">{error}</p>;
  if (!wallet) return <Loading />;
  return (
    <div className="account">
      <div className="wallet-card">
        <div>
          <span className="wallet-card__label">Available balance</span>
          <b className="wallet-card__amount">{money(wallet.balance)}</b>
          <p>Use it to pay for your next order at checkout.</p>
        </div>
        <Link to="/" className="btn btn--lg">Order now</Link>
      </div>

      <div className="panel">
        <div className="panel__head"><span className="panel__icon"><WalletIcon /></span><h2>Ways to fill your wallet</h2></div>
        <ul className="earn-list">
          <li>
            <span className="panel__icon"><Receipt /></span>
            <span>
              <b>{config?.offers?.deliveryCashback > 0 ? `${money(config.offers.deliveryCashback)} cashback on every order` : 'Cashback on your orders'}</b>
              <small>Lands in your wallet once the order is delivered, on top of any coupon cashback.</small>
            </span>
          </li>
          {config?.offers?.signupBonus > 0 && (
            <li>
              <span className="panel__icon"><Gift /></span>
              <span><b>{money(config.offers.signupBonus)} signup bonus</b><small>Every new account starts with it in the wallet.</small></span>
            </li>
          )}
          {config?.referral && (
            <li>
              <span className="panel__icon"><Gift /></span>
              <span>
                <b>Refer &amp; earn {money(config.referral.reward)}</b>
                <small>For every friend who completes {config.referral.ordersNeeded} orders. <Link to="/refer">Invite friends</Link></small>
              </span>
            </li>
          )}
          <li>
            <span className="panel__icon"><WalletIcon /></span>
            <span><b>Refunds</b><small>Money back for a cancelled order can come straight here.</small></span>
          </li>
        </ul>
      </div>

      <div className="panel">
        <div className="panel__head"><span className="panel__icon"><Receipt /></span><h2>History</h2></div>
        {wallet.transactions.length === 0 ? (
          <p className="muted">No wallet activity yet. Your cashback and rewards will show up here.</p>
        ) : (
          <ul className="txns">
            {wallet.transactions.map(t => (
              <li key={t._id}>
                <span><b>{t.label}</b><small>{t.note ? `${t.note} · ` : ''}{formatWhen(t.at)}</small></span>
                <span className={t.amount > 0 ? 'plus' : 'minus'}>{t.amount > 0 ? '+' : '−'}{money(Math.abs(t.amount))}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Link to="/orders" className="panel panel--link">
        <span className="panel__icon"><Receipt /></span>
        <span><b>My orders</b><small>See what you paid from your wallet</small></span>
        <ChevronRight />
      </Link>
    </div>
  );
}

export default function Wallet() {
  usePageTitle('Wallet');
  const { customer, ready } = useAuth();

  return (
    <>
      <PageHero compact title={<>BiteVo <em>wallet</em></>}>
        Cashback, referral rewards and refunds, ready to spend at checkout.
      </PageHero>
      <section className="section section--tight">
        <div className="container narrow">
          {!ready ? <Loading /> : !customer ? <SignInPrompt text="Sign in to see your wallet balance and history." /> : <WalletDetails key={customer._id} />}
        </div>
      </section>
    </>
  );
}
