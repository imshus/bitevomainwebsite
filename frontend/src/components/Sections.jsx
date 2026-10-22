import { Link } from 'react-router-dom';
import { Apple, Play } from './Icons.jsx';

export function PageHero({ pill, title, children, compact = false, className = '' }) {
  return (
    <section className={`page-hero${compact ? ' page-hero--compact' : ''} ${className}`.trim()}>
      <div className="container">
        {pill && <span className="pill">{pill}</span>}
        <h1>{title}</h1>
        {children && <p>{children}</p>}
      </div>
    </section>
  );
}

// "Order now" banner, with the app store badges. Replace the store hrefs with your real App Store / Google Play links.
export function AppCta({ title, text, spaced = false }) {
  return (
    <section className={`cta${spaced ? ' cta--spaced' : ''}`} id="app">
      <div className="container">
        <div className="cta__card">
          <div className="cta__text">
            <h2>{title}</h2>
            <p>{text}</p>
          </div>
          <div className="cta__buttons">
            <Link to="/" className="store store--order">
              <span><small>Order right here on</small>bitevo.in</span>
            </Link>
            <a href="#" className="store">
              <Apple />
              <span><small>Download on the</small>App Store</span>
            </a>
            <a href="#" className="store">
              <Play />
              <span><small>Get it on</small>Google Play</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

// Loading and error states for pages that fetch data.
export function Loading({ label = 'Loading…' }) {
  return <div className="state"><span className="spinner" aria-hidden="true" />{label}</div>;
}

export function LoadError({ error, onRetry }) {
  return (
    <div className="state state--error" role="alert">
      <p>{error?.message || 'Something went wrong.'}</p>
      {onRetry && <button type="button" className="btn btn--outline" onClick={onRetry}>Try again</button>}
    </div>
  );
}

// Grey placeholder shapes in the layout of what's loading, so the page doesn't jump when it arrives.
export function DishSkeletons({ count = 8 }) {
  return (
    <div className="menu menu--full menu--order" aria-busy="true" aria-label="Loading the menu">
      {Array.from({ length: count }, (_, i) => (
        <div className="dish dish--order dish--skeleton" key={i} style={{ '--i': i }}>
          <div className="dish__img sk" />
          <div className="dish__body">
            <span className="sk sk--line" style={{ width: '30%' }} />
            <span className="sk sk--title" />
            <span className="sk sk--line" />
            <span className="sk sk--line" style={{ width: '70%' }} />
            <div className="dish__foot"><span className="sk sk--line" style={{ width: 60 }} /><span className="sk sk--btn" /></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function CardSkeletons({ count = 3 }) {
  return (
    <div className="order-list" aria-busy="true" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <div className="order-card order-card--skeleton" key={i} style={{ '--i': i }}>
          <div className="order-card__main">
            <div className="order-card__top"><span className="sk sk--title" style={{ width: 120 }} /><span className="sk sk--pill" /></div>
            <span className="sk sk--line" style={{ width: '80%' }} />
            <span className="sk sk--line" style={{ width: '45%' }} />
          </div>
        </div>
      ))}
    </div>
  );
}
