// The order's invoice: one printable page (the browser's "Save as PDF" makes the PDF) with everything on the
// bill: the business, the customer and the delivery address, each dish with its quantity, rate and amount, the
// delivery fee, offers, GST (when GSTIN is set), the total, and how it was paid (wallet, online through Razorpay
// with the payment ID, or cash on delivery), plus cashback and any refund.
// Opened from the order page (signed-in customer: GET /api/orders/:id/invoice) or from a signed link that works
// without signing in for a while (the app opens it in the phone's browser; the order email links to it):
// GET /api/invoices/:id?e=<expiry>&s=<signature>.
import crypto from 'node:crypto';
import fs from 'node:fs';
import { config } from '../config.js';

const DAY = 24 * 60 * 60 * 1000;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr2 = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rs = n => inr2.format(Math.round((Number(n) || 0) * 100) / 100);
const TZ = 'Asia/Kolkata';
const day = iso => new Date(iso).toLocaleDateString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric' });
const when = iso => new Date(iso).toLocaleString('en-IN', { timeZone: TZ, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

// ---- Signed links ------------------------------------------------------------------------------

const sign = (orderId, exp) => crypto.createHmac('sha256', config.authSecret).update(`invoice:${orderId}:${exp}`).digest('hex').slice(0, 40);

// "/api/invoices/<id>?e=…&s=…", good for `days` days.
export function invoicePath(orderId, days = 1) {
  const exp = Date.now() + days * DAY;
  return `/api/invoices/${encodeURIComponent(orderId)}?e=${exp}&s=${sign(String(orderId), exp)}`;
}

export function invoiceLinkValid(orderId, e, s) {
  const exp = Number(e);
  if (!Number.isFinite(exp) || exp < Date.now() || typeof s !== 'string') return false;
  const expected = sign(String(orderId), exp);
  return s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected));
}

// ---- The page ------------------------------------------------------------------------------------

// The BiteVo icon, inside the page (so it shows offline and in saved PDFs); the website's copy if it can't be read.
let logo = null;
function logoSrc() {
  if (logo === null) {
    try {
      logo = `data:image/png;base64,${fs.readFileSync(new URL('../../../frontend/public/assets/icon-192.png', import.meta.url)).toString('base64')}`;
    } catch {
      logo = `${config.siteUrl}/assets/icon-192.png`;
    }
  }
  return logo;
}

// Invoice numbers run per Indian financial year (April to March): INV/26-27/BV1108-001.
export function invoiceNo(order) {
  const d = new Date(new Date(order.placedAt).toLocaleString('en-US', { timeZone: TZ }));
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return `INV/${String(start).slice(2)}-${String(start + 1).slice(2)}/${order.orderNo}`;
}

const PAY_LABEL = { upi: 'UPI', card: 'Card', netbanking: 'Netbanking', wallet: 'Online wallet', emi: 'EMI', paylater: 'Pay later' };

// What was paid how: wallet, online (Razorpay), cash on delivery.
function payments(order) {
  const rows = [];
  const wallet = order.walletUsed || 0;
  if (wallet > 0) rows.push(['Paid from BiteVo wallet', wallet]);
  if (order.payment?.provider === 'razorpay') {
    const how = PAY_LABEL[order.payment.method] || order.paymentMethod || 'Online';
    rows.push([`Paid online (${how}) · Razorpay payment ${order.payment.paymentId}`, order.payment.amount]);
  } else {
    const cash = Math.max(0, (order.total || 0) - wallet);
    if (cash > 0) rows.push([order.status === 'delivered' ? 'Paid on delivery (cash / UPI)' : order.status === 'cancelled' ? 'Cash on delivery (not collected)' : 'To pay on delivery (cash / UPI)', cash]);
  }
  return rows;
}

/**
 * The invoice page for an order (the stored order document). `nonce` lets its one small script (the Print button)
 * run under the page's Content-Security-Policy.
 */
