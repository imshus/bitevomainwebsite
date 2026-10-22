// Opens the data store: MongoDB when a connection string is configured, otherwise a local JSON file.
// Everything else imports `store` from here and never talks to MongoDB directly.
//
// The website shares the admin panel's database. It reads the menu (products, categories), coupons and
// settings the panel manages, and writes customers, orders, wallet transactions and sessions in the
// same shape the panel expects, so website orders appear there live.
import { config } from '../config.js';
import { createMongoStore } from './mongoStore.js';
import { createFileStore } from './fileStore.js';

export let store = null;

// Indexes for the collections the website reads and writes. Matching admin-panel indexes are
// created with the same keys, so running both apps against one database is harmless.
const INDEXES = [
  ['orders', { placedAt: -1 }],
  ['orders', { customerId: 1 }],
  ['orders', { couponCode: 1 }],
  ['walletTxns', { customerId: 1, at: 1 }],
  ['sessions', { tokenHash: 1 }, { unique: true, partialFilterExpression: { tokenHash: { $type: 'string' } } }],
  ['customers', { phone: 1 }],
  ['customers', { googleId: 1 }, { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } }],
  ['customers', { referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $type: 'string' } } }],
  ['customers', { loginEmail: 1 }, { unique: true, partialFilterExpression: { loginEmail: { $type: 'string' } } }],
  ['referrals', { friendId: 1 }, { unique: true }],
  ['referrals', { referrerId: 1, createdAt: -1 }],
  ['referrals', { status: 1 }],
  ['otpCodes', { phone: 1, createdAt: -1 }],
  ['emailCodes', { email: 1, createdAt: -1 }],
  ['supportMessages', { createdAt: -1 }],
];

export async function connectStore() {
  store = config.mongoUri
    ? await createMongoStore(config.mongoUri, config.mongoDbName)
    : await createFileStore(config.dataFile);
  await store.ensureIndexes(INDEXES);
  return store;
}
