// HTTP errors with friendly messages, plus small request helpers shared by the routes.

export class HttpError extends Error {
  constructor(status, message, extra) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

export const badRequest = (message, extra) => new HttpError(400, message, extra);
export const unauthorized = (message = 'Please sign in to continue.') => new HttpError(401, message);
export const forbidden = message => new HttpError(403, message);
export const notFound = (message = 'We couldn’t find that.') => new HttpError(404, message);
export const conflict = message => new HttpError(409, message);
export const tooMany = message => new HttpError(429, message);

export const nowIso = () => new Date().toISOString();

// Wraps a loader whose answer may be a few seconds old: it's kept for `ms`, and visitors who ask at the same
// moment share one load. A failed load isn't kept.
export function keptFor(ms, load) {
  let kept = null;
  let pending = null;
  return () => {
    if (kept && Date.now() - kept.at < ms) return Promise.resolve(kept.value);
    pending ||= load()
      .then(value => { kept = { value, at: Date.now() }; return value; })
      .finally(() => { pending = null; });
    return pending;
  };
}
export const MIN = 60000;
export const DAY = 86400000;

export function startOfToday(now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

// Trimmed, length-limited text from a request body ('' for anything that isn't a string).
export const text = (value, max) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '');

// Express error handler: known errors keep their message, anything else becomes a generic 500.
export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message, ...err.extra });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That request is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'The request body is not valid JSON.' });
  if (err.code === 11000) return res.status(409).json({ error: 'That value is already in use.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
}
