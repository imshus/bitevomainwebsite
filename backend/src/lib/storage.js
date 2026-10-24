// Saves uploaded images in Supabase Storage: the same public bucket the admin panel saves menu photos to
// (SUPABASE_URL + SUPABASE_SECRET_KEY, bucket SUPABASE_BUCKET, default "bitevo-images"). Each image gets a
// public link that loads anywhere: on the website, in the admin panel and in the app.
import { config } from '../config.js';
import { HttpError } from './http.js';

const { url: SUPABASE_URL, key: SUPABASE_KEY, bucket: BUCKET } = config.supabase;

export const storageReady = () => Boolean(SUPABASE_URL && SUPABASE_KEY);
export const IMAGE_TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Recognises an image by its first bytes (never trusts the file name or Content-Type). Returns the extension.
const SIGNATURES = [
  { ext: 'jpg', test: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'png', test: b => b.subarray(0, 4).toString('hex') === '89504e47' },
  { ext: 'webp', test: b => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { ext: 'gif', test: b => b.subarray(0, 4).toString() === 'GIF8' },
];
export const imageKind = body => (Buffer.isBuffer(body) && body.length >= 12 ? SIGNATURES.find(s => s.test(body))?.ext : undefined);

// New sb_secret_ keys go in the apikey header only; a legacy service_role JWT also as the bearer token.
const authHeaders = () => ({ apikey: SUPABASE_KEY, ...(SUPABASE_KEY.startsWith('eyJ') ? { Authorization: `Bearer ${SUPABASE_KEY}` } : {}) });

async function supabase(method, route, { body, headers } = {}) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/${route}`, { method, body, headers: { ...authHeaders(), ...headers }, signal: AbortSignal.timeout(20000) });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const err = new Error(`Supabase Storage: ${data?.message || data?.error || `HTTP ${res.status}`}`);
    err.status = Number(data?.statusCode) || res.status; // some "not found"/"exists" answers come as HTTP 400
    throw err;
  }
  return data;
}

// The bucket is created (public) the first time an image is saved, if the admin panel hasn't already.
let bucketReady = null;
function ensureBucket() {
  bucketReady ??= (async () => {
    let bucket = null;
    try { bucket = await supabase('GET', `bucket/${BUCKET}`); } catch (err) { if (err.status !== 404) throw err; }
    if (!bucket) {
      try {
        await supabase('POST', 'bucket', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, file_size_limit: MAX_IMAGE_BYTES, allowed_mime_types: Object.values(IMAGE_TYPES) }),
        });
        console.log(`Created the public Supabase Storage bucket "${BUCKET}".`);
      } catch (err) {
        if (err.status !== 409) throw err; // created a moment ago elsewhere
      }
    } else if (!bucket.public) {
      throw new Error(`Supabase bucket "${BUCKET}" is private, so its images can't be shown. Make it public in Supabase (Storage → bucket settings).`);
    }
  })().catch(err => { bucketReady = null; throw err; });
  return bucketReady;
}

// The public link of a file in the bucket.
export const publicUrl = name => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name.split('/').map(encodeURIComponent).join('/')}`;

// Stores one image under `name` (e.g. "site/6adc….jpg") and returns its public link.
export async function saveImage(name, body) {
  if (!storageReady()) throw new HttpError(503, 'Image uploads aren’t set up yet.');
  const ext = name.split('.').pop();
  await ensureBucket();
  await supabase('POST', `object/${BUCKET}/${name.split('/').map(encodeURIComponent).join('/')}`, {
    body,
    headers: { 'Content-Type': IMAGE_TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=31536000', 'x-upsert': 'false' },
  });
  return publicUrl(name);
}

export async function deleteImage(name) {
  await supabase('DELETE', `object/${BUCKET}/${name.split('/').map(encodeURIComponent).join('/')}`);
}
