import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useCart } from '../state/cart.jsx';
import { useToast } from '../state/toast.jsx';
import { PageHero, Loading } from '../components/Sections.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';
import AddressForm from '../components/AddressForm.jsx';
import Modal from '../components/Modal.jsx';
import { MapPin, User, Wallet, Receipt, ChevronRight, Alert, Gift } from '../components/Icons.jsx';
import { useConfig } from '../state/menu.js';
import { money, addressLine, LIVE_STATUSES } from '../lib/format.js';
import usePageTitle from '../lib/usePageTitle.js';

function Profile() {
  const { customer, setCustomer } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ name: customer.name, email: customer.email });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const changed = form.name !== customer.name || form.email !== customer.email;

  const save = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      setCustomer(await api.updateMe(form));
      toast('Profile saved.');
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <form className="panel stack" onSubmit={save}>
      <div className="panel__head"><span className="panel__icon"><User /></span><h2>Profile</h2></div>
      <label className="field"><span>Name</span><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} maxLength={60} autoComplete="name" required /></label>
      <label className="field"><span>Email <i>(optional, for receipts and offers)</i></span><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} maxLength={120} autoComplete="email" /></label>
      {customer.phone ? (
        <label className="field"><span>Mobile number</span><input value={customer.phone} disabled /></label>
      ) : (
        <label className="field">
          <span>Mobile number <i>(for delivery)</i></span>
          <input value={customer.deliveryPhone} placeholder="Not added yet, we’ll ask at checkout" disabled />
          {customer.deliveryPhone && <small className="muted small">You can change it when you place your next order.</small>}
        </label>
      )}
      {customer.google && <p className="muted small">Google account linked{typeof customer.google === 'string' ? ` (${customer.google})` : ''}. You can sign in with it.</p>}
      {customer.emailLogin && <p className="muted small">You can also sign in with a code sent to <b>{customer.emailLogin}</b>.</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="btn btn--red" disabled={busy || !changed}>{busy ? 'Saving…' : 'Save changes'}</button>
    </form>
  );
}

