import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import HashLink from '../components/HashLink.jsx';
import { AppCta } from '../components/Sections.jsx';
import DishCard from '../components/Dish.jsx';
import { Check, Flame, Leaf, Shield, Clock, Heart } from '../components/Icons.jsx';
import { HERO_DISHES, ORBIT, POPULAR, GALLERY } from '../data/food.js';
import { useMenu } from '../state/menu.js';
import { photo } from '../lib/photo.js';
import usePageTitle from '../lib/usePageTitle.js';

// Bestsellers from the live menu, topped up with other available dishes. Until the menu loads
// (or if it can't), the static picks are shown with a link to the menu.
function PopularPicks() {
  const { data: menu } = useMenu();
  const available = menu?.products.filter(p => p.isAvailable) || [];
  const picks = [...available.filter(p => p.isBestseller), ...available.filter(p => !p.isBestseller)].slice(0, 4);

  if (picks.length) {
    return <div className="menu menu--order">{picks.map((p, i) => <DishCard key={p._id} product={p} index={i} />)}</div>;
  }
  return (
    <div className="menu">
      {POPULAR.map(d => (
        <article className="dish" key={d.name}>
          <div className="dish__img"><img src={photo(d.photo, 600, 450)} alt={d.alt} loading="lazy" /></div>
          <div className="dish__body">
            <h3>{d.name}</h3>
            <p>{d.desc}</p>
            <Link to="/menu" className="dish__link">Order now <span aria-hidden="true">&rarr;</span></Link>
          </div>
        </article>
      ))}
    </div>
  );
}

// The hero waits for the logo intro only on the very first visit.
let introPending = window.location.pathname === '/';

function HeroPlate() {
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState(null);

  useEffect(() => {
    let current = 0;
    const timer = setInterval(() => {
      setLeaving(current);
      current = (current + 1) % HERO_DISHES.length;
      setActive(current);
    }, 3200);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (leaving === null) return;
    const t = setTimeout(() => setLeaving(null), 1300);
    return () => clearTimeout(t);
  }, [leaving]);

  return (
    <>
      <div className="plate">
        {HERO_DISHES.map((d, i) => (
          <img
            key={d.photo}
            className={`plate__img${i === active ? ' is-active' : ''}${i === leaving ? ' is-leaving' : ''}`}
            src={photo(d.photo, 700, 700, 80)}
            alt={d.alt}
          />
        ))}
      </div>
      <div className="now-serving">
        <span className="now-serving__dot"></span>Now serving: <b key={active} className="swap">{HERO_DISHES[active].name}</b>
      </div>
    </>
  );
}

