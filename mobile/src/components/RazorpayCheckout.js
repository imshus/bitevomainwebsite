// Paying online in the app: Razorpay's own checkout (checkout.js, the same payment window as on the website) in a
// full-screen web view. Banks' pages (cards, netbanking) take over that view, so Razorpay runs in redirect mode
// and posts the result to the API's return page (backend/src/routes/payments.js), which hands it back here.
// UPI apps (GPay, PhonePe, Paytm…) open from it as they do from the phone's browser.
// The result is only passed on: the order is placed with POST /api/orders, which checks the signature and the
// payment with Razorpay before taking it, so nothing a page says here can fake a payment.
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL, SITE_URL } from '../config';
import { money } from '../lib/format';
import { Close } from './Icons';
import { C } from '../theme';

const RETURN_URL = `${API_URL.replace(/\/$/, '')}/api/payments/razorpay-return`;

// The page that opens Razorpay's checkout with this payment (from POST /orders/pay).
function page(pay) {
  const options = {
    key: pay.keyId,
    order_id: pay.orderId,
    amount: pay.amount,
    currency: pay.currency,
    name: 'BiteVo',
    description: 'Food order',
    image: `${SITE_URL.replace(/\/$/, '')}/assets/icon-192.png`,
    prefill: pay.prefill || {},
    theme: { color: C.red },
    callback_url: RETURN_URL,
    redirect: true,
  };
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;height:100%;font:15px sans-serif;color:#6B6B6B}body{display:flex;align-items:center;justify-content:center;text-align:center;padding:0 24px}</style>
</head><body><p>Opening Razorpay…</p>
<script src="https://checkout.razorpay.com/v1/checkout.js"></script>
<script>
(function () {
  function say(m) { if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(m)); }
  if (!window.Razorpay) { say({ type: 'error', description: 'Couldn’t open the payment window. Check your internet connection and try again.' }); return; }
  var options = ${JSON.stringify(options).replace(/</g, '\\u003c')};
  options.modal = { ondismiss: function () { say({ type: 'dismissed' }); } };
  var rzp = new Razorpay(options);
  rzp.on('payment.failed', function (e) { say({ type: 'attempt-failed', description: e && e.error && e.error.description }); });
  rzp.open();
})();
</script></body></html>`;
}

// intent://pay?…#Intent;scheme=upi;package=…;end → upi://pay?… (what Android can open as a link).
function appLink(url) {
  if (!/^intent:/i.test(url)) return url;
  const m = /^intent:\/\/([^#]*)#Intent;(.*)$/i.exec(url);
  const scheme = m && /(?:^|;)scheme=([^;]+)/i.exec(m[2])?.[1];
  if (scheme) return `${scheme}://${m[1]}`;
  const fallback = m && /(?:^|;)S\.browser_fallback_url=([^;]+)/i.exec(m[2])?.[1];
  return fallback ? decodeURIComponent(fallback) : null;
}

/**
 * pay       the answer of POST /orders/pay ({ keyId, orderId, amount, currency, prefill }), or null (closed)
 * onResult  called once with { type: 'paid', orderId, paymentId, signature } or { type: 'dismissed' | 'failed' |
 *           'error', description }
 */
export default function RazorpayCheckout({ pay, onResult }) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const done = useRef(false);
  const finish = result => {
    if (done.current) return;
    done.current = true;
    onResult(result);
  };

  const onMessage = e => {
    let m = null;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m?.type === 'paid' && m.orderId && m.paymentId && m.signature) finish(m);
    else if (m?.type === 'dismissed') finish({ type: 'dismissed', description: 'Payment cancelled. Nothing was charged.' });
    else if (m?.type === 'failed' || m?.type === 'error') finish({ type: m.type, description: m.description || 'That payment didn’t go through. No money was taken.' });
    // 'attempt-failed': Razorpay shows it and lets the customer try again in the same window.
  };

  // Web pages load here; UPI apps and other app links open the app (the customer comes back to finish).
  const onNavigate = req => {
    const url = req.url || '';
    if (/^(https?|about|data|blob|javascript):/i.test(url)) return true;
    const link = appLink(url);
    if (link) {
      Linking.openURL(link).catch(() => Alert.alert('Couldn’t open that app', 'It may not be installed on this phone. Pick another way to pay.'));
    }
    return false;
  };

  const close = () => Alert.alert('Cancel the payment?', 'If money was already taken, it is refunded automatically.', [
    { text: 'Keep paying', style: 'cancel' },
    { text: 'Cancel payment', style: 'destructive', onPress: () => finish({ type: 'dismissed', description: 'Payment cancelled.' }) },
  ]);

  if (!pay) return null;
  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <View style={[st.head, { paddingTop: insets.top + 10 }]}>
        <View style={{ flex: 1 }}>
          <Text style={st.title}>Pay {money(pay.amount / 100)}</Text>
          <Text style={st.sub}>Secured by Razorpay · UPI, cards, netbanking</Text>
        </View>
        <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Cancel the payment" style={st.close}>
          <Close size={22} color={C.ink} />
        </Pressable>
      </View>
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        <WebView
          source={{ html: page(pay), baseUrl: `${SITE_URL.replace(/\/$/, '')}/` }}
          originWhitelist={['*']}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={onNavigate}
          setSupportMultipleWindows={false}
          javaScriptCanOpenWindowsAutomatically={false}
          domStorageEnabled
          thirdPartyCookiesEnabled
          onLoadEnd={() => setLoading(false)}
          onError={() => finish({ type: 'error', description: 'Couldn’t open the payment window. Check your internet connection and try again.' })}
          style={{ flex: 1 }}
        />
        {loading && <View style={st.loading} pointerEvents="none"><ActivityIndicator color={C.red} size="large" /></View>}
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12, backgroundColor: C.white, borderBottomWidth: 1, borderBottomColor: C.line },
  title: { fontSize: 17, fontWeight: '800', color: C.ink },
  sub: { fontSize: 12.5, color: C.muted, marginTop: 1 },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F2F2F2' },
  loading: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
});
