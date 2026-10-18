import { PageHero, AppCta } from '../components/Sections.jsx';
import { ChefHat, Leaf, Shield, Users, Target, Heart } from '../components/Icons.jsx';
import { photo } from '../lib/photo.js';
import usePageTitle from '../lib/usePageTitle.js';

const VALUES = [
  { icon: <ChefHat />, title: 'Taste comes first', text: 'Recipes our chefs perfect and are proud to serve, every single time.' },
  { icon: <Leaf />, title: 'Fresh, always', text: 'Quality ingredients, cooked when you order — never sitting around.' },
  { icon: <Shield />, title: 'Clean & safe', text: 'Hygienic kitchens and sealed packaging, because your safety matters.' },
  { icon: <Users />, title: 'Customers at heart', text: 'We listen to your feedback and keep getting better because of it.' },
];

const KITCHEN = [
  { id: '1610348725531-843dff563e2c', w: 700, h: 900, alt: 'Fresh fruits and vegetables around a cutting board', caption: 'Fresh ingredients', mod: 'tall' },
  { id: '1581600140682-d4e68c8cde32', w: 700, h: 500, alt: 'Whole and ground spices', caption: 'Real, whole spices' },
  { id: '1596450514659-4ff64fdde903', w: 700, h: 500, alt: 'Food cooking in a pan', caption: 'Cooked to order' },
  { id: '1581349485608-9469926a8e5e', w: 1000, h: 500, alt: 'Chef preparing food in a kitchen', caption: 'Made by our chefs', mod: 'wide' },
];

export default function About() {
  usePageTitle('About Us');

  return (
    <>
      <PageHero pill="About Us" title={<>The story behind <em>every bite</em></>}>
        BiteVo is built on one simple belief: a good meal can turn any day around.
      </PageHero>

      {/* Story */}
      <section className="section">
        <div className="container story">
          <div className="story__collage">
            <img className="story__img story__img--main" src={photo('1622021142947-da7dedc7c39a', 760, 900)} alt="Chef chopping fresh vegetables in a kitchen" loading="lazy" />
            <img className="story__img story__img--small" src={photo('1715000938476-2b587d4482f5', 520, 420)} alt="Chefs cooking together in a busy kitchen" loading="lazy" />
            <div className="story__badge">
              <img src="/assets/icon-180.png" alt="" width="180" height="180" />
              <span>Good food<br /><b>Better mood</b></span>
            </div>
          </div>
          <div className="story__text">
            <span className="eyebrow">Our Story</span>
            <h2>Why we started <em>BiteVo</em></h2>
            <p>We've all had that moment: you're hungry, you order something, and what arrives is cold, late or just not what you hoped for. We started BiteVo to change that.</p>
            <p>Our idea was simple. Cook every dish fresh in our own kitchens, use ingredients we would happily serve our own families, and get it to your door while it's still hot. No shortcuts and no compromises on taste.</p>
            <p>That's where our name and our promise come from: <strong>good food, better mood.</strong> Every order we send out should make your day a little better.</p>
          </div>
        </div>
      </section>

      {/* Mission & promise */}
      <section className="section section--tint">
        <div className="container">
          <div className="mv">
            <div className="mv__card">
              <div className="feature__icon"><Target /></div>
              <h3>Our Mission</h3>
              <p>To make fresh, tasty and hygienic food easy to order, so a great meal is always just a few taps away.</p>
            </div>
            <div className="mv__card">
              <div className="feature__icon"><Heart /></div>
              <h3>Our Promise</h3>
              <p>Every dish cooked fresh, packed with care and delivered hot. If something isn't right, we'll make it right.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="section">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">What we stand for</span>
            <h2>Our <em>values</em></h2>
          </div>
          <div className="values">
            {VALUES.map(v => (
              <div className="feature" key={v.title}>
                <div className="feature__icon">{v.icon}</div>
                <h3>{v.title}</h3>
                <p>{v.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Inside our kitchen */}
      <section className="section section--tight">
        <div className="container">
          <div className="section__head">
            <span className="eyebrow">Inside our kitchen</span>
            <h2>Where the <em>magic</em> happens</h2>
          </div>
          <div className="mosaic">
            {KITCHEN.map(k => (
              <figure className={`mosaic__item${k.mod ? ` mosaic__item--${k.mod}` : ''}`} key={k.id}>
                <img src={photo(k.id, k.w, k.h)} alt={k.alt} loading="lazy" />
                <figcaption>{k.caption}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Tagline band */}
      <section className="quote-band">
        <div className="container">
          <p>&ldquo;Good food, <em>better mood.</em>&rdquo;</p>
          <span>— The BiteVo promise</span>
        </div>
      </section>

      <AppCta spaced title="Taste the difference." text="Download the BiteVo app and place your first order today." />
    </>
  );
}
