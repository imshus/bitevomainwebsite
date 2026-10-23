// The five menu tabs in a white bar that joins the red header to the menu below. Each tab is a round picture
// with its name; the selected one is outlined in red, with its name in red and a short red line under it.
import { forwardRef } from 'react';
import { TABS } from '../lib/menuTabs.js';

const GridIcon = () => (
  <svg viewBox="0 0 48 48" className="mood-tab__grid" aria-hidden="true">
    <rect x="3" y="3" width="19" height="19" rx="4.5" /><rect x="26" y="3" width="19" height="19" rx="4.5" />
    <rect x="3" y="26" width="19" height="19" rx="4.5" /><rect x="26" y="26" width="19" height="19" rx="4.5" />
  </svg>
);

const MoodTabs = forwardRef(function MoodTabs({ active, onChoose }, ref) {
  return (
    <section className="mood" aria-label="Menu sections">
      <div className="mood__bar">
        <div className="mood__tabs" ref={ref} role="group" aria-label="Menu tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              type="button"
              className={`mood-tab mood-tab--${t.key}${active === t.key ? ' is-active' : ''}`}
              aria-pressed={active === t.key}
              onClick={() => onChoose(t.key)}
            >
              <span className="mood-tab__icon">{t.icon ? <img src={t.icon} alt="" /> : <GridIcon />}</span>
              <span className="mood-tab__label">{t.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
});

export default MoodTabs;
