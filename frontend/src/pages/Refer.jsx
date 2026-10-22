import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { useConfig } from '../state/menu.js';
import { useToast } from '../state/toast.jsx';
import { PageHero, Loading } from '../components/Sections.jsx';
import SignInPrompt from '../components/SignInPrompt.jsx';
import { Gift, Copy, Share, WhatsApp, Users, Wallet, Check, Bag } from '../components/Icons.jsx';
import { money, formatWhen } from '../lib/format.js';
import { shareLink } from '../lib/invite.js';
import usePageTitle from '../lib/usePageTitle.js';

function HowItWorks({ reward, orders }) {
  const steps = [
    { icon: <Share />, title: 'Share your code', text: 'Send your link or code to friends on WhatsApp or anywhere.' },
    { icon: <Bag />, title: 'They order', text: `Your friend signs up with your code and places ${orders} order${orders > 1 ? 's' : ''}.` },
    { icon: <Wallet />, title: `You get ${money(reward)}`, text: `Once their ${orders > 1 ? `${ordinal(orders)} order is` : 'order is'} delivered, ${money(reward)} lands in your BiteVo wallet.` },
  ];
  return (
    <ol className="refer-steps">
      {steps.map((s, i) => (
        <li key={s.title}>
          <span className="refer-steps__icon">{s.icon}<b>{i + 1}</b></span>
          <span><strong>{s.title}</strong><small>{s.text}</small></span>
        </li>
      ))}
    </ol>
  );
}
const ordinal = n => `${n}${[, 'st', 'nd', 'rd'][n % 10 > 3 || [11, 12, 13].includes(n % 100) ? 0 : n % 10] || 'th'}`;

function FinePrint({ orders }) {
  return (
    <p className="refer-fine">
      The reward is added within a few minutes of your friend’s {ordinal(orders)} order being delivered. Cancelled orders don’t count.
      Codes are for new customers, before their first order, and each friend can use one code. You can’t use your own code.
    </p>
  );
}