export function invoiceHtml(order, { nonce }) {
  const b = config.business;
  const a = order.address || {};
  const cancelled = order.status === 'cancelled';
  const gst = b.gstin && b.gstRate > 0 && !cancelled;
  const title = gst ? 'Tax invoice' : 'Invoice';
  const addressLines = [a.line1, a.line2, a.landmark && `Near ${a.landmark}`, a.pincode].filter(Boolean).map(esc).join('<br>');

  const items = (order.items || []).map((i, n) => {
    const free = Boolean(i.free);
    const amount = free ? 0 : (i.price || 0) * i.qty;
    return `<tr>
      <td class="num">${n + 1}</td>
      <td>${esc(i.name)}${free ? ' <span class="tag">Free</span>' : ''}</td>
      <td class="r">${esc(i.qty)}</td>
      <td class="r">${free ? `<s>${rs(i.price)}</s>` : rs(i.price)}</td>
      <td class="r">${free ? 'FREE' : rs(amount)}</td>
    </tr>`;
  }).join('');

  const total = order.total || 0;
  const line = (label, value, cls = '') => `<tr class="${cls}"><td>${label}</td><td class="r">${value}</td></tr>`;
  let sums = line('Item total', rs(order.subtotal))
    + line('Delivery fee', order.deliveryFee ? rs(order.deliveryFee) : 'FREE')
    + (order.discount > 0 ? line(`Offer${order.couponCode ? ` (${esc(order.couponCode)})` : ''}`, `−${rs(order.discount)}`, 'good') : '');
  if (gst) {
    // Prices include GST; split the order total into its taxable value and CGST + SGST (half each), in paise,
    // so the three add up to the total exactly.
    const totalPaise = Math.round(total * 100);
    const taxablePaise = Math.round(totalPaise / (1 + b.gstRate / 100));
    const cgstPaise = Math.round((totalPaise - taxablePaise) / 2);
    const sgstPaise = totalPaise - taxablePaise - cgstPaise;
    sums += line('Taxable value', rs(taxablePaise / 100), 'small')
      + line(`CGST @ ${b.gstRate / 2}%`, rs(cgstPaise / 100), 'small')
      + line(`SGST @ ${b.gstRate / 2}%`, rs(sgstPaise / 100), 'small');
  }
  sums += line('Order total', rs(total), 'total');

  const paid = payments(order).map(([label, amount]) => line(esc(label), rs(amount))).join('');
  const cashback = (order.cashback || 0) + (order.deliveryCashback || 0);
  const notes = [
    cashback > 0 && !cancelled && `${rs(cashback)} cashback ${order.deliveryCashbackPaidAt || order.status === 'delivered' ? 'added' : 'to be added after delivery'} to your BiteVo wallet.`,
    order.note && `Note for the kitchen: ${esc(order.note)}`,
    cancelled && `This order was cancelled${order.cancelReason ? ` (${esc(order.cancelReason)})` : ''}${order.cancelledAt ? ` on ${when(order.cancelledAt)}` : ''}.`,
    cancelled && order.refund?.amount > 0 && `${rs(order.refund.amount)} refunded to ${order.refund.to === 'wallet' ? 'your BiteVo wallet' : 'your original payment method'}.`,
  ].filter(Boolean);

  const seller = [
    b.legalName && b.legalName !== b.name && esc(b.legalName),
    b.address && esc(b.address).replace(/\n/g, '<br>'),
    [b.gstin && `GSTIN: ${esc(b.gstin)}`, b.fssai && `FSSAI Lic. No.: ${esc(b.fssai)}`].filter(Boolean).join(' · '),
    [b.phone && esc(b.phone), b.email && esc(b.email)].filter(Boolean).join(' · '),
  ].filter(Boolean).join('<br>');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} ${esc(invoiceNo(order))} · ${esc(b.name)}</title>
