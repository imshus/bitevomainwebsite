// Starts the BiteVo website API.
import dns from 'node:dns';
import { config } from './config.js';
import { connectStore, store } from './db/index.js';
import { createApp } from './app.js';
import { seedStarterMenu } from './demo/starterMenu.js';
import { startReferralChecks } from './lib/referrals.js';
import { startOfferChecks } from './lib/offers.js';
import { startPaymentChecks } from './lib/razorpay.js';

// Opens the database, trying again for about two minutes if the network or DNS has a hiccup (a failed start
// used to leave the API down until someone restarted it). When this computer's DNS server refuses the lookup
// of MongoDB's address (querySrv ECONNREFUSED), public DNS (Cloudflare, Google) is asked as well.
async function openStore() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await connectStore();
    } catch (err) {
      const lookupFailed = /querySrv|queryTxt|ENOTFOUND|EAI_AGAIN|ETIMEOUT|ECONNREFUSED/.test(err.message);
      if (lookupFailed && !dns.getServers().includes('1.1.1.1')) dns.setServers([...dns.getServers(), '1.1.1.1', '8.8.8.8']);
      if (attempt >= 8) throw err;
      const wait = Math.min(30, 2 ** attempt);
      console.error(`Could not open the database (${err.message}). Trying again in ${wait}s…`);
      await new Promise(resolve => setTimeout(resolve, wait * 1000));
    }
  }
}

try {
  await openStore();
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
startOfferChecks();
startPaymentChecks();

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
