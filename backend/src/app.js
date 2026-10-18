// The Express app: security headers, CORS for the website, cookie sessions, and the /api routes.
// Once the website is built (npm run build → frontend/dist), it serves that too, so one address hosts both.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { config } from './config.js';
import { store } from './db/index.js';
import { errorHandler } from './lib/http.js';
import { router as publicRoutes } from './routes/public.js';
import { router as authRoutes } from './routes/auth.js';
import { router as accountRoutes } from './routes/account.js';
import { router as orderRoutes } from './routes/orders.js';
import { router as placeRoutes } from './routes/places.js';
import { router as referralRoutes, meRouter as myReferralRoutes } from './routes/referrals.js';

const SITE_DIR = fileURLToPath(new URL('../../frontend/dist', import.meta.url));

// The built website, or (before it's built) a short note, so the bare address doesn't say "Cannot GET /".
function siteRoutes() {
  const site = express.Router();
  if (!fs.existsSync(path.join(SITE_DIR, 'index.html'))) {
    site.get('/', (req, res) => res.json({
      ok: true,
      service: 'BiteVo website API',
      health: '/api/health',
      website: 'Not built here. Use the Vite dev server (http://localhost:2002), or run npm run build and restart this server to host it here.',
    }));
    return site;
  }
  // The pages load Google Maps, Google sign-in, Google Fonts and menu photos from other sites, so they get
  // helmet's other headers but no Content-Security-Policy, the same as on a plain static host.
  site.use(helmet({ contentSecurityPolicy: false, crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' } }));
  site.use(express.static(SITE_DIR, { index: false }));
  // Every other page address belongs to the website's router. /uploads/ (admin photos) is not a page.
  site.get(/^(?!\/uploads\/)/, (req, res) => res.sendFile(path.join(SITE_DIR, 'index.html')));
  return site;
}

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use('/api', helmet());
  app.use(cors({ origin: config.clientOrigins, credentials: true }));
  app.use(cookieParser());
  app.use('/api', express.json({ limit: '50kb' }));

  app.get('/api/health', (req, res) => res.json({ ok: true, store: store.kind }));
  app.use('/api', publicRoutes);
  app.use('/api/auth', authRoutes);
  app.use('/api/me/referrals', myReferralRoutes);
  app.use('/api/me', accountRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/places', placeRoutes);
  app.use('/api/referrals', referralRoutes);

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use(siteRoutes());
  app.use(errorHandler);
  return app;
}