export default function Home() {
  usePageTitle();
  const [intro] = useState(introPending);
  useEffect(() => { introPending = false; }, []);

  return (
    <>
      {/* Hero */}
      <section className="hero" style={intro ? { '--intro': '1.6s' } : undefined}>
        <div className="container hero__inner">
          <div className="hero__text">
            <span className="pill anim" style={{ '--d': 0 }}>Fresh &middot; Hot &middot; Delivered</span>
            <h1>
              <span className="line"><span className="line__in" style={{ '--d': 1 }}>Good food,</span></span>
              <span className="line"><em className="line__in" style={{ '--d': 2 }}>better mood.</em></span>
            </h1>
            <p className="hero__lead anim" style={{ '--d': 3 }}>
              Chef-made meals cooked fresh in our kitchen and brought hot to your door. Order in a few taps and let BiteVo take care of the rest.
            </p>
            <div className="hero__actions anim" style={{ '--d': 4 }}>
              <Link to="/menu" className="btn btn--red btn--lg">Order Now</Link>
              <HashLink to="#menu" className="btn btn--outline btn--lg">See the Menu</HashLink>
            </div>
            <ul className="hero__points anim" style={{ '--d': 5 }}>
              <li><Check />Cooked fresh to order</li>
              <li><Check />Hygienic kitchens</li>
              <li><Check />Quick delivery</li>
            </ul>
          </div>

          <div className="hero__art anim-pop">
            <div className="hero__blob" aria-hidden="true"></div>
            <div className="orbit" aria-hidden="true">
              {ORBIT.map((id, i) => (
                <div className="orbit__item" style={{ '--a': `${i * 60}deg` }} key={id}>
                  <img src={photo(id, 160, 160, 70)} alt="" />
                </div>
              ))}
            </div>
            <HeroPlate />
            <div className="chip chip--a">
              <span className="chip__icon"><Flame /></span>
              Hot &amp; fresh
            </div>
            <div className="chip chip--b">
              <span className="chip__icon chip__icon--green"><Leaf /></span>
              Chef-made
            </div>
          </div>
        </div>
      </section>

      {/* Highlight band */}
      <section className="band">
        <div className="container band__inner">
          <div className="band__item"><strong>Fresh</strong><span>Cooked daily</span></div>
          <div className="band__item"><strong>Hygienic</strong><span>Clean kitchens</span></div>
          <div className="band__item"><strong>Quick</strong><span>Fast delivery</span></div>
          <div className="band__item"><strong>Easy</strong><span>Simple ordering</span></div>
        </div>
      </section>

      {/* Popular picks */}
      <section className="section" id="menu">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Popular Picks</span>
            <h2>Something for <em>every craving</em></h2>
            <p>A taste of what's cooking — all made fresh when you order.</p>
          </div>
          <PopularPicks />
          <div className="center"><Link to="/menu" className="btn btn--outline btn--lg">View Full Menu</Link></div>
        </div>
      </section>

      {/* Food photo strip (images repeated once for a seamless loop) */}
      <section className="gallery" aria-label="Food from our kitchen">
        <div className="gallery__track">
          {[...GALLERY, ...GALLERY].map((g, i) => (
            <img
              key={i}
              src={photo(g.photo, 480, 360, 70)}
              alt={i < GALLERY.length ? g.alt : ''}
              aria-hidden={i >= GALLERY.length || undefined}
              loading="lazy"
            />
          ))}
        </div>
      </section>

      {/* Why BiteVo */}
      <section className="section section--tint" id="why">
        <div className="container why">
          <div className="why__text">
            <span className="eyebrow">Why BiteVo</span>
            <h2>Food that makes your <em>day better</em></h2>
            <p>We believe a good meal can turn any day around. That's why every BiteVo order is cooked fresh, packed with care and delivered while it's still hot.</p>
            <Link to="/menu" className="btn btn--red">Try BiteVo Today</Link>
          </div>
          <div className="why__grid">
            <div className="feature">
              <div className="feature__icon"><Leaf /></div>
              <h3>Fresh ingredients</h3>
              <p>Quality produce and spices, picked with care every day.</p>
            </div>
            <div className="feature">
              <div className="feature__icon"><Shield /></div>
              <h3>Clean &amp; safe</h3>
              <p>Hygienic kitchens and sealed packaging on every order.</p>
            </div>
            <div className="feature">
              <div className="feature__icon"><Clock /></div>
              <h3>Quick delivery</h3>
              <p>From our kitchen to your door without the long wait.</p>
            </div>
            <div className="feature">
              <div className="feature__icon"><Heart /></div>
              <h3>Made with love</h3>
              <p>Recipes our chefs are proud to serve, every single time.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="section" id="how">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">How it works</span>
            <h2>Your meal in <em>3 easy steps</em></h2>
          </div>
          <ol className="steps">
            <li className="step">
              <span className="step__num">1</span>
              <h3>Choose</h3>
              <p>Browse the menu and pick what you're craving.</p>
            </li>
            <li className="step">
              <span className="step__num">2</span>
              <h3>We cook</h3>
              <p>Our chefs prepare your order fresh, right away.</p>
            </li>
            <li className="step">
              <span className="step__num">3</span>
              <h3>Enjoy</h3>
              <p>It arrives hot at your door. Dig in!</p>
            </li>
          </ol>
        </div>
      </section>

      <AppCta title="Hungry? Order BiteVo now." text="Order right here on the website, or get the app and order in seconds." />
    </>
  );
}