<style>
  :root { --red: #B71C1C; --ink: #1A1A1A; --muted: #6B6B6B; --line: #ECE3E3; --soft: #FFF6F5; --green: #2E7D32; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F4F1EF; color: var(--ink); font: 14px/1.5 -apple-system, "Segoe UI", Roboto, Arial, sans-serif; }
  .sheet { max-width: 800px; margin: 24px auto; background: #fff; border-radius: 14px; box-shadow: 0 6px 24px rgba(0,0,0,.08); overflow: hidden; }
  .band { background: var(--red); color: #fff; padding: 22px 28px; display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  .brand { display: flex; align-items: center; gap: 12px; }
  .brand img { width: 52px; height: 52px; border-radius: 12px; background: #fff; object-fit: contain; padding: 4px; }
  .brand b { display: block; font-size: 24px; font-style: italic; letter-spacing: .3px; }
  .brand small { display: block; font-size: 10.5px; letter-spacing: 2px; opacity: .85; }
  .doc { text-align: right; }
  .doc h1 { margin: 0; font-size: 20px; text-transform: uppercase; letter-spacing: 1.5px; }
  .doc p { margin: 2px 0 0; font-size: 13px; opacity: .92; }
  .body { padding: 24px 28px 28px; }
  .stamp { display: inline-block; margin-bottom: 14px; padding: 4px 12px; border: 2px solid var(--red); color: var(--red); border-radius: 8px; font-weight: 800; letter-spacing: 1px; }
  .parties { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 22px; }
  .parties h2 { margin: 0 0 4px; font-size: 11px; letter-spacing: 1.2px; text-transform: uppercase; color: var(--muted); }
  .parties p { margin: 0; font-size: 13.5px; }
  table { width: 100%; border-collapse: collapse; }
  .items th { text-align: left; font-size: 11.5px; letter-spacing: .8px; text-transform: uppercase; color: var(--muted); background: var(--soft); padding: 9px 10px; border-bottom: 1px solid var(--line); }
  .items td { padding: 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
  .items .num { width: 34px; color: var(--muted); }
  .r { text-align: right; white-space: nowrap; }
  .items th.r { text-align: right; }
  .tag { display: inline-block; margin-left: 6px; padding: 0 6px; border-radius: 6px; background: #E8F5EC; color: var(--green); font-size: 11px; font-weight: 700; }
  s { color: var(--muted); }
  .sums { display: flex; justify-content: flex-end; margin-top: 14px; }
  .sums table { max-width: 360px; }
  .sums td { padding: 5px 0; }
  .sums .good td { color: var(--green); }
  .sums .small td { color: var(--muted); font-size: 12.5px; }
  .sums .total td { border-top: 2px solid var(--ink); padding-top: 10px; font-size: 17px; font-weight: 800; }
  .box { margin-top: 22px; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
  .box h2 { margin: 0 0 6px; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
  .box td { padding: 4px 0; }
  .notes { margin: 14px 0 0; padding-left: 18px; color: #444; }
  .foot { margin-top: 24px; padding-top: 14px; border-top: 1px dashed var(--line); color: var(--muted); font-size: 12.5px; text-align: center; }
  .foot b { color: var(--ink); }
  .actions { max-width: 800px; margin: 0 auto 28px; display: flex; justify-content: center; gap: 10px; }
  .btn { appearance: none; border: 0; border-radius: 10px; padding: 12px 22px; background: var(--red); color: #fff; font: 700 15px/1 inherit; cursor: pointer; }
  @media (max-width: 640px) {
    .sheet { margin: 0; border-radius: 0; }
    .band, .body { padding-left: 16px; padding-right: 16px; }
    .doc { text-align: left; }
    .parties { grid-template-columns: 1fr; gap: 12px; }
    .items th, .items td { padding: 8px 6px; }
    .items .num { display: none; }
    .actions { padding: 16px; }
    .btn { width: 100%; }
  }
  @media print {
    body { background: #fff; }
    .sheet { margin: 0; box-shadow: none; border-radius: 0; max-width: none; }
    .band { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .actions { display: none; }
    @page { margin: 12mm; }
  }
</style></head>
<body>
<main class="sheet">
  <header class="band">
    <div class="brand">
      <img src="${esc(logoSrc())}" alt="">
      <div><b>${esc(b.name)}</b><small>GOOD FOOD · BETTER MOOD</small></div>
    </div>
    <div class="doc">
      <h1>${title}</h1>
      <p>No. ${esc(invoiceNo(order))}</p>
      <p>Date: ${day(order.deliveredAt || order.placedAt)}</p>
    </div>
  </header>
  <div class="body">
    ${cancelled ? '<span class="stamp">CANCELLED</span>' : ''}
    <section class="parties">
      <div><h2>From</h2><p><b>${esc(b.name)}</b>${seller ? `<br>${seller}` : ''}</p></div>
      <div><h2>Billed to</h2><p><b>${esc(order.customerName || 'Customer')}</b>${order.customerPhone ? `<br>${esc(order.customerPhone)}` : ''}</p></div>
      <div><h2>Delivered to</h2><p>${a.label ? `<b>${esc(a.label)}</b><br>` : ''}${addressLines || '—'}</p></div>
    </section>
    <section class="parties">
      <div><h2>Order</h2><p>#${esc(order.orderNo)}</p></div>
      <div><h2>Placed</h2><p>${when(order.placedAt)}</p></div>
      <div><h2>${cancelled ? 'Status' : 'Delivered'}</h2><p>${cancelled ? 'Cancelled' : order.deliveredAt ? when(order.deliveredAt) : 'Not yet delivered'}</p></div>
    </section>

    <table class="items">
      <thead><tr><th class="num">#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>${items}</tbody>
    </table>
    <div class="sums"><table>${sums}</table></div>

    <section class="box">
      <h2>Payment</h2>
      <table>${paid || line('Nothing to pay', rs(0))}</table>
      ${notes.length ? `<ul class="notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
    </section>

    <p class="foot">
      <b>Thank you for ordering from ${esc(b.name)}!</b><br>
      ${gst ? `Prices include GST at ${b.gstRate}%. ` : 'Prices include all applicable taxes. '}This is a computer-generated invoice and needs no signature.
      ${b.phone || b.email ? `<br>Questions about this order? ${[b.phone && esc(b.phone), b.email && esc(b.email)].filter(Boolean).join(' · ')}` : ''}
    </p>
  </div>
</main>
<div class="actions"><button class="btn" id="print" type="button">Download PDF / Print</button></div>
<script nonce="${nonce}">document.getElementById('print').addEventListener('click', function () { window.print(); });</script>
</body></html>`;
}

// The page's own security policy: its styles, the logo from the website, its one script, nothing else.
export function invoiceHeaders(res, nonce) {
  res.setHeader('Content-Security-Policy', `default-src 'none'; img-src https: data: ${new URL(config.siteUrl).origin}; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.type('html');
}
