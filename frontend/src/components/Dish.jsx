// Menu building blocks: the veg/non-veg mark, the Add button / quantity stepper, the dish card and
// the dish details sheet.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart, hasHalfPlate } from '../state/cart.jsx';
import { money } from '../lib/format.js';
import { srcSet, sized } from '../lib/photo.js';
import { flyToCart } from '../lib/motion.js';
import Modal from './Modal.jsx';
import { Clock, ChevronRight } from './Icons.jsx';

// How wide a dish photo shows: a thumbnail beside the text on phones, a column of the grid above that.
const PHOTO_SIZES = '(max-width: 520px) 140px, (max-width: 980px) 50vw, 280px';

// Photos fade in once loaded (cached photos are shown straight away).
const fadeIn = img => { if (img?.complete && img.naturalWidth) img.classList.add('is-loaded'); };
const onLoaded = e => e.currentTarget.classList.add('is-loaded');

export function VegMark({ veg }) {
  return <span className={`veg-mark${veg ? '' : ' veg-mark--non'}`} role="img" aria-label={veg ? 'Vegetarian' : 'Non-vegetarian'} title={veg ? 'Veg' : 'Non-veg'} />;
}

export function Stepper({ qty, onChange, label, small = false, max = 20 }) {
  return (
    <div className={`stepper${small ? ' stepper--sm' : ''}`} role="group" aria-label={`Quantity of ${label}`}>
      <button type="button" onClick={() => onChange(qty - 1)} aria-label={qty === 1 ? `Remove ${label}` : `Remove one ${label}`}>−</button>
      <span className="stepper__n" aria-live="polite"><b key={qty}>{qty}</b></span>
      <button type="button" onClick={() => onChange(qty + 1)} aria-label={`Add one more ${label}`} disabled={qty >= max}>+</button>
    </div>
  );
}

// `photo` is the element the fly-to-cart animation starts from (the card's or the sheet's photo).
// Dishes that come as a half or a full plate open the portion chooser instead (its + and − too).
export function AddButton({ product, wide = false, compact = false }) {
  const cart = useCart();
  const [choosing, setChoosing] = useState(false);
  const qty = cart.qtyOf(product._id);
  if (!product.isAvailable) return <span className="sold-out">Sold out</span>;
  const portions = hasHalfPlate(product);
  const chooser = choosing && <PortionPicker product={product} onClose={() => setChoosing(false)} />;
  if (qty) {
    return (
      <>
        <Stepper qty={qty} label={product.name} onChange={n => (portions ? setChoosing(true) : cart.setQty(product, n))} small={compact} max={portions ? 99 : cart.maxQtyOf(product)} />
        {chooser}
      </>
    );
  }
  const add = e => {
    if (portions) { setChoosing(true); return; }
    const photo = e.currentTarget.closest('.dish, .tile, .dish-sheet')?.querySelector('img');
    flyToCart(photo);
    cart.add(product);
  };
  return (
    <>
      <button type="button" className={`add-btn${wide ? ' add-btn--wide' : ''}${compact ? ' add-btn--sm' : ''}${portions ? ' add-btn--choose' : ''}`} onClick={add} aria-label={portions ? `Add ${product.name}: choose half or full plate` : `Add ${product.name} to cart`} aria-haspopup={portions ? 'dialog' : undefined}>
        Add <span aria-hidden="true">+</span>
        {portions && <small>Half / Full</small>}
      </button>
      {chooser}
    </>
  );
}

// The two portions of a dish that has a half plate, each with its own Add / quantity.
function PortionRows({ product }) {
  const cart = useCart();
  const portions = [
    { key: 'half', label: 'Half plate', price: product.halfPrice },
    { key: 'full', label: 'Full plate', price: product.price, mrp: product.mrp },
  ];
  return (
    <ul className="portions">
      {portions.map(o => {
        const qty = cart.qtyOf(product._id, o.key);
        return (
          <li key={o.key} className={`portion${qty ? ' is-on' : ''}`}>
            <span className="portion__text"><b>{o.label}</b><Price price={o.price} mrp={o.mrp} /></span>
            {qty
              ? <Stepper small qty={qty} label={`${o.label}, ${product.name}`} onChange={n => cart.setQty(product, n, o.key)} />
              : <button type="button" className="add-btn add-btn--sm" onClick={() => cart.add(product, o.key)} aria-label={`Add a ${o.label.toLowerCase()} of ${product.name}`}>Add <span aria-hidden="true">+</span></button>}
          </li>
        );
      })}
    </ul>
  );
}

function PortionPicker({ product, onClose }) {
  const cart = useCart();
  const qty = cart.qtyOf(product._id);
  return (
    <Modal onClose={onClose} label={`${product.name}: half or full plate`} className="portion-sheet">
      <div className="portion-sheet__head"><VegMark veg={product.isVeg} /><h2>{product.name}</h2></div>
      <p className="portion-sheet__hint">Choose your portion</p>
      <PortionRows product={product} />
      <button type="button" className="btn btn--red btn--block" onClick={onClose}>{qty ? `Done · ${qty} in cart` : 'Done'}</button>
    </Modal>
  );
}

