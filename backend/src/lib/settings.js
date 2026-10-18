// App-wide lists the admin panel keeps in the "settings" collection (document "app").
// The website only reads them: delivery zones become the areas a customer can pick for an address.
import { store } from '../db/index.js';

export const DEFAULT_SETTINGS = {
  zones: ['North Zone', 'South Zone', 'East Zone', 'West Zone', 'Central'],
  cancelReasons: ['Customer asked to cancel'],
};

export async function getSettings() {
  const saved = await store.findById('settings', 'app');
  return { ...DEFAULT_SETTINGS, ...saved };
}

// The cancel reason the admin panel uses when a customer cancels.
export const CUSTOMER_CANCEL_REASON = 'Customer asked to cancel';
