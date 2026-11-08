// Emails to customers, sent from the BiteVo mailbox on Hostinger (SMTP). Without SMTP_PASS in .env
// nothing is sent (the email is only noted in the log), so the site works the same either way.
// Sending never holds up or breaks the request that triggered it.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { money } from './rules.js';
import { invoicePath, invoiceHtml, invoiceNo } from './invoice.js';

let transport = null;
export const mailEnabled = () => Boolean(config.mail.user && config.mail.pass);
// Sign-in with an email code needs the mailbox, or test mode (OTP_DEV_MODE), which shows the code on screen.
export const emailSignInEnabled = () => mailEnabled() || config.otpDevMode;

function getTransport() {
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.mail.host,
      port: config.mail.port,
      secure: config.mail.port === 465, // 465 = SSL (Hostinger's default); 587 = STARTTLS
      auth: { user: config.mail.user, pass: config.mail.pass },
      // A slow or unreachable mailbox gives up quickly instead of after minutes (sign-in waits for its email).
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000,
    });
  }
  return transport;
}

// For tests: send through any nodemailer transport instead of SMTP.
export function setTransport(t) { transport = t; }

export function sendMail({ to, subject, html, text, attachments }) {
  if (!to) return Promise.resolve(false);
  if (!mailEnabled() && !transport) {
    console.log(`[mail] Not sent (SMTP not set up): "${subject}" to ${to}`);
    return Promise.resolve(false);
  }
  return getTransport()
    .sendMail({ from: config.mail.from || config.mail.user, to, subject, html, text, ...(attachments && { attachments }) })
    .then(() => true, err => { console.error(`[mail] Could not send "${subject}" to ${to}: ${err.message}`); return false; });
}

// ---- Templates -----------------------------------------------------------------------------

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const firstName = name => String(name || '').trim().split(/\s+/)[0] || 'there';

