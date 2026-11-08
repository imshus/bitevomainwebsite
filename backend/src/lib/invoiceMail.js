// Emails each customer their invoice once their order is delivered (the admin panel or the rider app marks it
// delivered, so this API checks every 2 minutes). Needs the mailbox (SMTP_USER / SMTP_PASS) and an email
// address on the account. Each order is emailed once (invoiceEmailedAt); a failed send is tried again on the
// next checks, up to 3 times. Only orders delivered in the last 6 hours are looked at, so switching the mailbox
// on doesn't email invoices for old orders.
import { store } from '../db/index.js';
import { config } from '../config.js';
import { nowIso, MIN } from './http.js';
import { serialize } from './rules.js';
import { mailEnabled, sendMail, invoiceEmail } from './mail.js';

const WINDOW_MS = 6 * 60 * MIN;
const MAX_TRIES = 3;

export function sendInvoiceEmails() {
  return serialize('invoice-emails', async () => {
    if (!mailEnabled()) return;
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const delivered = await store.find('orders', { status: 'delivered', deliveredAt: { $gte: since } });
    for (const order of delivered) {
      if (order.invoiceEmailedAt || (order.invoiceEmailTries || 0) >= MAX_TRIES) continue;
      const customer = await store.findById('customers', order.customerId);
      if (!customer?.email) {
        await store.update('orders', order._id, { invoiceEmailTries: MAX_TRIES, invoiceEmailError: 'No email address on the account' });
        continue;
      }
      const sent = await sendMail(invoiceEmail(customer, order, { apiBase: config.apiUrl || undefined }));
      await store.update('orders', order._id, sent
        ? { invoiceEmailedAt: nowIso(), invoiceEmailedTo: customer.email }
        : { invoiceEmailTries: (order.invoiceEmailTries || 0) + 1, invoiceEmailError: 'Sending failed (see the API log)' });
    }
  });
}

export function startInvoiceEmails(everyMs = 2 * MIN) {
  const run = () => sendInvoiceEmails().catch(err => console.error(`Invoice emails failed: ${err.message}`));
  run();
  setInterval(run, everyMs).unref();
}
