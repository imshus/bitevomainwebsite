// Emails about orders that the admin panel or the rider app finish (they change the shared database, so this API
// looks every 2 minutes). Needs the mailbox (SMTP_USER / SMTP_PASS) and an email address on the account (asked
// for when signing up). Each email goes once; a failed send is tried again on the next checks, up to 3 times.
//   Invoice: each order delivered in the last 6 hours gets its invoice (invoiceEmailedAt).
//   Refund started: each paid order cancelled in the last 6 hours (by the customer, the kitchen or the admin
//     panel) gets how much goes back and where, wallet and/or UPI / card (refundEmailedAt).
//   Refund request decided: a customer's refund request approved or rejected in the admin panel in the last 6
//     hours gets the outcome (refundRequests.emailedAt). Refunds an admin made from an order's page count too.
//   Refund done: a refund to UPI / card gets a second email once Razorpay confirms it (refund.refundStatus
//     'processed', set by the Razorpay webhook), for refunds of the last 10 days (refundDoneEmailedAt).
// The time windows mean switching the mailbox on doesn't email customers about old orders.
import { store } from '../db/index.js';
import { config } from '../config.js';
import { nowIso, MIN, DAY } from './http.js';
import { serialize } from './rules.js';
import { mailEnabled, sendMail, invoiceEmail, refundEmail, refundDecisionEmail } from './mail.js';

const RECENT_MS = 6 * 60 * MIN;
const REFUND_DONE_MS = 10 * DAY;
const MAX_TRIES = 3;

// Sends one kind of email for an order once: `flag` holds when it went out, `${flag}Tries` the failed tries.
async function sendOnce(order, flag, build) {
  const tries = `${flag}Tries`;
  if (order[flag] || (order[tries] || 0) >= MAX_TRIES) return;
  const customer = await store.findById('customers', order.customerId);
  if (!customer?.email) {
    await store.update('orders', order._id, { [tries]: MAX_TRIES, [`${flag}Error`]: 'No email address on the account' });
    return;
  }
  const sent = await sendMail(build(customer));
  await store.update('orders', order._id, sent
    ? { [flag]: nowIso(), [`${flag}To`]: customer.email }
    : { [tries]: (order[tries] || 0) + 1, [`${flag}Error`]: 'Sending failed (see the API log)' });
}

export function sendOrderEmails() {
  return serialize('order-emails', async () => {
    if (!mailEnabled()) return;
    const apiBase = config.apiUrl || undefined;
    const recent = new Date(Date.now() - RECENT_MS).toISOString();

    for (const order of await store.find('orders', { status: 'delivered', deliveredAt: { $gte: recent } })) {
      await sendOnce(order, 'invoiceEmailedAt', customer => invoiceEmail(customer, order, { apiBase }));
    }

    const since = new Date(Date.now() - REFUND_DONE_MS).toISOString();
    for (const order of await store.find('orders', { status: 'cancelled', cancelledAt: { $gte: since } })) {
      const refund = order.refund;
      if (!(refund?.amount > 0)) continue;
      // Refunds from the admin panel's Refund (refund.at) are told by the request email below instead.
      if (order.cancelledAt >= recent && !refund.at) await sendOnce(order, 'refundEmailedAt', customer => refundEmail(customer, order, 'started'));
      if (refund.to === 'source' && refund.refundStatus === 'processed') {
        await sendOnce(order, 'refundDoneEmailedAt', customer => refundEmail(customer, order, 'done'));
      }
    }

    for (const request of await store.find('refundRequests', { decidedAt: { $gte: since } })) {
      const order = await store.findById('orders', request.orderId);
      if (request.decidedAt >= recent && !request.emailedAt && (request.emailTries || 0) < MAX_TRIES) {
        const customer = await store.findById('customers', request.customerId);
        if (!customer?.email) await store.update('refundRequests', request._id, { emailTries: MAX_TRIES, emailError: 'No email address on the account' });
        else {
          const sent = await sendMail(refundDecisionEmail(customer, request, order));
          await store.update('refundRequests', request._id, sent ? { emailedAt: nowIso() } : { emailTries: (request.emailTries || 0) + 1, emailError: 'Sending failed (see the API log)' });
        }
      }
      // An approved refund to UPI / card on a delivered order: the "sent" email once Razorpay confirms it.
      if (order && order.status !== 'cancelled' && order.refund?.to === 'source' && order.refund.refundStatus === 'processed') {
        await sendOnce(order, 'refundDoneEmailedAt', customer => refundEmail(customer, order, 'done'));
      }
    }
  });
}

export function startOrderEmails(everyMs = 2 * MIN) {
  const run = () => sendOrderEmails().catch(err => console.error(`Order emails failed: ${err.message}`));
  run();
  setInterval(run, everyMs).unref();
}
