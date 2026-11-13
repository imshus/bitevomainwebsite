// Refund requests: a customer unhappy with an order (the food, missing or wrong items…) asks for their money
// back from the order page, saying where it should go: their BiteVo wallet, or back to how they paid (UPI / card,
// only for orders paid online). The website only records the request; an admin approves (choosing the amount
// and destination) or rejects it in the admin panel (Refund requests), which makes the refund. The customer sees
// the outcome on the order page and gets an email (lib/orderEmails.js).
// Who can ask: a delivered order within REQUEST_WINDOW_DAYS of delivery, or a cancelled order that was paid for
// but not refunded. One request per order.
import { DAY } from './http.js';

export const REQUEST_WINDOW_DAYS = 3;

export const REASONS = {
  quality: 'Food quality or taste',
  missing: 'Items missing',
  wrong: 'Wrong items',
  late: 'Very late delivery',
  other: 'Something else',
};

// What the customer paid for this order, by how: { online, wallet, cash, total }. (The admin panel's
// lib/refunds.js counts it the same way.)
export function paidFor(order) {
  const online = order.payment?.provider === 'razorpay' && order.payment.paymentId ? order.payment.amount || 0 : 0;
  const wallet = order.walletUsed || 0;
  const cash = order.paymentMethod === 'Cash on delivery' && order.status === 'delivered' ? Math.max(0, (order.total || 0) - wallet) : 0;
  return { online, wallet, cash, total: online + wallet + cash };
}

// Why this order can't have a refund request, or null.
export function cantRequest(order, existing) {
  if (existing) return 'You’ve already asked for a refund on this order.';
  if (['placed', 'preparing', 'out_for_delivery'].includes(order.status)) return 'You can ask for a refund once the order is delivered.';
  if (order.refund) return 'This order has already been refunded.';
  if (paidFor(order).total <= 0) return 'Nothing was paid for this order.';
  if (order.status === 'cancelled') return null;
  if (order.status !== 'delivered') return 'You can ask for a refund once the order is delivered.';
  const since = Date.now() - Date.parse(order.deliveredAt || order.updatedAt || order.placedAt);
  if (since > REQUEST_WINDOW_DAYS * DAY) return `Refunds can be requested up to ${REQUEST_WINDOW_DAYS} days after delivery. Please contact support.`;
  return null;
}

// The request as the customer sees it.
export const publicRequest = r => r && ({
  _id: r._id,
  status: r.status, // pending | approved | rejected
  reason: r.reasonLabel || REASONS[r.reason] || r.reason,
  details: r.details || '',
  amount: r.amount,
  to: r.to,
  createdAt: r.createdAt,
  decidedAt: r.decidedAt || null,
  note: r.note || '',
  decision: r.decision || null,
});
