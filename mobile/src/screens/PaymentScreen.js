// The payment screen, the step after checkout, as on the website (frontend/src/components/PaymentPage.jsx): the
// bill total on top, then every way to pay grouped as UPI apps, cards, wallets and cash on delivery,
// with "Pay ₹…" pinned to the bottom. Paying online opens Razorpay's
// checkout straight on the chosen method (components/RazorpayCheckout.js, lib/payMethods.js); the order is placed
// with the payment once Razorpay has it, and the server checks the payment before taking it.
// Params from checkout: body (the order, as for POST /orders), quote (the bill), itemCount, where.
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { money } from '../lib/format';
import { UPI_APPS, DEFAULT_CHOICE, payLabel, razorpayDisplay, rememberChoice, rememberedChoice, sameChoice } from '../lib/payMethods';
import { Button } from '../components/ui';
import RazorpayCheckout from '../components/RazorpayCheckout';
import { Cash, CardIcon, Shield, Wallet } from '../components/Icons';
import { C } from '../theme';

const AppMark = ({ app }) => <View style={[st.mark, { backgroundColor: app.bg }]}><Text style={[st.markText, { color: app.fg }]}>{app.mark}</Text></View>;
const UpiMark = () => <View style={[st.mark, st.markLight]}><Text style={st.upiText}>UPI</Text></View>;
const IconMark = ({ icon: I }) => <View style={[st.mark, st.markSoft]}><I size={21} color={C.red} width={1.9} /></View>;

function markFor(choice) {
  switch (choice.kind) {
    case 'upi_app': return <AppMark app={UPI_APPS.find(a => a.app === choice.app) || UPI_APPS[0]} />;
    case 'card': return <IconMark icon={CardIcon} />;
    case 'wallet': return <IconMark icon={Wallet} />;
    case 'cod': return <IconMark icon={Cash} />;
    default: return <UpiMark />;
  }
}

function Option({ choice, selected, onSelect, title, text, first }) {
  const on = sameChoice(choice, selected);
  return (
    <Pressable onPress={() => onSelect(choice)} style={[st.opt, !first && st.optLine, on && st.optOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      {markFor(choice)}
      <View style={st.optText}>
        <Text style={st.optTitle}>{title || payLabel(choice)}</Text>
        {text ? <Text style={st.optSub}>{text}</Text> : null}
      </View>
      <View style={[st.radio, on && st.radioOn]}>{on && <View style={st.radioDot} />}</View>
    </Pressable>
  );
}

const Section = ({ title, children }) => (
  <View style={st.card}>
    <Text style={st.label}>{title}</Text>
    {children}
  </View>
);

export default function PaymentScreen({ navigation, route }) {
  const { body, quote, itemCount, where } = route.params;
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const { setCustomer } = useAuth();
  const [choice, setChoice] = useState(DEFAULT_CHOICE);
  const [recent, setRecent] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paying, setPaying] = useState(null); // the Razorpay order while its checkout is open

  useEffect(() => {
    rememberedChoice().then(c => { if (c) { setRecent(c); setChoice(c); } });
  }, []);

  const choose = c => { setChoice(c); setError(''); };
  const cod = choice.kind === 'cod';

  const done = order => {
    cart.clear();
    if (body.deliveryPhone) api.me().then(setCustomer, () => {}); // picks up the saved delivery number
    navigation.reset({ index: 1, routes: [{ name: 'Tabs' }, { name: 'OrderDetail', params: { id: order._id, justPlaced: true } }] });
  };
  const failed = err => {
    setError(err.data?.quote ? `${err.message} Go back to your cart to check the new bill.` : err.message);
    setBusy(false);
  };

  const pay = async () => {
    setError('');
    setBusy(true);
    rememberChoice(choice);
    try {
      if (cod) { done(await api.placeOrder(body)); return; }
      setPaying(await api.payOnline(body)); // Razorpay's checkout opens; onPaid follows
    } catch (err) {
      failed(err);
    }
  };

  // Razorpay's window closed. A clear "paid" places the order; anything else (cancelled, failed, or the result lost
  // on the way back from the UPI app) first asks the server whether the money came in anyway: then the server
  // places the order, so a payment never ends up refunded just because the app lost track of it.
  const onPaid = async result => {
    const rzpOrderId = paying?.orderId;
    setPaying(null);
    const recover = async fallback => {
      try {
        const r = rzpOrderId ? await api.completePayment(rzpOrderId) : null;
        if (r?.order) { done(r.order); return; }
        setError(r?.message || fallback);
      } catch {
        setError(fallback);
      }
      setBusy(false);
    };
    if (result.type !== 'paid') { await recover(result.description); return; }
    try {
      done(await api.placeOrder({ ...body, payment: { orderId: result.orderId, paymentId: result.paymentId, signature: result.signature } }));
    } catch (err) {
      if (err.data?.quote) { failed(err); return; }
      await recover(err.message);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 130 + insets.bottom }}>
        <View style={[st.card, st.total]}>
          <View style={st.totalLeft}>
            <Text style={st.totalSmall}>Bill total</Text>
            <Text style={st.totalBig}>{money(quote.payable)}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={st.muted}>{itemCount} item{itemCount === 1 ? '' : 's'} · {where}</Text>
            {quote.discount > 0 && <Text style={st.good}>You save {money(quote.discount)} on this order</Text>}
            {quote.walletUsed > 0 && <Text style={st.good}>{money(quote.walletUsed)} paid from your BiteVo wallet</Text>}
          </View>
        </View>

        {recent && (
          <Section title="RECENTLY USED">
            <Option first choice={recent} selected={choice} onSelect={choose} />
          </Section>
        )}

        <Section title="PAY BY ANY UPI APP">
          {UPI_APPS.map((a, i) => <Option key={a.app} first={i === 0} choice={{ kind: 'upi_app', app: a.app }} selected={choice} onSelect={choose} title={a.name} />)}
          <Option choice={{ kind: 'upi_any' }} selected={choice} onSelect={choose} title="Other UPI apps" text="BHIM, CRED, Amazon Pay UPI and more" />
        </Section>

        <Section title="CREDIT & DEBIT CARDS">
          <Option first choice={{ kind: 'card' }} selected={choice} onSelect={choose} title="Add credit or debit card" text="Visa, Mastercard, RuPay, Amex" />
        </Section>

        <Section title="WALLETS">
          <Option first choice={{ kind: 'wallet' }} selected={choice} onSelect={choose} title="Wallets" text="Amazon Pay, MobiKwik and more" />
        </Section>

        <Section title="PAY ON DELIVERY">
          <Option first choice={{ kind: 'cod' }} selected={choice} onSelect={choose} title="Cash on delivery" text="Pay cash, or by UPI to the delivery partner" />
        </Section>

        <View style={st.secure}>
          <Shield size={17} color={C.green} />
          <Text style={st.secureText}>100% secure payments by Razorpay. BiteVo never sees or stores your card or UPI details.</Text>
        </View>
      </ScrollView>

      <View style={[st.bar, { paddingBottom: 12 + insets.bottom }]}>
        {error ? <Text style={st.error}>{error}</Text> : null}
        <View style={st.barRow}>
          <View style={{ flex: 1 }}>
            <Text style={st.barLabel}>PAYING WITH</Text>
            <Text style={st.barWith} numberOfLines={1}>{payLabel(choice)}</Text>
          </View>
          <Button
            title={busy ? (cod ? 'Placing order…' : 'Opening payment…') : cod ? `Place order · ${money(quote.payable)}` : `Pay ${money(quote.payable)}`}
            onPress={pay} busy={busy} disabled={busy} style={{ flex: 1.3 }}
          />
        </View>
      </View>
      <RazorpayCheckout pay={paying} display={razorpayDisplay(choice)} onResult={onPaid} />
    </View>
  );
}