// "Have a friend's code?" for customers who haven't ordered yet.
function ApplyCode({ onApplied }) {
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const apply = async e => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const { referrals } = await api.applyReferral(code);
      toast(`Code applied. You joined with ${referrals.referredBy?.name || 'your friend'}’s invite!`);
      onApplied(referrals);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="panel refer-apply" onSubmit={apply}>
      <div><b>Have a friend’s code?</b><small>Use it before your first order.</small></div>
      <div className="refer-apply__row">
        <input
          value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
          placeholder="Enter code" aria-label="Friend’s referral code" autoCapitalize="characters" autoComplete="off" spellCheck="false"
        />
        <button className="btn btn--red" disabled={busy || code.length < 4}>{busy ? 'Applying…' : 'Apply'}</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

function Friend({ f }) {
  const pct = Math.round((f.ordersDelivered / f.ordersNeeded) * 100);
  return (
    <li className={`friend friend--${f.status}`}>
      <span className="friend__avatar" aria-hidden="true">{f.name[0]}</span>
      <span className="friend__main">
        <b>{f.name}</b>
        <small>Joined {formatWhen(f.joinedAt)}</small>
        {f.status === 'pending' && (
          <span className="friend__progress" role="progressbar" aria-valuemin={0} aria-valuemax={f.ordersNeeded} aria-valuenow={f.ordersDelivered} aria-label={`${f.name}: ${f.ordersDelivered} of ${f.ordersNeeded} orders delivered`}>
            <i style={{ width: `${Math.max(pct, 4)}%` }} />
          </span>
        )}
      </span>
      <span className="friend__status">
        {f.status === 'rewarded' && <span className="friend__chip friend__chip--earned"><Check /> {money(f.reward)} earned</span>}
        {f.status === 'pending' && <span className="friend__chip">{f.ordersDelivered} of {f.ordersNeeded} orders</span>}
        {f.status === 'void' && <span className="friend__chip friend__chip--void">Not eligible</span>}
      </span>
    </li>
  );
}

function Program({ data, setData }) {
  const toast = useToast();
  const link = shareLink(data.code);
  const message = `Hey! Order fresh, chef-made food from BiteVo. Sign up with my code ${data.code} and enjoy good food, better mood: ${link}`;

  const copy = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text);
      toast(`${what} copied`);
    } catch {
      toast(`Couldn’t copy. Your ${what.toLowerCase()} is ${text}`, 'info');
    }
  };
  const share = async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'BiteVo', text: message, url: link }); } catch { /* closed the share sheet */ }
    } else copy(link, 'Link');
  };

  return (
    <div className="refer refer--signed-in">
      <div className="refer__side">
      <div className="refer-card">
        <div className="refer-card__top">
          <span className="refer-card__gift" aria-hidden="true"><Gift /></span>
          <div>
            <p className="refer-card__kicker">Refer &amp; earn</p>
            <h2>Get <span>{money(data.reward)}</span> for every friend</h2>
            <p>who joins with your code and completes {data.ordersNeeded} order{data.ordersNeeded > 1 ? 's' : ''}.</p>
          </div>
        </div>
        <div className="refer-code">
          <span className="refer-code__label">Your code</span>
          <b className="refer-code__value">{data.code}</b>
          <button type="button" className="refer-code__copy" onClick={() => copy(data.code, 'Code')}><Copy /> Copy</button>
        </div>
        <div className="refer-share">
          <a className="refer-share__btn refer-share__btn--wa" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noopener noreferrer"><WhatsApp /> WhatsApp</a>
          <button type="button" className="refer-share__btn" onClick={share}><Share /> Share</button>
          <button type="button" className="refer-share__btn" onClick={() => copy(link, 'Link')}><Copy /> Copy link</button>
        </div>
      </div>

      <div className="refer-stats">
        <div><Users /><b>{data.stats.joined}</b><small>Friends joined</small></div>
        <div><Wallet /><b>{money(data.stats.earned)}</b><small>Earned</small></div>
        <div><Bag /><b>{data.stats.pending}</b><small>On their way</small></div>
      </div>
      </div>

      <div className="refer__main">

      <div className="panel">
        <h3 className="refer-h3">How it works</h3>
        <HowItWorks reward={data.reward} orders={data.ordersNeeded} />
      </div>

      <div className="panel">
        <h3 className="refer-h3">Your friends {data.friends.length > 0 && <span>{data.friends.length}</span>}</h3>
        {data.friends.length ? (
          <ul className="friends">{data.friends.map(f => <Friend key={f._id} f={f} />)}</ul>
        ) : (
          <p className="muted refer-empty">No friends have joined yet. Share your code to get started!</p>
        )}
      </div>

      {data.canApply && <ApplyCode onApplied={setData} />}
      {data.referredBy && <p className="refer-joined"><Check /> You joined BiteVo with {data.referredBy.name}’s invite.</p>}

      <FinePrint orders={data.ordersNeeded} />
      <Link to="/wallet" className="refer-wallet-link">See your balance and history in your <b>BiteVo wallet</b></Link>
      </div>
    </div>
  );
}

export default function Refer() {
  usePageTitle('Refer & Earn');
  const { customer, ready } = useAuth();
  const { data: config } = useConfig();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customer?.name) return;
    setData(null);
    setError('');
    api.myReferrals().then(setData, err => setError(err.message));
  }, [customer?._id, customer?.name]);

  const reward = config?.referral?.reward ?? 100;
  const orders = config?.referral?.ordersNeeded ?? 2;

  return (
    <>
      <PageHero compact title={<>Refer &amp; <em>earn</em></>}>
        Invite friends to BiteVo and earn {money(reward)} for each friend who completes {orders} order{orders > 1 ? 's' : ''}.
      </PageHero>
      <section className="section section--tight">
        <div className="container">
          {config && !config.referral ? (
            <div className="empty"><h3>Refer &amp; earn isn’t running right now</h3><p>Please check back soon.</p></div>
          ) : !ready ? <Loading /> : !customer?.name ? (
            <div className="refer refer--guest">
              <div className="panel">
                <h3 className="refer-h3">How it works</h3>
                <HowItWorks reward={reward} orders={orders} />
              </div>
              <SignInPrompt text="Sign in to get your referral code and start earning." />
              <FinePrint orders={orders} />
            </div>
          ) : error ? (
            <p className="form-error" role="alert">{error}</p>
          ) : !data ? <Loading /> : (
            <Program data={data} setData={setData} />
          )}
        </div>
      </section>
    </>
  );
}
