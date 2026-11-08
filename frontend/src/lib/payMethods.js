// The ways to pay on the payment page (components/PaymentPage.jsx), and how each opens Razorpay's checkout on
// just that method (Razorpay "config.display": one block of instruments, the default list hidden).
// A choice is { kind, app? }: upi_app (app: google_pay | phonepe | paytm), upi_any, upi_qr, card, wallet, cod
// No "UPI ID" option: NPCI stopped UPI Collect (typing a UPI ID) for merchants on 28 February 2026, so UPI is paid
// through the UPI app itself (intent, on a phone) or a QR code.
// The app has the same list (mobile/src/lib/payMethods.js): change both together.

export const UPI_APPS = [
  { app: 'google_pay', name: 'Google Pay', mark: 'G', bg: '#FFFFFF', fg: '#4285F4' },
  { app: 'phonepe', name: 'PhonePe', mark: 'Pe', bg: '#5F259F', fg: '#FFFFFF' },
  { app: 'paytm', name: 'Paytm', mark: 'Pt', bg: '#00B9F1', fg: '#FFFFFF' },
];

// Phones can hand UPI payments to the UPI app itself; computers show a QR code to scan instead.
export const onPhone = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

export function payLabel(choice) {
  if (!choice) return 'Choose a payment method';
  switch (choice.kind) {
    case 'upi_app': return UPI_APPS.find(a => a.app === choice.app)?.name || 'UPI';
    case 'upi_any': return 'Any UPI app';
    case 'upi_qr': return 'UPI QR code';
    case 'card': return 'Credit / debit card';
    case 'wallet': return 'Wallet';
    case 'cod': return 'Cash on delivery';
    default: return 'Pay online';
  }
}

export const sameChoice = (a, b) => Boolean(a && b && a.kind === b.kind && (a.app || '') === (b.app || ''));

// Razorpay's checkout config for a choice: only that method, so the customer lands straight on it.
export function razorpayDisplay(choice) {
  const instruments = {
    // Intent opens the chosen app on a phone; the QR code stays as a fallback (e.g. on a computer).
    upi_app: [{ method: 'upi', flows: ['intent', 'qr'], apps: [choice.app] }],
    upi_any: [{ method: 'upi', flows: ['intent', 'qr'] }],
    upi_qr: [{ method: 'upi', flows: ['qr'] }],
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

// The last way this browser paid, picked again next time ("Recently used").
const KEY = 'bitevo-pay-method';
export function rememberedChoice() {
  try {
    const c = JSON.parse(localStorage.getItem(KEY) || 'null');
    return c && ['upi_app', 'upi_any', 'upi_qr', 'card', 'wallet', 'cod'].includes(c.kind) ? c : null;
  } catch {
    return null;
  }
}
export function rememberChoice(choice) {
  try { localStorage.setItem(KEY, JSON.stringify(choice)); } catch { /* storage blocked */ }
}
