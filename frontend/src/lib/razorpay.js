// Razorpay's payment window (checkout.js), loaded the first time someone pays online.
let loading = null;
function loadCheckout() {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  loading ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(window.Razorpay);
    script.onerror = () => { loading = null; reject(new Error('Couldn’t open the payment window. Check your internet connection and try again.')); };
    document.head.appendChild(script);
  });
  return loading;
}

// Opens the payment window for an order from POST /orders/pay. Resolves with Razorpay's
// { razorpay_order_id, razorpay_payment_id, razorpay_signature } once paid; rejects (dismissed: true)
// if the customer closes the window. A failed attempt keeps the window open for another try.
export async function payWithRazorpay(pay, { onFailed } = {}) {
  const Razorpay = await loadCheckout();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: pay.keyId,
      order_id: pay.orderId,
      amount: pay.amount,
      currency: pay.currency,
      name: 'BiteVo',
      description: 'Food order',
      image: `${window.location.origin}/assets/icon-192.png`,
      prefill: pay.prefill,
      theme: { color: '#B71C1C' },
      handler: resolve,
      modal: { ondismiss: () => reject(Object.assign(new Error('Payment cancelled. Nothing was charged.'), { dismissed: true })) },
    });
    rzp.on('payment.failed', e => onFailed?.(e?.error?.description));
    rzp.open();
  });
}
