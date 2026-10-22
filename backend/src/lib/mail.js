// Emails to customers, sent from the BiteVo mailbox on Hostinger (SMTP). Without SMTP_PASS in .env
// nothing is sent (the email is only noted in the log), so the site works the same either way.
// Sending never holds up or breaks the request that triggered it.
import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { money } from './rules.js';

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
    });
  }
  return transport;
}

// For tests: send through any nodemailer transport instead of SMTP.
export function setTransport(t) { transport = t; }

export function sendMail({ to, subject, html, text }) {
  if (!to) return Promise.resolve(false);
  if (!mailEnabled() && !transport) {
    console.log(`[mail] Not sent (SMTP not set up): "${subject}" to ${to}`);
    return Promise.resolve(false);
  }
  return getTransport()
    .sendMail({ from: config.mail.from || config.mail.user, to, subject, html, text })
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

export function orderEmail(customer, order) {
  const rows = order.items.map(i => `<tr><td style="padding:6px 0;font-size:14px;color:#333">${esc(i.qty)} × ${esc(i.name)}</td><td align="right" style="padding:6px 0;font-size:14px;color:#333">${money(i.price * i.qty)}</td></tr>`).join('');
  const line = (label, value, bold) => `<tr><td style="padding:4px 0;font-size:14px;color:${bold ? '#1A1A1A' : '#666'};${bold ? 'font-weight:bold' : ''}">${label}</td><td align="right" style="padding:4px 0;font-size:14px;${bold ? 'font-weight:bold' : 'color:#666'}">${value}</td></tr>`;
  const a = order.address || {};
  const address = [a.line1, a.line2, a.landmark && `Near ${a.landmark}`, a.zone, a.pincode].filter(Boolean).map(esc).join(', ');
  const pay = order.paymentMethod === 'Wallet' ? 'Paid from your BiteVo wallet' : order.walletUsed > 0 ? `${money(order.walletUsed)} from your wallet, the rest in cash on delivery` : 'Cash on delivery';
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
      + (address ? p(`<b>Delivering to:</b> ${address}`) : ''),
      { href: `${config.siteUrl}/orders/${order._id}`, label: 'Track your order' }),
    text: `Order ${order.orderNo} placed. Total ${money(order.total)}. Track it: ${config.siteUrl}/orders/${order._id}`,
  };
}
