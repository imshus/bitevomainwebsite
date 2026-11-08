// The ways to pay on the app's payment screen (screens/PaymentScreen.js), and how each opens Razorpay's checkout
// on just that method (Razorpay "config.display"). The same list as the website's frontend/src/lib/payMethods.js
// (a phone, so UPI apps are always offered): change both together.
// A choice is { kind, app? }: upi_app (app), upi_any, card, wallet, cod. No "UPI ID": NPCI stopped UPI Collect for
// merchants on 28 February 2026; UPI is paid in the UPI app itself.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const UPI_APPS = [
  { app: 'google_pay', name: 'Google Pay', mark: 'G', bg: '#FFFFFF', fg: '#4285F4' },
  { app: 'phonepe', name: 'PhonePe', mark: 'Pe', bg: '#5F259F', fg: '#FFFFFF' },
  { app: 'paytm', name: 'Paytm', mark: 'Pt', bg: '#00B9F1', fg: '#FFFFFF' },
];

export function payLabel(choice) {
  if (!choice) return 'Choose a payment method';
  switch (choice.kind) {
    case 'upi_app': return UPI_APPS.find(a => a.app === choice.app)?.name || 'UPI';
    case 'upi_any': return 'Any UPI app';
    case 'card': return 'Credit / debit card';
    case 'wallet': return 'Wallet';
    case 'cod': return 'Cash on delivery';
    default: return 'Pay online';
  }
}

export const sameChoice = (a, b) => Boolean(a && b && a.kind === b.kind && (a.app || '') === (b.app || ''));

export function razorpayDisplay(choice) {
  const instruments = {
    upi_app: [{ method: 'upi', flows: ['intent', 'qr'], apps: [choice.app] }],
    upi_any: [{ method: 'upi', flows: ['intent', 'qr'] }],
    card: [{ method: 'card' }],
    wallet: [{ method: 'wallet' }],
  }[choice?.kind];
  if (!instruments) return null;
  return {
    blocks: { bitevo: { name: `Pay with ${payLabel(choice)}`, instruments } },
    sequence: ['block.bitevo'],
    preferences: { show_default_blocks: false },
  };
}

// The way this phone paid last time ("Recently used").
const KEY = 'bitevo.payMethod';
const KINDS = ['upi_app', 'upi_any', 'card', 'wallet', 'cod'];
export async function rememberedChoice() {
  try {
    const c = JSON.parse((await AsyncStorage.getItem(KEY)) || 'null');
    return c && KINDS.includes(c.kind) ? c : null;
  } catch {
    return null;
  }
}
export const rememberChoice = choice => AsyncStorage.setItem(KEY, JSON.stringify(choice)).catch(() => {});
export const DEFAULT_CHOICE = { kind: 'upi_app', app: 'google_pay' };
