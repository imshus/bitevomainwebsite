// Where Razorpay's payment page sends the customer back after paying in the app (callback_url, redirect mode).
// The app takes payments in Razorpay's checkout inside a web view; banks' pages take over that view, so instead
// of calling back into the page, Razorpay posts the result here. This page hands it straight to the app
// (window.ReactNativeWebView.postMessage), which then places the order with POST /api/orders: that's where the
// signature and the payment are checked with Razorpay, so nothing here is trusted or stored.
import crypto from 'node:crypto';
import express, { Router } from 'express';
import { webhookSignatureValid, handleWebhook } from '../lib/razorpay.js';
import { config } from '../config.js';

export const router = Router();

const field = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');

function returnPage(req, res) {
  const b = { ...req.query, ...(req.body || {}) };
  const error = b.error && typeof b.error === 'object' ? b.error : null;
  const result = b.razorpay_payment_id && b.razorpay_order_id && b.razorpay_signature
    ? { type: 'paid', orderId: field(b.razorpay_order_id), paymentId: field(b.razorpay_payment_id), signature: field(b.razorpay_signature) }
    : { type: 'failed', description: field(error?.description) || 'That payment didn’t go through. No money was taken.' };
  const nonce = crypto.randomBytes(16).toString('base64');
  res.setHeader('Content-Security-Policy', `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'`);
  res.setHeader('Cache-Control', 'no-store');
  // The message is a JSON text written into the script as a string literal, with "<" written as the escape
  // \u003c (read back as "<"), so nothing in the data can close the script tag.
  const message = JSON.stringify(JSON.stringify(result)).replace(/</g, '\\u003c');
  res.type('html').send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>BiteVo payment</title></head>
<body style="margin:0;padding:48px 20px;font:16px/1.5 Arial,sans-serif;color:#1A1A1A;text-align:center">
<p>${result.type === 'paid' ? 'Payment received. Going back to your order…' : 'Payment not completed. Going back…'}</p>
<p style="color:#6B6B6B;font-size:14px">If nothing happens, return to the BiteVo app.</p>
<script nonce="${nonce}">if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(${message});</script>
</body></html>`);
}

router.post('/razorpay-return', express.urlencoded({ extended: true, limit: '20kb' }), returnPage);
router.get('/razorpay-return', returnPage);

// Razorpay's webhook: Dashboard → Accounts & Settings → Webhooks → https://api.bitevo.in/api/payments/razorpay-webhook,
// with the secret in RAZORPAY_WEBHOOK_SECRET (or ROZERPAY_WEBHOOK) and the events payment.captured,
// payment.failed, refund.processed and refund.failed (lib/razorpay.js handleWebhook). Calls without a valid
// X-Razorpay-Signature are refused; an error answers 500, so Razorpay sends the event again later.
router.post('/razorpay-webhook', async (req, res) => {
  if (!config.razorpay.webhookSecret) return res.status(404).json({ error: 'The Razorpay webhook isn’t set up.' });
  if (!webhookSignatureValid(req.rawBody, req.get('x-razorpay-signature'))) return res.status(400).json({ error: 'Invalid signature.' });
  try {
    await handleWebhook(req.body);
  } catch (err) {
    console.error(`[razorpay] webhook ${req.body?.event} failed: ${err.message}`);
    return res.status(500).json({ error: 'Not processed.' });
  }
  res.json({ ok: true });
});
