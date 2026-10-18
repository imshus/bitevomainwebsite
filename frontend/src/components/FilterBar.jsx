// The row of chips under the menu tabs: Filters, Near & Fast, Pure Veg, Offers and Sort.
// "Filters" and "Sort" open small sheets; the other three switch on and off.
import { useState } from 'react';
import Modal from './Modal.jsx';
import { ChevronDown } from './Icons.jsx';
import { NO_FILTERS, PRICE_RANGES, SORTS, FAST_MINS, filterCount } from '../lib/menuTabs.js';

const Sliders = () => <svg viewBox="0 0 24 24" aria-hidden="true" className="fchip__stroke"><path d="M4 7h9M17 7h3M4 17h3M11 17h9" /><circle cx="15" cy="7" r="2.2" /><circle cx="9" cy="17" r="2.2" /></svg>;
const Bolt = () => <svg viewBox="0 0 24 24" aria-hidden="true" className="fchip__fill"><path d="M13.5 2 4.5 13.6h6.2L9.6 22l9.9-12.3h-6.4L13.5 2Z" /></svg>;
const LeafFill = () => <svg viewBox="0 0 24 24" aria-hidden="true" className="fchip__leaf"><path d="M20.5 3.5C11 3.6 4.8 8 4.6 15.6c-.1 1.6.3 3 .9 4.2C7.4 13.9 11 10.7 15.5 8.6c-3.7 2.6-6.6 6.2-8.1 11.2 1.2.5 2.5.7 3.8.6C19 19.6 21 11.6 20.5 3.5Z" /></svg>;
const TagFill = () => <svg viewBox="0 0 24 24" aria-hidden="true" className="fchip__fill"><path d="M2.5 12.2V4.1c0-.9.7-1.6 1.6-1.6h8.1c.4 0 .8.2 1.1.5l8.2 8.2c.6.6.6 1.6 0 2.3l-8.1 8.1c-.6.6-1.6.6-2.3 0L3 13.3c-.3-.3-.5-.7-.5-1.1Zm5-5.8a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z" /></svg>;
const SortArrows = () => <svg viewBox="0 0 24 24" aria-hidden="true" className="fchip__stroke"><path d="M8 4v15M4.5 15.5 8 19l3.5-3.5M16 20V5M12.5 8.5 16 5l3.5 3.5" /></svg>;

function Choice({ name, options, value, onChange }) {
  return (
    <div className="choice" role="radiogroup" aria-label={name}>
      {options.map(o => (
        <button key={o.key} type="button" role="radio" aria-checked={value === o.key} className={`choice__opt${value === o.key ? ' is-on' : ''}`} onClick={() => onChange(o.key)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function FiltersSheet({ filters, onApply, onClose, countFor }) {
  const [draft, setDraft] = useState(filters);
  const set = (key, value) => setDraft(d => ({ ...d, [key]: value }));
  const n = countFor(draft);
  return (
    <Modal onClose={onClose} label="Filters" className="filters-sheet">
      <h2>Filters</h2>
      <h3>Show</h3>
      <Choice name="Show" value={draft.diet} onChange={v => set('diet', v)} options={[
        { key: 'all', label: 'All dishes' }, { key: 'veg', label: 'Veg only' }, { key: 'nonveg', label: 'Non-veg only' },
      ]} />
      <h3>Price</h3>
      <Choice name="Price" value={draft.price} onChange={v => set('price', v)} options={PRICE_RANGES} />
      <h3>More</h3>
      <label className="check"><input type="checkbox" checked={draft.bestsellers} onChange={e => set('bestsellers', e.target.checked)} /> Bestsellers only</label>
      <label className="check"><input type="checkbox" checked={draft.offers} onChange={e => set('offers', e.target.checked)} /> On offer</label>
      <label className="check"><input type="checkbox" checked={draft.fast} onChange={e => set('fast', e.target.checked)} /> Ready in {FAST_MINS} min or less</label>
      <div className="filters-sheet__actions">
        <button type="button" className="btn btn--outline" onClick={() => setDraft({ ...NO_FILTERS, sort: draft.sort })}>Clear all</button>
        <button type="button" className="btn btn--red" onClick={() => { onApply(draft); onClose(); }} disabled={!n}>
          {n ? `Show ${n} dish${n === 1 ? '' : 'es'}` : 'No dishes match'}
        </button>
      </div>
    </Modal>
  );
}

function SortSheet({ value, onChange, onClose }) {
  return (
    <Modal onClose={onClose} label="Sort" className="filters-sheet">
      <h2>Sort by</h2>
      <div className="sort-list" role="radiogroup" aria-label="Sort by">
        {SORTS.map(s => (
          <label key={s.key} className="check check--radio">
            <input type="radio" name="sort" checked={value === s.key} onChange={() => { onChange(s.key); onClose(); }} /> {s.label}
          </label>
        ))}
      </div>
    </Modal>
  );
}

export default function FilterBar({ filters, setFilters, countFor }) {
  const [sheet, setSheet] = useState(null);
  const toggle = key => setFilters(f => ({ ...f, [key]: !f[key] }));
  const n = filterCount(filters);
  return (
    <>
      <div className="chips-row" role="toolbar" aria-label="Filter and sort the menu">
        <button type="button" className={`fchip${n ? ' is-on' : ''}`} onClick={() => setSheet('filters')} aria-haspopup="dialog">
          <Sliders /> Filters{n > 0 && <span className="fchip__count">{n}</span>} <ChevronDown />
        </button>
        <button type="button" className={`fchip${filters.fast ? ' is-on' : ''}`} aria-pressed={filters.fast} onClick={() => toggle('fast')} title={`Ready in ${FAST_MINS} minutes or less`}>
          <Bolt /> Near &amp; Fast
        </button>
        <button type="button" className={`fchip fchip--veg${filters.diet === 'veg' ? ' is-on' : ''}`} aria-pressed={filters.diet === 'veg'} onClick={() => setFilters(f => ({ ...f, diet: f.diet === 'veg' ? 'all' : 'veg' }))}>
          <LeafFill /> Pure Veg
        </button>
        <button type="button" className={`fchip${filters.offers ? ' is-on' : ''}`} aria-pressed={filters.offers} onClick={() => toggle('offers')}>
          <TagFill /> Offers
        </button>
        <button type="button" className={`fchip${filters.sort !== 'relevance' ? ' is-on' : ''}`} onClick={() => setSheet('sort')} aria-haspopup="dialog">
          <SortArrows /> Sort <ChevronDown />
        </button>
      </div>
      {sheet === 'filters' && <FiltersSheet filters={filters} countFor={countFor} onApply={f => setFilters(f)} onClose={() => setSheet(null)} />}
      {sheet === 'sort' && <SortSheet value={filters.sort} onChange={v => setFilters(f => ({ ...f, sort: v }))} onClose={() => setSheet(null)} />}
    </>
  );
}
