// "Become a delivery partner": apply online to deliver for BiteVo. The form goes to the API
// (backend/src/routes/riderApplications.js); the team reviews applications in the admin panel and, once
// approved, the applicant signs in to the BiteVo rider app with the same mobile number.
import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../state/auth.jsx';
import { PageHero } from '../components/Sections.jsx';
import { Clock, MapPin, Bike, Phone, Check } from '../components/Icons.jsx';
import { PHONE, PHONE_HREF } from '../components/Footer.jsx';
import usePageTitle from '../lib/usePageTitle.js';

// Motor vehicles need a driving licence (a bicycle or a low-speed e-bike doesn't). Same rule as the API.
const NEEDS_LICENCE = /^(bike|motorbike|motorcycle|scooter)$/i;

function ApplyForm() {
  const { customer } = useAuth();
  const [options, setOptions] = useState(null);
  const [vehicle, setVehicle] = useState('');
  const [sent, setSent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.riderJobOptions().then(o => { setOptions(o); setVehicle(o.vehicleTypes[0] || ''); }, err => setError(err.message));
  }, []);

  const submit = async e => {
    e.preventDefault();
    const d = new FormData(e.currentTarget);
    const application = {
      name: d.get('name'), phone: d.get('phone'), email: d.get('email'),
      vehicleType: vehicle, vehicleNumber: d.get('vehicleNumber') || '',
      hasLicence: d.get('licence') === 'on',
      area: d.get('area') || '', shift: d.get('shift'), experience: d.get('experience'),
      adult: d.get('adult') === 'on',
      website: d.get('website'), // the hidden spam trap
    };
    setBusy(true);
    setError('');
    try {
      await api.applyAsRider(application);
      setSent({ name: String(application.name).trim().split(/\s+/)[0], phone: application.phone });
    } catch (err) {
      setError(err.message);
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div className="form form--sent">
        <span className="placed-banner__tick"><Check /></span>
        <h3>Thanks, {sent.name}! We’ve got your application</h3>
        <p>We’ll call you on {sent.phone} to talk through the next steps and your ID check. Questions? Call us on <a href={PHONE_HREF}>{PHONE}</a>.</p>
      </div>
    );
  }

  const motor = NEEDS_LICENCE.test(vehicle);
  return (
    <form className="form" onSubmit={submit} key={customer?._id || 'guest'}>
      <div className="form__row">
        <label>Full name
          <input type="text" name="name" autoComplete="name" defaultValue={customer?.name || ''} required minLength={2} maxLength={60} />
        </label>
        <label>Mobile number
          <input type="tel" name="phone" autoComplete="tel" inputMode="tel" defaultValue={customer?.phone || ''} required placeholder="98765 43210" />
        </label>
      </div>
      <label>Email <i className="form__optional">(optional)</i>
        <input type="email" name="email" autoComplete="email" maxLength={120} />
      </label>
      <div className="form__row">
        <label>Your vehicle
          <select value={vehicle} onChange={e => setVehicle(e.target.value)} required disabled={!options}>
            {(options?.vehicleTypes || []).map(v => <option key={v}>{v}</option>)}
          </select>
        </label>
        {vehicle !== 'Bicycle' && (
          <label>Vehicle number
            <input type="text" name="vehicleNumber" required placeholder="HR26 AB 1234" maxLength={15} style={{ textTransform: 'uppercase' }} />
          </label>
        )}
      </div>
      {motor && (
        <label className="form__check">
          <input type="checkbox" name="licence" required />
          <span>I have a valid driving licence for a {vehicle.toLowerCase()}</span>
        </label>
      )}
      <div className="form__row">
        {options?.areas?.length > 0 && (
          <label>Area you’d like to deliver in
            <select name="area" required defaultValue="">
              <option value="" disabled>Choose an area</option>
              {options.areas.map(a => <option key={a}>{a}</option>)}
            </select>
          </label>
        )}
        <label>Hours that suit you
          <select name="shift" required defaultValue="">
            <option value="" disabled>Choose your hours</option>
            {(options?.shifts || []).map(s => <option key={s}>{s}</option>)}
          </select>
        </label>
      </div>
      <label>Delivery experience <i className="form__optional">(optional)</i>
        <textarea name="experience" maxLength={300} placeholder="e.g. 1 year delivering food in Gurugram" />
      </label>
      {/* A spam trap: hidden from people, often filled in by bots. */}
      <label className="visually-hidden" aria-hidden="true">Website
        <input type="text" name="website" tabIndex={-1} autoComplete="off" />
      </label>
      <label className="form__check">
        <input type="checkbox" name="adult" required />
        <span>I’m 18 or older</span>
      </label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn--red btn--lg" disabled={busy || !options}>{busy ? 'Sending…' : 'Apply now'}</button>
      <p className="form__note">We use these details only to review your application and contact you about it.</p>
    </form>
  );
}

export default function DeliveryPartner() {
  usePageTitle('Become a delivery partner');
  const [areas, setAreas] = useState('');
  useEffect(() => {
    api.riderJobOptions().then(o => setAreas(o.areas.filter(a => !/^any/i.test(a)).join(', ').replace(/, ([^,]*)$/, ' and $1') + (o.city ? `, ${o.city}` : '')), () => {});
  }, []);

  const perks = [
    { icon: <Clock />, title: 'Choose your hours', text: 'Morning, afternoon, evening or full day: pick the shifts that fit around your life.' },
    { icon: <MapPin />, title: 'Short trips', text: `We deliver only close to our kitchen${areas ? `, in ${areas}` : ''}, so trips stay short.` },
    { icon: <Bike />, title: 'The BiteVo rider app', text: 'New orders, the road route to each customer and your deliveries, all in one app.' },
    { icon: <Phone />, title: 'A team behind you', text: 'Call the kitchen from the app whenever you need help on a delivery.' },
  ];

  return (
    <>
      <PageHero pill="Delivery partners" title={<>Deliver with <em>BiteVo</em></>}>
        Join our delivery team: apply online in two minutes, and we’ll call you about the next steps.
      </PageHero>

      <section className="container partner-perks">
        {perks.map(p => (
          <div key={p.title} className="partner-perk">
            <span className="partner-perk__icon">{p.icon}</span>
            <h3>{p.title}</h3>
            <p>{p.text}</p>
          </div>
        ))}
      </section>

      <section className="container partner-how">
        <span className="eyebrow">How it works</span>
        <h2>From application to your first delivery</h2>
        <ol className="steps">
          <li className="step"><span className="step__num">1</span><h3>Apply online</h3><p>Fill in the form below. It takes about two minutes.</p></li>
          <li className="step"><span className="step__num">2</span><h3>We call you</h3><p>We go through the details with you and check your ID and documents.</p></li>
          <li className="step"><span className="step__num">3</span><h3>Start delivering</h3><p>Sign in to the BiteVo rider app with your mobile number and go online.</p></li>
        </ol>
      </section>

      <section className="container support partner-apply">
        <div>
          <span className="eyebrow">What you need</span>
          <h2>Before you apply</h2>
          <ul className="partner-needs">
            <li><Check /> 18 years or older</li>
            <li><Check /> A smartphone with internet and GPS</li>
            <li><Check /> A bike or scooter with a valid driving licence and RC, or a bicycle or e-bike</li>
            <li><Check /> An ID (such as Aadhaar) for the ID check</li>
          </ul>
        </div>
        <div>
          <span className="eyebrow">Apply online</span>
          <h2>Become a delivery partner</h2>
          <ApplyForm />
        </div>
      </section>
    </>
  );
}
