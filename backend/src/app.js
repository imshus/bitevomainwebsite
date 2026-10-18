// The Express app: security headers, CORS for the website, cookie sessions, and the /api routes.
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

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (config.trustProxy) app.set('trust proxy', 1);

  app.use(helmet());
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
  app.use(errorHandler);
  return app;
}
