import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LoadError, DishSkeletons } from '../components/Sections.jsx';
import BannerSlider from '../components/BannerSlider.jsx';
import MenuHeader from '../components/MenuHeader.jsx';
import MoodTabs from '../components/MoodTabs.jsx';
import FilterBar from '../components/FilterBar.jsx';
import DishCard, { DishTile } from '../components/Dish.jsx';
import StoreLock from '../components/StoreLock.jsx';
import { ChevronRight } from '../components/Icons.jsx';
import { useMenu, useConfig } from '../state/menu.js';
import { money } from '../lib/format.js';
import { TABS, TAB_KEYS, FEED_ORDER, NO_FILTERS, tabOf, matches, sortDishes } from '../lib/menuTabs.js';
import usePageTitle from '../lib/usePageTitle.js';

const PREVIEW = 4; // dishes per section on the "All" tab, before "See all"
const TAB = Object.fromEntries(TABS.map(t => [t.key, t]));
const EMPTY_TAB = {
  store: ['No ₹1 items right now', 'Check back soon for ₹1 store deals.'],
  meals: ['No food here right now', 'Please check back in a little while.'],
  drinks: ['No drinks right now', 'Please check back in a little while.'],
  combo: ['Combos are coming soon', 'Meanwhile, build your own from the full menu.'],
};

const GridMini = () => (
  <svg viewBox="0 0 48 48" aria-hidden="true">
    <rect x="3" y="3" width="19" height="19" rx="4.5" /><rect x="26" y="3" width="19" height="19" rx="4.5" />
    <rect x="3" y="26" width="19" height="19" rx="4.5" /><rect x="26" y="26" width="19" height="19" rx="4.5" />
  </svg>
);

function SectionHead({ title, count, seeAll, onSeeAll }) {
  return (
    <div className="feed-head">
      <h2>{title}{count != null && <span>{count}</span>}</h2>
      {onSeeAll && <button type="button" className="see-all" onClick={onSeeAll}>{seeAll || 'See all'} <ChevronRight /></button>}
    </div>
  );
}