const st = StyleSheet.create({
  card: { backgroundColor: C.white, borderRadius: 18, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4 },
  label: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.muted, marginBottom: 6, marginLeft: 4 },
  total: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  totalLeft: { paddingRight: 14, borderRightWidth: 1, borderRightColor: C.line, borderStyle: 'dashed' },
  totalSmall: { fontSize: 12.5, color: C.muted, fontWeight: '600' },
  totalBig: { fontSize: 24, fontWeight: '800', color: C.ink },
  muted: { fontSize: 13, color: C.muted },
  good: { fontSize: 13, color: C.green, fontWeight: '700' },
  opt: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 6, borderRadius: 12 },
  optLine: { borderTopWidth: 1, borderTopColor: '#F1EAEA' },
  optOn: { backgroundColor: '#FFF4F4' },
  optText: { flex: 1 },
  optTitle: { fontSize: 15.5, fontWeight: '700', color: C.ink },
  optSub: { fontSize: 12.5, color: C.muted, marginTop: 1 },
  mark: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#ECE5E5' },
  markText: { fontSize: 15, fontWeight: '800' },
  markLight: { backgroundColor: C.white },
  markSoft: { backgroundColor: C.redSoft, borderColor: 'transparent' },
  upiText: { fontSize: 11.5, fontWeight: '800', fontStyle: 'italic', color: '#097939' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#CFCFCF', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.red },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: C.red },
  secure: { flexDirection: 'row', gap: 8, paddingHorizontal: 6, alignItems: 'flex-start' },
  secureText: { flex: 1, fontSize: 12.5, color: C.muted, lineHeight: 18 },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.white, paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, gap: 8 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  barLabel: { fontSize: 10.5, fontWeight: '800', color: C.muted, letterSpacing: 0.5 },
  barWith: { fontSize: 14.5, fontWeight: '800', color: C.ink },
  error: { color: C.red, fontSize: 13 },
});
