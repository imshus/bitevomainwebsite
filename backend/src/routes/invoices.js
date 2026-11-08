// An order's invoice from a signed link (lib/invoice.js invoicePath), without signing in: the app opens it in
// the phone's browser, and the order email links to it. The link stops working when it expires.
import crypto from 'node:crypto';
import { Router } from 'express';
import { store } from '../db/index.js';
import { invoiceHtml, invoiceHeaders, invoiceLinkValid } from '../lib/invoice.js';

export const router = Router();

const notice = text => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Invoice · BiteVo</title></head>
<body style="margin:0;padding:40px 20px;font:16px/1.5 Arial,sans-serif;color:#1A1A1A;text-align:center;background:#FFF6F5"><p>${text}</p></body></html>`;

router.get('/:id', async (req, res) => {
  const id = String(req.params.id);
  const nonce = crypto.randomBytes(16).toString('base64');
  invoiceHeaders(res, nonce);
  if (!invoiceLinkValid(id, req.query.e, req.query.s)) {
    return res.status(403).send(notice('This invoice link has expired. Open the order in the BiteVo app or on bitevo.in to get the invoice again.'));
  }
  const order = await store.findById('orders', id);
  if (!order) return res.status(404).send(notice('We couldn’t find that order.'));
  res.send(invoiceHtml(order, { nonce }));
});
