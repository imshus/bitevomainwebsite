// Image uploads.
//   POST /api/uploads   the image itself as the request body, with its Content-Type (image/jpeg, image/png,
//                       image/webp or image/gif), at most 5 MB  →  201 { url, name, type, size }
// `url` is a public Supabase Storage link, so it shows anywhere: put it straight in an <img>. Allowed for a
// signed-in customer (website or app, same session cookie), or with an `x-upload-key` header matching
// UPLOAD_API_KEY (for scripts and other servers). Each upload is also noted in the "uploads" collection.
import crypto from 'node:crypto';
import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { config } from '../config.js';
import { store } from '../db/index.js';
import { objectId } from '../lib/ids.js';
import { badRequest, unauthorized, HttpError, nowIso, MIN } from '../lib/http.js';
import { requireCustomer } from '../auth.js';
import { IMAGE_TYPES, MAX_IMAGE_BYTES, imageKind, saveImage, storageReady } from '../lib/storage.js';

export const router = Router();

const sameKey = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Who's uploading: the upload key, or else a signed-in customer.
async function uploader(req, res, next) {
  const key = req.get('x-upload-key');
  if (key) {
    if (!config.uploadApiKey || !sameKey(key, config.uploadApiKey)) throw unauthorized('That upload key isn’t right.');
    req.uploadedBy = { kind: 'key' };
    return next();
  }
  return requireCustomer(req, res, () => {
    req.uploadedBy = { kind: 'customer', customerId: req.customer._id };
    next();
  });
}

router.post(
  '/',
  rateLimit({
    windowMs: 60 * MIN, limit: 40, standardHeaders: 'draft-7', legacyHeaders: false,
    message: { error: 'Too many uploads. Please try again in a while.' },
  }),
  uploader,
  express.raw({ type: Object.values(IMAGE_TYPES), limit: MAX_IMAGE_BYTES }),
  async (req, res) => {
    if (!storageReady()) throw new HttpError(503, 'Image uploads aren’t set up yet.');
    if (!Buffer.isBuffer(req.body) || req.body.length < 12) throw badRequest('Send a JPG, PNG, WebP or GIF image as the request body, with its Content-Type.');
    const ext = imageKind(req.body);
    if (!ext) throw badRequest('That file isn’t a supported image (JPG, PNG, WebP or GIF).');

    const name = `site/${objectId()}.${ext}`;
    let url;
    try {
      url = await saveImage(name, req.body);
    } catch (err) {
      if (err instanceof HttpError) throw err;
      console.error(`Image upload failed: ${err.message}`);
      throw new HttpError(502, 'Couldn’t save the image right now. Please try again.');
    }
    await store.insert('uploads', {
      name, url, type: IMAGE_TYPES[ext], size: req.body.length,
      customerId: req.uploadedBy.customerId ?? null, via: req.uploadedBy.kind, source: 'web', createdAt: nowIso(),
    });
    res.status(201).json({ url, name, type: IMAGE_TYPES[ext], size: req.body.length });
  },
);