function Addresses() {
  const { customer, setCustomer } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(null);

  const remove = async a => {
    if (!window.confirm(`Remove the “${a.label}” address?`)) return;
    try {
      setCustomer((await api.deleteAddress(a._id)).customer);
      toast('Address removed.');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="panel">
      <div className="panel__head"><span className="panel__icon"><MapPin /></span><h2>Saved addresses</h2></div>
      {customer.addresses.length === 0 && <p className="muted">No saved addresses yet. Add one to check out faster.</p>}
      <ul className="address-list">
        {customer.addresses.map(a => (
          <li key={a._id}>
            <span className="address__body"><b>{a.label}</b><span>{addressLine(a)}</span></span>
            <span className="address-list__actions">
              <button type="button" className="link" onClick={() => setEditing(a)}>Edit</button>
              <button type="button" className="link link--muted" onClick={() => remove(a)}>Remove</button>
            </span>
          </li>
        ))}
      </ul>
      <button type="button" className="btn btn--outline" onClick={() => setEditing({})}>+ Add a new address</button>
      {editing && <AddressForm address={editing._id ? editing : null} onClose={() => setEditing(null)} />}
    </div>
  );
}

// The wallet has its own page; this shows the balance on the way there.
function WalletLink() {
  const [balance, setBalance] = useState(null);
  useEffect(() => { api.wallet().then(w => setBalance(w.balance), () => {}); }, []);

  return (
    <Link to="/wallet" className="panel panel--link">
      <span className="panel__icon"><Wallet /></span>
      <span><b>BiteVo wallet</b><small>{balance === null ? 'Balance and history' : `Balance ${money(balance)} · cashback, rewards and refunds`}</small></span>
      <ChevronRight />
    </Link>
  );
}

// Second, deliberate step before deleting: says what happens, and only enables the button once the
// customer types DELETE. Not possible while an order is still on its way.
function DeleteAccountSheet({ onClose, onDeleted }) {
  const [check, setCheck] = useState(null); // { balance, liveOrder }
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmed = typed.trim().toUpperCase() === 'DELETE';

  useEffect(() => {
    Promise.all([api.wallet(), api.orders()]).then(
      ([wallet, orders]) => setCheck({ balance: wallet.balance, liveOrder: orders.find(o => LIVE_STATUSES.includes(o.status)) || null }),
      err => setError(err.message),
    );
  }, []);

  const remove = async e => {
    e.preventDefault();
    if (!confirmed) return;
    setBusy(true);
    setError('');
    try {
      await api.deleteAccount();
      onDeleted();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} label="Delete your account" className="delete-sheet">
      <span className="delete-sheet__icon"><Alert /></span>
      <h2>Delete your account?</h2>
      {!check && !error && <Loading label="Checking your account…" />}
      {!check && error && <p className="form-error" role="alert">{error}</p>}

      {check?.liveOrder && (
        <>
          <p className="delete-sheet__lead">
            Order <b>#{check.liveOrder.orderNo}</b> is still on its way. You can delete your account once it’s delivered or cancelled.
          </p>
          <div className="delete-sheet__actions">
            <button type="button" className="btn btn--outline" onClick={onClose}>Close</button>
            <Link to={`/orders/${check.liveOrder._id}`} className="btn btn--red" onClick={onClose}>Track the order</Link>
          </div>
        </>
      )}

      {check && !check.liveOrder && (
        <form onSubmit={remove}>
          <ul className="delete-sheet__list">
            <li>Your profile, saved addresses and sign-in are removed.</li>
            <li>Your name, phone number and addresses are taken off your past orders. We keep the order amounts for our accounts.</li>
            {check.balance > 0 && <li className="is-warn">Your wallet balance of <b>{money(check.balance)}</b> will be lost.</li>}
            <li><b>This can’t be undone.</b> You can sign up again later with the same number, as a new account.</li>
          </ul>
          <label className="field">
            <span>Type <b>DELETE</b> to confirm</span>
            <input
              value={typed} onChange={e => setTyped(e.target.value)} placeholder="DELETE"
              autoComplete="off" autoCapitalize="characters" spellCheck={false} enterKeyHint="done"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="delete-sheet__actions">
            <button type="button" className="btn btn--outline" onClick={onClose}>Keep my account</button>
            <button className="btn btn--danger-solid" disabled={!confirmed || busy}>{busy ? 'Deleting…' : 'Delete account'}</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export default function Account() {
  usePageTitle('My Account');
  const { customer, ready, logout, setCustomer } = useAuth();
  const cart = useCart();
  const toast = useToast();
  const navigate = useNavigate();
  const { data: config } = useConfig();
  const [deleting, setDeleting] = useState(false);

  const signOut = async () => {
    await logout();
    navigate('/');
  };

  // The server has removed the account and signed this browser out; forget what this browser kept too.
  const deleted = () => {
    setDeleting(false);
    setCustomer(null);
    cart.clear();
    try { localStorage.removeItem('bitevo_last_address'); } catch { /* ignore */ }
    navigate('/');
    toast('Your account has been deleted.');
  };

  return (
    <>
      <PageHero compact title={customer?.name ? <>Hi, <em>{customer.name.split(' ')[0]}</em></> : <>My <em>account</em></>}>
        {customer ? customer.phone || customer.email : 'Your profile, addresses and wallet.'}
      </PageHero>
      <section className="section section--tight">
        <div className="container narrow">
          {!ready ? <Loading /> : !customer ? <SignInPrompt text="Sign in to see your profile, addresses and wallet." /> : (
            <div className="account">
              <Link to="/orders" className="panel panel--link">
                <span className="panel__icon"><Receipt /></span>
                <span><b>My orders</b><small>Track live orders and order again</small></span>
                <ChevronRight />
              </Link>
              <WalletLink />
              {config?.referral && (
                <Link to="/refer" className="panel panel--link panel--refer">
                  <span className="panel__icon"><Gift /></span>
                  <span><b>Refer &amp; earn</b><small>Get {money(config.referral.reward)} for every friend who completes {config.referral.ordersNeeded} orders</small></span>
                  <ChevronRight />
                </Link>
              )}
              <Profile />
              <Addresses />
              <div className="panel panel--danger">
                <div>
                  <b>Delete account</b>
                  <small>Permanently remove your BiteVo account, saved addresses and wallet.</small>
                </div>
                <button type="button" className="btn btn--danger btn--sm" onClick={() => setDeleting(true)}>Delete account</button>
              </div>
              <button type="button" className="btn btn--outline btn--block" onClick={signOut}>Sign out</button>
            </div>
          )}
          {deleting && customer && <DeleteAccountSheet onClose={() => setDeleting(false)} onDeleted={deleted} />}
        </div>
      </section>
    </>
  );
}
