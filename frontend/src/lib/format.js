// Formatting helpers shared by the ordering pages.

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = n => inr.format(Math.round(n || 0));

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const timeFmt = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

export const formatTime = iso => timeFmt.format(new Date(iso));

// "Today, 7:42 pm", "Yesterday, 1:05 pm" or "12 Oct 2026, 8:30 pm"
export function formatWhen(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  const day = same(d, today) ? 'Today' : same(d, yesterday) ? 'Yesterday' : dateFmt.format(d);
  return `${day}, ${timeFmt.format(d)}`;
}

// Order statuses (set by the kitchen in the admin panel).
export const ORDER_STATUS = {
  placed: { label: 'Order placed', short: 'Placed', tone: 'amber' },
  preparing: { label: 'Being prepared', short: 'Preparing', tone: 'amber' },
  out_for_delivery: { label: 'Out for delivery', short: 'On the way', tone: 'blue' },
  delivered: { label: 'Delivered', short: 'Delivered', tone: 'green' },
  cancelled: { label: 'Cancelled', short: 'Cancelled', tone: 'grey' },
};
export const LIVE_STATUSES = ['placed', 'preparing', 'out_for_delivery'];

export const itemsSummary = items => items.map(i => `${i.qty} × ${i.name}`).join(', ');

export const addressLine = a => [a.line1, a.line2, a.landmark && `Near ${a.landmark}`, a.zone, a.pincode].filter(Boolean).join(', ');

// What an offer gives, in a few words.
export function offerHeadline(o) {
  switch (o.discountType) {
    case 'percent': return `${o.discountValue}% off${o.maxDiscount ? ` up to ${money(o.maxDiscount)}` : ''}`;
    case 'flat': return `${money(o.discountValue)} off`;
    case 'free_delivery': return 'Free delivery';
    case 'free_item': return `Free ${o.freeItem?.name || 'item'}`;
    case 'cashback': return o.cashbackUnit === 'flat' ? `${money(o.discountValue)} cashback` : `${o.discountValue}% cashback${o.maxDiscount ? ` up to ${money(o.maxDiscount)}` : ''}`;
    default: return o.code;
  }
}
