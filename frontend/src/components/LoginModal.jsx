// Sign-in sheet: mobile number or email address → 6-digit code → (new customers) their name, and a
// friend's referral code if they have one (filled in from an invite link). Or "Continue with Google":
// a linked Google account signs straight in; a new one adds its mobile number once (deliveries need it).
// Accounts made with an email address give a delivery number at checkout instead.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useConfig } from '../state/menu.js';
import { getInvite, clearInvite } from '../lib/invite.js';
import Modal from './Modal.jsx';
import GoogleButton from './GoogleButton.jsx';
import { Sparkle, Mail, Phone } from './Icons.jsx';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginModal({ reason, existing, onDone }) {
  // A signed-in customer without a name (they closed the sheet last time) goes straight to the name step.
  const [step, setStep] = useState(existing && !existing.name ? 'name' : 'phone');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null); // { phone } or { email }, with devCode and resendAfterSecs
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const { data: config } = useConfig();
  const [invite] = useState(getInvite);
  const [refCode, setRefCode] = useState(() => invite?.code || '');
  const [customer, setCustomer] = useState(existing && !existing.name ? existing : null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const [shake, setShake] = useState(false);
  const [google, setGoogle] = useState(null); // { ticket, name, email } while a Google user adds their number
  const input = useRef(null);

  useEffect(() => { input.current?.focus(); setError(''); }, [step]);
  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const run = async fn => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const sendCode = via => run(async () => {
    const result = via === 'email' ? await api.sendEmailCode(email) : await api.sendOtp(phone);
    setSent(result);
    setCode('');
    setWait(result.resendAfterSecs || 30);
    setStep('code');
  });

  // New accounts see the name step (name already filled in from Google) for the referral code.
  const signedInAs = (signedIn, isNew) => {
    if (signedIn.name && !(isNew && config?.referral)) onDone(signedIn);
    else { setCustomer(signedIn); setName(signedIn.name || ''); setStep('name'); }
  };

  // A wrong code shakes the boxes and clears them for another try.
  const verify = c => run(async () => {
    try {
      const { customer: signedIn, isNew } = sent.email
        ? await api.verifyEmailCode(sent.email, c)
        : await api.verifyOtp(sent.phone, c, google?.ticket);
      signedInAs(signedIn, isNew);
    } catch (err) {
      setCode('');
      setShake(true);
      input.current?.focus();
      throw err;
    }
  });

  const saveName = () => run(async () => {
    const code = config?.referral ? refCode.trim() : '';
    // Check the code first, so a typo can be fixed before anything is saved.
    if (code) await api.referralLookup(code).catch(() => { throw new Error('That referral code doesn’t exist. Check it, or leave it empty.'); });
    let saved = await api.updateMe({ name });
    if (code) saved = (await api.applyReferral(code).catch(() => null))?.customer || saved;
    clearInvite();
    onDone(saved);
  });

  const googleSignIn = credential => run(async () => {
    const result = await api.googleLogin(credential);
    if (result.needsPhone) { setGoogle(result); setStep('phone'); input.current?.focus(); return; }
    signedInAs(result.customer, false);
  });

  const onCode = value => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) verify(digits);
  };

  // Closing at the name step keeps the customer signed in, but they'll be asked for a name before ordering.
  const close = () => onDone(step === 'name' && customer ? { ...customer } : null);

  const fine = <p className="login__fine">By continuing you agree to our <Link to="/terms" onClick={close}>Terms</Link> and <Link to="/privacy" onClick={close}>Privacy Policy</Link>.</p>;

  return (
    <Modal onClose={close} label="Sign in" className="login">
      <img className="login__logo" src="/assets/mark.png" alt="" width="56" height="56" />
      {step === 'phone' && (
        <form className="login__step" onSubmit={e => { e.preventDefault(); sendCode('phone'); }}>
          <h2>{google ? 'Add your mobile number' : 'Sign in to BiteVo'}</h2>
          {google ? (
            <p className="login__lead">Signed in with Google as <b>{google.email}</b>. Add your mobile number to finish. Our delivery partner needs it, and you only do this once.</p>
          ) : (
            <p className="login__lead">{reason || 'Enter your mobile number. We’ll send you a code on WhatsApp or SMS to sign in or create your account.'}</p>
          )}
          {config?.googleClientId && !google && (
            <>
              <GoogleButton clientId={config.googleClientId} onCredential={googleSignIn} />
              <div className="login__or"><span>or use your mobile number</span></div>
            </>
          )}
          <label className="field">
            <span>Mobile number</span>
            <div className="phone-input">
              <span>+91</span>
              <input
                ref={input} type="tel" inputMode="numeric" autoComplete="tel-national" enterKeyHint="send" placeholder="98765 43210"
                value={phone} onChange={e => setPhone(e.target.value.replace(/[^\d ]/g, '').slice(0, 11))} required
              />
            </div>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn--red btn--block" disabled={busy || phone.replace(/\D/g, '').length < 10}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
          {config?.emailLogin && !google && (
            <button type="button" className="btn btn--outline btn--block login__switch" onClick={() => setStep('email')}>
              <Mail />Sign in with email instead
            </button>
          )}
          {fine}
        </form>
      )}

      {step === 'email' && (
        <form className="login__step" onSubmit={e => { e.preventDefault(); sendCode('email'); }}>
          <h2>Sign in with email</h2>
          <p className="login__lead">Enter your email address. We’ll email you a 6-digit code to sign in.</p>
          <label className="field">
            <span>Email address</span>
            <input
              ref={input} type="email" inputMode="email" autoComplete="email" enterKeyHint="send" placeholder="you@example.com"
              value={email} onChange={e => setEmail(e.target.value.trim())} maxLength={120} required
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn--red btn--block" disabled={busy || !EMAIL.test(email)}>{busy ? 'Sending…' : 'Send code'}</button>
          <button type="button" className="btn btn--outline btn--block login__switch" onClick={() => setStep('phone')}>
            <Phone />Use your mobile number instead
          </button>
          {fine}
        </form>
      )}

      {step === 'code' && sent && (
        <form className="login__step" onSubmit={e => { e.preventDefault(); verify(code); }}>
          <h2>Enter the code</h2>
          <p className="login__lead">
            {sent.email ? 'We emailed' : 'We sent'} a 6-digit code to <b>{sent.phone || sent.email}</b>{sent.phone && !sent.devCode ? ' on WhatsApp or SMS' : ''}.{' '}
            <button type="button" className="link" onClick={() => setStep(sent.email ? 'email' : 'phone')}>Change</button>
          </p>
          {sent.devCode && (
            <div className="dev-code">
              <span>Test mode — no {sent.email ? 'email' : 'WhatsApp or SMS'} is sent. Your code is <b>{sent.devCode}</b></span>
              <button type="button" className="link" onClick={() => onCode(sent.devCode)}>Fill it in</button>
            </div>
          )}
          {/* One real input (so SMS autofill and paste work) drawn as six boxes. */}
          <label className={`otp${shake ? ' is-shake' : ''}${busy ? ' is-busy' : ''}`} onAnimationEnd={() => setShake(false)}>
            <span className="visually-hidden">6-digit code</span>
            <input
              ref={input} type="text" inputMode="numeric" autoComplete="one-time-code" enterKeyHint="done"
              value={code} onChange={e => onCode(e.target.value)} maxLength={6} required
            />
            <span className="otp__boxes" aria-hidden="true">
              {Array.from({ length: 6 }, (_, i) => (
                <span key={i} className={`otp__box${code[i] ? ' is-filled' : ''}${i === Math.min(code.length, 5) ? ' is-active' : ''}`}>
                  {code[i] && <b key={code[i] + i}>{code[i]}</b>}
                </span>
              ))}
            </span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn--red btn--block" disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Verify & continue'}</button>
          <p className="login__fine">
            Didn’t get it? {wait > 0 ? `Resend in ${wait}s` : <button type="button" className="link" onClick={() => sendCode(sent.email ? 'email' : 'phone')} disabled={busy}>Send a new code</button>}
          </p>
        </form>
      )}

      {step === 'name' && (
        <form className="login__step" onSubmit={e => { e.preventDefault(); saveName(); }}>
          <h2>Welcome to BiteVo!</h2>
          <p className="login__lead">What should we call you? Our delivery partner will ask for this name.</p>
          <label className="field">
            <span>Your name</span>
            <input ref={input} type="text" autoComplete="name" autoCapitalize="words" enterKeyHint="done" value={name} onChange={e => setName(e.target.value)} maxLength={60} required />
          </label>
          {config?.referral && (
            <label className="field">
              <span>Referral code <i>(optional)</i></span>
              <input
                type="text" value={refCode} placeholder="e.g. PRIY7K2Q" autoComplete="off" autoCapitalize="characters" spellCheck="false" enterKeyHint="done"
                onChange={e => setRefCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
              />
              {invite && refCode === invite.code && <small className="login__invite"><Sparkle /> Invited by {invite.inviter}</small>}
            </label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn btn--red btn--block" disabled={busy || name.trim().length < 2}>{busy ? 'Saving…' : 'Continue'}</button>
        </form>
      )}
    </Modal>
  );
}