// One simple, email-client-safe layout (tables and inline styles) in BiteVo red.
function layout(title, body, cta, footer = 'You’re getting this because you have a BiteVo account. Questions? Just reply to this email.') {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#FFF6F5;font-family:Arial,Helvetica,sans-serif;color:#1A1A1A">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF6F5;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #F0E1E1">
<tr><td style="background:#B71C1C;padding:22px 28px;color:#ffffff;font-size:24px;font-weight:bold;font-style:italic">BiteVo<span style="display:block;font-size:11px;font-style:normal;font-weight:normal;letter-spacing:2px;opacity:.85;margin-top:2px">GOOD FOOD · BETTER MOOD</span></td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3">${esc(title)}</h1>
${body}
${cta ? `<p style="margin:26px 0 6px"><a href="${esc(cta.href)}" style="display:inline-block;background:#B71C1C;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px;background:#FFF6F5;color:#666;font-size:12px;line-height:1.5">${esc(footer)}</td></tr>
</table></td></tr></table></body></html>`;
}
const p = text => `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#333">${text}</p>`;

export function welcomeEmail(customer) {
  const name = esc(firstName(customer.name));
  return {
    to: customer.email,
    subject: 'Welcome to BiteVo!',
    html: layout(`Welcome to BiteVo, ${firstName(customer.name)}!`,
      p(`Hi ${name}, your account is ready. Chef-made meals, cooked fresh and brought hot to your door.`)
      + p(config.referral.enabled ? `Share your referral code with friends and earn ${money(config.referral.reward)} in your BiteVo wallet when each of them completes ${config.referral.orders} orders.` : ''),
      { href: `${config.siteUrl}/menu`, label: 'See the menu' }),
    text: `Hi ${firstName(customer.name)}, welcome to BiteVo! Your account is ready. See the menu: ${config.siteUrl}/menu`,
  };
}

export function signInCodeEmail(email, code) {
  return {
    to: email,
    subject: `${code} is your BiteVo sign-in code`,
    html: layout('Your sign-in code',
      p('Enter this code on BiteVo to sign in. It works for 5 minutes.')
      + `<p style="margin:6px 0 18px;font-size:32px;font-weight:bold;letter-spacing:8px;color:#B71C1C">${esc(code)}</p>`
      + p('Never share it: BiteVo will never ask you for this code.'),
      null, 'You’re getting this because someone asked to sign in to BiteVo with this email. If it wasn’t you, ignore it.'),
    text: `${code} is your BiteVo sign-in code. It works for 5 minutes. If you didn’t ask for it, ignore this email.`,
  };
}

export function orderEmail(customer, order, { apiBase } = {}) {
  const rows = order.items.map(i => `<tr><td style="padding:6px 0;font-size:14px;color:#333">${esc(i.qty)} × ${esc(i.name)}</td><td align="right" style="padding:6px 0;font-size:14px;color:#333">${money(i.price * i.qty)}</td></tr>`).join('');
  const line = (label, value, bold) => `<tr><td style="padding:4px 0;font-size:14px;color:${bold ? '#1A1A1A' : '#666'};${bold ? 'font-weight:bold' : ''}">${label}</td><td align="right" style="padding:4px 0;font-size:14px;${bold ? 'font-weight:bold' : 'color:#666'}">${value}</td></tr>`;
  const a = order.address || {};
  const address = [a.line1, a.line2, a.landmark && `Near ${a.landmark}`, a.pincode].filter(Boolean).map(esc).join(', ');
  const wallet = order.walletUsed > 0 ? `${money(order.walletUsed)} from your wallet, ` : '';
  const pay = order.payment?.provider === 'razorpay' ? `${wallet}${money(order.payment.amount)} paid online (${esc(order.paymentMethod || 'Razorpay')})`
    : order.paymentMethod === 'Wallet' ? 'Paid from your BiteVo wallet'
    : order.walletUsed > 0 ? `${wallet}the rest in cash on delivery` : 'Cash on delivery';
  const invoice = `${apiBase || config.apiUrl || config.siteUrl}${invoicePath(order._id, 90)}`;
  return {
    to: customer.email,
    subject: `Order ${order.orderNo} placed · ${money(order.total)}`,
    html: layout(`Thanks, ${firstName(customer.name)}! Your order is placed.`,
      p(`Order <b>#${esc(order.orderNo)}</b> is with our kitchen. We’ll start cooking as soon as it’s accepted.`)
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 12px;border-top:1px solid #F0E1E1;border-bottom:1px solid #F0E1E1">${rows}</table>`
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">`
      + line('Item total', money(order.subtotal))
      + line('Delivery', order.deliveryFee ? money(order.deliveryFee) : 'Free')
      + (order.discount ? line(`Offer${order.couponCode ? ` (${esc(order.couponCode)})` : ''}`, `−${money(order.discount)}`) : '')
      + line('Total', money(order.total), true)
      + `</table>`
      + p(`<br><b>Payment:</b> ${pay}`)
      + (address ? p(`<b>Delivering to:</b> ${address}`) : '')
      + p(`<a href="${esc(invoice)}" style="color:#B71C1C;font-weight:bold">Download your invoice</a> (the full bill, to save as a PDF)`),
      { href: `${config.siteUrl}/orders/${order._id}`, label: 'Track your order' }),
    text: `Order ${order.orderNo} placed. Total ${money(order.total)}. Track it: ${config.siteUrl}/orders/${order._id} · Invoice: ${invoice}`,
  };
}

// The invoice, once the order is delivered (lib/invoiceMail.js): the bill in the email, a link to the invoice
// page (Save as PDF there) and the invoice itself attached as a page that opens in any browser.
export function invoiceEmail(customer, order, { apiBase } = {}) {
  const rows = order.items.map(i => `<tr><td style="padding:6px 0;font-size:14px;color:#333">${esc(i.qty)} × ${esc(i.name)}</td><td align="right" style="padding:6px 0;font-size:14px;color:#333">${i.free ? 'FREE' : money(i.price * i.qty)}</td></tr>`).join('');
  const line = (label, value, bold) => `<tr><td style="padding:4px 0;font-size:14px;color:${bold ? '#1A1A1A' : '#666'};${bold ? 'font-weight:bold' : ''}">${label}</td><td align="right" style="padding:4px 0;font-size:14px;${bold ? 'font-weight:bold' : 'color:#666'}">${value}</td></tr>`;
  // The invoice page needs this API's public address (API_PUBLIC_URL); without it, the order on the website,
  // which has the Invoice button.
  const base = apiBase || config.apiUrl;
  const link = base ? `${base}${invoicePath(order._id, 90)}` : `${config.siteUrl}/orders/${order._id}`;
  const no = invoiceNo(order);
  return {
    to: customer.email,
    subject: `Your BiteVo invoice ${no} · ${money(order.total)}`,
    html: layout(`Your invoice for order #${order.orderNo}`,
      p(`Thanks for ordering from BiteVo, ${esc(firstName(customer.name))}! Your invoice <b>${esc(no)}</b> is attached, and here’s the bill.`)
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 12px;border-top:1px solid #F0E1E1;border-bottom:1px solid #F0E1E1">${rows}</table>`
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">`
      + line('Item total', money(order.subtotal))
      + line('Delivery', order.deliveryFee ? money(order.deliveryFee) : 'Free')
      + (order.discount ? line(`Offer${order.couponCode ? ` (${esc(order.couponCode)})` : ''}`, `−${money(order.discount)}`) : '')
      + (order.walletUsed > 0 ? line('Paid from wallet', money(order.walletUsed)) : '')
      + (order.payment?.provider === 'razorpay' ? line(`Paid online (${esc(order.paymentMethod || 'Razorpay')})`, money(order.payment.amount)) : '')
      + line('Total', money(order.total), true)
      + `</table>`,
      { href: link, label: base ? 'Download invoice (PDF)' : 'View your order and invoice' }),
    text: `Your BiteVo invoice ${no} for order ${order.orderNo}: total ${money(order.total)}. Download it: ${link}`,
    attachments: [{
      filename: `BiteVo-invoice-${order.orderNo}.html`,
      content: invoiceHtml(order, { nonce: 'bitevo-invoice' }),
      contentType: 'text/html; charset=utf-8',
    }],
  };
}

// Refund updates (lib/orderEmails.js). 'started': a paid order was cancelled; how much goes back and where (the
// BiteVo wallet at once, UPI / card through Razorpay in a few working days). 'done': Razorpay has sent the UPI /
// card refund.
const PAY_NAMES = { upi: 'UPI', card: 'card', netbanking: 'bank account', wallet: 'wallet' };
export function refundEmail(customer, order, stage) {
  const r = order.refund;
  const toSource = r.to === 'source';
  const sourcePart = toSource ? Math.max(0, r.amount - (r.wallet || 0)) : 0;
  const walletPart = toSource ? r.wallet || 0 : r.amount;
  const via = PAY_NAMES[order.payment?.method] || order.paymentMethod || 'original payment method';
  const row = (label, value, note) => `<tr><td style="padding:8px 0;font-size:14px;color:#333">${label}${note ? `<br><span style="font-size:12.5px;color:#888">${note}</span>` : ''}</td><td align="right" valign="top" style="padding:8px 0;font-size:15px;font-weight:bold;color:#1E7B34">${value}</td></tr>`;
  const link = { href: `${config.siteUrl}/orders/${order._id}`, label: 'View your order' };
  if (stage === 'done') {
    return {
      to: customer.email,
      subject: `Refund of ${money(sourcePart)} sent to your ${via} · order #${order.orderNo}`,
      html: layout('Your refund is on its way to you',
        p(`Hi ${esc(firstName(customer.name))}, Razorpay has sent <b>${money(sourcePart)}</b> back to your ${esc(via)} for order <b>#${esc(order.orderNo)}</b>.`)
        + p('Most banks show it within 5–7 working days. If it isn’t there after that, reply to this email with the refund ID below.')
        + (r.razorpayRefundId ? p(`<span style="color:#888">Refund ID: ${esc(r.razorpayRefundId)}</span>`) : ''),
        link),
      text: `Razorpay has sent ${money(sourcePart)} back to your ${via} for order ${order.orderNo}. Banks usually show it within 5-7 working days.${r.razorpayRefundId ? ` Refund ID: ${r.razorpayRefundId}` : ''}`,
    };
  }
  const rows = (walletPart > 0 ? row('To your BiteVo wallet', money(walletPart), 'Added straight away, ready for your next order') : '')
    + (sourcePart > 0 ? row(`To your ${esc(via)}`, money(sourcePart), `Through Razorpay, 5–7 working days${r.razorpayRefundId ? ` · refund ID ${esc(r.razorpayRefundId)}` : ''}`) : '');
  return {
    to: customer.email,
    subject: `Order #${order.orderNo} cancelled · ${money(r.amount)} refund`,
    html: layout(`Your refund of ${money(r.amount)}`,
      p(`Hi ${esc(firstName(customer.name))}, your order <b>#${esc(order.orderNo)}</b> was cancelled${order.cancelReason ? ` (${esc(order.cancelReason)})` : ''}. Here’s where your money goes:`)
      + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:8px 0 12px;border-top:1px solid #F0E1E1;border-bottom:1px solid #F0E1E1">${rows}</table>`
      + (sourcePart > 0 ? p('We’ll email you again when Razorpay has sent it.') : ''),
      link),
    text: `Order ${order.orderNo} was cancelled. Refund of ${money(r.amount)}: ${walletPart > 0 ? `${money(walletPart)} to your BiteVo wallet` : ''}${walletPart > 0 && sourcePart > 0 ? ', ' : ''}${sourcePart > 0 ? `${money(sourcePart)} to your ${via} (5-7 working days)` : ''}.`,
  };
}

// A refund request decided in the admin panel (lib/orderEmails.js): approved (how much, and where it goes) or not
// approved (the admin's note).
export function refundDecisionEmail(customer, request, order) {
  const link = { href: `${config.siteUrl}/orders/${request.orderId}`, label: 'View your order' };
  const hi = `Hi ${esc(firstName(customer.name))}, `;
  if (request.status === 'rejected') {
    return {
      to: customer.email,
      subject: `About your refund request for order #${request.orderNo}`,
      html: layout('We couldn’t approve this refund',
        p(`${hi}we looked into your refund request for order <b>#${esc(request.orderNo)}</b> (${esc(String(request.reasonLabel || '').toLowerCase())}) and couldn’t approve it this time.`)
        + (request.note ? p(`<b>From our team:</b> ${esc(request.note)}`) : '')
        + p('If something isn’t right, just reply to this email.'),
        link),
      text: `We couldn't approve your refund request for order ${request.orderNo}.${request.note ? ` ${request.note}` : ''}`,
    };
  }
  const d = request.decision || { amount: request.amount, to: request.to };
  const sourcePart = d.to === 'source' ? Math.max(0, d.amount - (d.wallet || 0)) : 0;
  const walletPart = d.to === 'source' ? d.wallet || 0 : d.amount;
  const via = PAY_NAMES[order?.payment?.method] || order?.paymentMethod || 'original payment method';
  const parts = [walletPart > 0 && `<b>${money(walletPart)}</b> to your BiteVo wallet (added straight away)`, sourcePart > 0 && `<b>${money(sourcePart)}</b> to your ${esc(via)} through Razorpay (5–7 working days)`].filter(Boolean);
  return {
    to: customer.email,
    subject: `Refund approved · ${money(d.amount)} for order #${request.orderNo}`,
    html: layout(`Your refund of ${money(d.amount)} is approved`,
      p(`${hi}sorry about your order <b>#${esc(request.orderNo)}</b>. We’ve approved your refund: ${parts.join(' and ')}.`)
      + (request.note ? p(`<b>From our team:</b> ${esc(request.note)}`) : '')
      + (sourcePart > 0 ? p('We’ll email you again when Razorpay has sent it.') : ''),
      link),
    text: `Your refund of ${money(d.amount)} for order ${request.orderNo} is approved.${request.note ? ` ${request.note}` : ''}`,
  };
}