export default function Menu() {
  usePageTitle(); // the home page: "BiteVo — Good Food, Better Mood"
  const { hash } = useLocation();
  const navigate = useNavigate();
  const { data: menu, error, loading, reload } = useMenu();
  const { data: config } = useConfig();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(NO_FILTERS);
  const [allRecs, setAllRecs] = useState(false);

  // The selected tab lives in the URL (e.g. /#drinks) so it can be linked to.
  const fromHash = decodeURIComponent(hash.slice(1));
  const tab = TAB_KEYS.includes(fromHash) ? fromHash : 'all';
  // Picking a tab while scrolled down the list jumps back to its start (just under the floating tabs).
  const listStart = useRef(null);
  const choose = key => {
    navigate({ hash: key === 'all' ? '' : `#${key}` }, { replace: true });
    const covered = (document.querySelector('.nav')?.offsetHeight || 0) + (document.querySelector('.tabs--float')?.offsetHeight || 0);
    const top = listStart.current.getBoundingClientRect().top + window.scrollY - covered - 8;
    if (window.scrollY > top) window.scrollTo({ top });
  };

  // The big tabs sit in the red bar; once they scroll away, a slim copy slides in at the top.
  const tabsRow = useRef(null);
  const [floatTabs, setFloatTabs] = useState(false);
  useEffect(() => {
    if (!tabsRow.current) return;
    const io = new IntersectionObserver(([e]) => setFloatTabs(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(tabsRow.current);
    return () => io.disconnect();
  }, []);

  // On phones the menu page has no site header: the red bar at the top takes its place.
  useEffect(() => {
    document.documentElement.classList.add('is-menu-page');
    return () => document.documentElement.classList.remove('is-menu-page');
  }, []);

  // Every dish, with the tab it belongs to.
  const dishes = useMemo(() => {
    if (!menu) return [];
    const labels = Object.fromEntries(menu.categories.map(c => [c.key, c.label]));
    return menu.products.map(p => ({ ...p, tab: tabOf(p, labels[p.category] || '') }));
  }, [menu]);
  const dishNames = useMemo(() => dishes.filter(p => p.isAvailable).map(p => p.name), [dishes]);

  const shown = useMemo(() => sortDishes(dishes.filter(p => matches(p, filters, query)), filters.sort), [dishes, filters, query]);
  const countFor = f => dishes.filter(p => (tab === 'all' || p.tab === tab) && matches(p, f, query)).length;
  const searching = query.trim().length > 0;
  const inTab = key => shown.filter(p => p.tab === key);

  // Bestsellers first, then the rest; ₹1 store items have their own section.
  const recommended = useMemo(() => {
    const pool = shown.filter(p => p.isAvailable && p.tab !== 'store');
    return [...pool.filter(p => p.isBestseller), ...pool.filter(p => !p.isBestseller)].slice(0, 8);
  }, [shown]);
  const showRecs = tab === 'all' && !searching && recommended.length > 0;

  const sections = searching
    ? [{ key: 'results', title: `Results for “${query.trim()}”`, items: tab === 'all' ? shown : inTab(tab) }]
    : tab === 'all'
      ? FEED_ORDER.map(k => ({ key: k, title: TAB[k].title, items: inTab(k), preview: true }))
      : [{ key: tab, title: TAB[tab].title, items: inTab(tab) }];
  const filled = sections.filter(s => s.items.length);
  const narrowed = searching || JSON.stringify(filters) !== JSON.stringify(NO_FILTERS);
  const clearAll = () => { setFilters(NO_FILTERS); setQuery(''); };

  const vegOnly = filters.diet === 'veg';
  const setVegOnly = v => setFilters(f => {
    const on = typeof v === 'function' ? v(f.diet === 'veg') : v;
    return { ...f, diet: on ? 'veg' : 'all' };
  });

  return (
    <>
      <h1 className="visually-hidden">Menu</h1>
      <div className="menu-top">
        <div className="container">
          <MenuHeader query={query} setQuery={setQuery} vegOnly={vegOnly} setVegOnly={setVegOnly} dishNames={dishNames} />
        </div>
        <BannerSlider />
        <MoodTabs ref={tabsRow} active={tab} onChoose={choose} />
      </div>

      <section className="section section--menu">
        <div className="container">
          <FilterBar filters={filters} setFilters={setFilters} countFor={countFor} />
          <div ref={listStart} />

          <div className={`tabs tabs--float${floatTabs ? ' is-shown' : ''}`} role="group" aria-label="Menu tabs" aria-hidden={!floatTabs} inert={floatTabs ? undefined : ''}>
            {TABS.map(t => (
              <button key={t.key} className={`tab${tab === t.key ? ' is-active' : ''}`} aria-pressed={tab === t.key} onClick={() => choose(t.key)}>
                {t.icon ? <img src={t.icon} alt="" /> : <GridMini />}{t.label}
              </button>
            ))}
          </div>

          {loading && <DishSkeletons />}
          {error && <LoadError error={error} onRetry={reload} />}

          {menu && (
            // key replays the card animation whenever the tab or filters change
            <div key={`${tab}-${JSON.stringify(filters)}`}>
              {showRecs && (
                <div className="feed-block">
                  <SectionHead
                    title="Recommended for you"
                    seeAll={allRecs ? 'Show less' : 'See all'}
                    onSeeAll={recommended.length > PREVIEW ? () => setAllRecs(v => !v) : undefined}
                  />
                  <div className={`tiles${allRecs ? ' tiles--all' : ''}`}>
                    {recommended.map(p => <DishTile key={p._id} product={p} />)}
                  </div>
                </div>
              )}

              {filled.map(s => (
                <div className="feed-block" key={s.key}>
                  <SectionHead
                    title={s.title}
                    count={s.preview ? undefined : s.items.length}
                    onSeeAll={s.preview && s.items.length > PREVIEW ? () => choose(s.key) : undefined}
                  />
                  {s.key === 'store' && <StoreLock />}
                  {/* On the "All" tab each section is a sideways row with all its dishes; a single tab or search lists them. */}
                  <div className={s.preview ? 'dish-rail' : 'dish-grid'}>
                    {s.items.map((p, i) => <DishCard key={p._id} product={p} index={i} variant="row" />)}
                  </div>
                </div>
              ))}

              {!filled.length && !showRecs && (
                <div className="empty">
                  {!menu.products.length ? (
                    <><h3>The menu is being updated</h3><p>Please check back in a little while.</p></>
                  ) : narrowed ? (
                    <><h3>No dishes match</h3><p>Try a different search, or clear the filters.</p><button type="button" className="btn btn--outline" onClick={clearAll}>Clear filters</button></>
                  ) : (
                    <><h3>{EMPTY_TAB[tab]?.[0]}</h3><p>{EMPTY_TAB[tab]?.[1]}</p><button type="button" className="btn btn--outline" onClick={() => choose('all')}>See all dishes</button></>
                  )}
                </div>
              )}
            </div>
          )}

          {config && (
            <p className="menu-note">
              {!(config.deliveryFee > 0) ? 'Free delivery on every order.' : config.freeDeliveryOrders > 0 ? `Free delivery on your first ${config.freeDeliveryOrders} orders, then ${money(config.deliveryFee)}.` : `Delivery ${money(config.deliveryFee)}.`} Photos are for illustration.
            </p>
          )}
        </div>
      </section>
    </>
  );
}
