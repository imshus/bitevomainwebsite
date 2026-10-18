// Starts the BiteVo website API.
import { config } from './config.js';
import { connectStore, store } from './db/index.js';
import { createApp } from './app.js';
import { seedStarterMenu } from './demo/starterMenu.js';
import { startReferralChecks } from './lib/referrals.js';

try {
  await connectStore();
} catch (err) {
  console.error(`Could not open the database: ${err.message}`);
  process.exit(1);
}
console.log(`Data store: ${store.label}`);

if (store.kind === 'file') {
  const added = await seedStarterMenu();
  if (added) console.log(`No menu yet, so loaded the starter menu (${added} dishes). Connect MongoDB to use the admin panel's menu.`);
} else if ((await store.count('products')) === 0) {
  console.log('The menu is empty. Add dishes in the admin panel (or start it once in demo mode to load demo data).');
}
if (config.otpDevMode) console.log('OTP dev mode: sign-in codes are shown on screen and printed here instead of sent by SMS.');

startReferralChecks();

const server = createApp().listen(config.port, () => {
  console.log(`BiteVo website API listening on http://localhost:${config.port}`);
});

async function shutdown() {
  server.close();
  await store.close();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