// `half`: the half-plate price, shown under the (full plate) price.
export function Price({ price, mrp, half }) {
  return (
    <span className="price">
      <b>{money(price)}</b>
      {mrp > price && <s>{money(mrp)}</s>}
      {mrp > price && <small>{Math.round(((mrp - price) / mrp) * 100)}% off</small>}
      {half > 0 && <span className="price__half">Half {money(half)}</span>}
    </span>
  );
}

const comboLine = items => items.map(i => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`).join(' + ');

// Bigger photo, the full description, what's in a combo and how long it takes.
function DishSheet({ product, onClose }) {
  const cart = useCart();
  const qty = cart.qtyOf(product._id);
  return (
    <Modal onClose={onClose} label={product.name} className="dish-sheet">
      <div className="dish-sheet__img">
        {product.image
          ? <img src={sized(product.image, 800, 600)} alt={product.name} ref={fadeIn} onLoad={onLoaded} />
          : <div className="dish__placeholder" aria-hidden="true">{product.name[0]}</div>}
        {product.isBestseller && <span className="dish__badge">Bestseller</span>}
      </div>
      <div className="dish-sheet__body">
        <div className="dish__meta">
          <VegMark veg={product.isVeg} />
          {product.heading && <span className="dish__tag">{product.heading}</span>}
        </div>
        <h2>{product.name}</h2>
        <Price price={product.price} mrp={product.mrp} half={hasHalfPlate(product) ? product.halfPrice : null} />
        {product.type === 'combo' && product.comboItems?.length > 0 && (
          <div className="dish-sheet__combo">
            <b>In this combo</b>
            <ul>{product.comboItems.map(i => <li key={i.name}><span>{i.qty} ×</span> {i.name}</li>)}</ul>
          </div>
        )}
        {product.description && <p className="dish-sheet__desc">{product.description}</p>}
        {product.prepTimeMins && <p className="dish-sheet__time"><Clock /> Freshly made in about {product.prepTimeMins} min</p>}
        {hasHalfPlate(product) && product.isAvailable && <PortionRows product={product} />}
        <div className="dish-sheet__cta">
          {!(hasHalfPlate(product) && product.isAvailable) && <AddButton product={product} wide />}
          {qty > 0 && <Link to="/checkout" className="btn btn--red" onClick={onClose}>View cart · {money(cart.itemTotal)}</Link>}
        </div>
      </div>
    </Modal>
  );
}

// `variant="row"`: photo on the left inside a white card, as in the menu's "Food and Meals" grid.
export default function DishCard({ product, index = 0, variant }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`dish dish--order${variant === 'row' ? ' dish--row' : ''}${product.isAvailable ? '' : ' is-unavailable'}`} style={{ '--i': Math.min(index, 11) }}>
      <button type="button" className="dish__img" onClick={() => setOpen(true)} aria-label={`More about ${product.name}`}>
        {product.image
          ? <img src={product.image} srcSet={srcSet(product.image)} sizes={variant === 'row' ? '170px' : PHOTO_SIZES} alt={product.name} loading="lazy" decoding="async" ref={fadeIn} onLoad={onLoaded} />
          : <div className="dish__placeholder" aria-hidden="true">{product.name[0]}</div>}
        {product.isBestseller && <span className="dish__badge">Bestseller</span>}
      </button>
      <div className="dish__body">
        <div className="dish__meta">
          <VegMark veg={product.isVeg} />
          {product.heading && <span className="dish__tag">{product.heading}</span>}
        </div>
        <h3><button type="button" className="dish__name" onClick={() => setOpen(true)}>{product.name}</button></h3>
        {product.type === 'combo' && product.comboItems?.length > 0 && <p className="dish__combo">{comboLine(product.comboItems)}</p>}
        {product.description && <p>{product.description}</p>}
        <div className="dish__foot">
          <Price price={product.price} mrp={product.mrp} half={hasHalfPlate(product) ? product.halfPrice : null} />
          <AddButton product={product} />
        </div>
      </div>
      {open && <DishSheet product={product} onClose={() => setOpen(false)} />}
    </article>
  );
}

// A small card for the "Recommended for you" row: photo on top, then name, price and Add.
export function DishTile({ product }) {
  const [open, setOpen] = useState(false);
  return (
    <article className={`tile${product.isAvailable ? '' : ' is-unavailable'}`}>
      <button type="button" className="tile__img" onClick={() => setOpen(true)} aria-label={`More about ${product.name}`}>
        {product.image
          ? <img src={product.image} srcSet={srcSet(product.image)} sizes="210px" alt={product.name} loading="lazy" decoding="async" ref={fadeIn} onLoad={onLoaded} />
          : <div className="dish__placeholder" aria-hidden="true">{product.name[0]}</div>}
        {product.isBestseller && <span className="tile__badge">Bestseller</span>}
      </button>
      <div className="tile__body">
        <button type="button" className="tile__name" onClick={() => setOpen(true)}>
          <span>{product.name}</span><ChevronRight />
        </button>
        <div className="tile__foot">
          <b className="tile__price">{hasHalfPlate(product) ? <>{money(product.halfPrice)}<small> onwards</small></> : money(product.price)}</b>
          <AddButton product={product} compact />
        </div>
      </div>
      {open && <DishSheet product={product} onClose={() => setOpen(false)} />}
    </article>
  );
}
