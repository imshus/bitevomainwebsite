// Refunds, as on the website (frontend/src/components/RefundRequest.jsx and pages/Refunds.jsx): "Request a
// refund" (the customer says what went wrong and where the money should go: BiteVo wallet, or back to UPI / card
// for orders paid online), the Refunds screen with every refund and where it stands, and RefundStatus, the card
// for one. Only BiteVo's team makes refunds, in the admin panel; nothing is refunded by the app or the website,
// not even for a cancelled order (a request is made for the customer).
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, ToastAndroid, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { formatWhen, money } from '../lib/format';
import { Button, Card, LoadError, Loading, Pill } from '../components/ui';
import { Receipt, Shield, Wallet } from '../components/Icons';
import { C, R } from '../theme';

const REASONS = [
  { key: 'quality', label: 'Food quality or taste' },
  { key: 'missing', label: 'Items missing' },
  { key: 'wrong', label: 'Wrong items' },
  { key: 'late', label: 'Very late delivery' },
  { key: 'other', label: 'Something else' },
];

const where = (to, paymentMethod) => (to === 'source' ? `your ${paymentMethod && paymentMethod !== 'Cash on delivery' ? paymentMethod : 'original payment method'}` : 'your BiteVo wallet');

const TONE = {
  wait: { pill: 'amber', label: 'Under review', edge: C.amber },
  ok: { pill: 'green', label: 'Approved', edge: C.green },
  no: { pill: 'grey', label: 'Not approved', edge: C.faint },
};

// While it's under review, by kind: a cancelled paid order, a payment without an order, or a request the
// customer made. `paid` ({ online, wallet, … }) splits a cancelled order's refund back to UPI / card and wallet.
function waiting(request, paymentMethod, paid) {
  const to = where(request.to, paymentMethod);
  if (request.kind === 'cancelled') {
    const split = request.to === 'source' && paid?.wallet > 0 && paid.online > 0
      ? `: ${money(paid.online)} to ${to} and ${money(paid.wallet)} to your BiteVo wallet` : ` to ${to}`;
    return `You cancelled this order, so we’ve asked our team to refund the ${money(request.amount)} you paid${split}. We’ll email you once it’s decided.`;
  }
  if (request.kind === 'no_order') return `The order wasn’t placed, so our team will refund the ${money(request.amount)} you paid to ${to}.`;
  return `We’re looking into it: ${String(request.reason || '').toLowerCase()}. You asked for ${money(request.amount)} to ${to}. We’ll email you once it’s decided.`;
}

const SINCE = { cancelled: 'Cancelled', no_order: 'Paid' };

// The card for one refund: under review, approved (and where the money went) or not approved, with the note from
// BiteVo. On the order page it's "Refund request" (with `onAll`: a link to the Refunds screen); on the Refunds
// screen, `title` names the order and `onOpen` opens it.
export function RefundStatus({ request, paymentMethod, paid, title = 'Refund request', onOpen, onAll }) {
  const tone = request.status === 'approved' ? 'ok' : request.status === 'rejected' ? 'no' : 'wait';
  const d = request.decision;
  return (
    <Card style={[st.status, { borderLeftColor: TONE[tone].edge }]}>
      <View style={st.statusHead} accessibilityLiveRegion="polite">
        {onOpen ? (
          <Pressable onPress={onOpen} accessibilityRole="link" hitSlop={8}><Text style={[st.statusTitle, st.titleLink]}>{title} ›</Text></Pressable>
        ) : <Text style={st.statusTitle}>{title}</Text>}
        <Pill tone={TONE[tone].pill}>{TONE[tone].label}</Pill>
      </View>
      {tone === 'wait' && <Text style={st.statusText}>{waiting(request, paymentMethod, paid)}</Text>}
      {tone === 'ok' && d && (
        <Text style={st.statusText}>
          {money(d.amount)} refunded{d.to === 'source' && d.wallet > 0
            ? `: ${money(d.amount - d.wallet)} to ${where('source', paymentMethod)} (5–7 working days) and ${money(d.wallet)} to your BiteVo wallet`
            : d.to === 'source' ? ` to ${where('source', paymentMethod)}. It reaches you in 5–7 working days` : ' to your BiteVo wallet, ready for your next order'}.
        </Text>
      )}
      {tone === 'no' && <Text style={st.statusText}>We couldn’t approve this refund.</Text>}
      {request.note ? <Text style={[st.statusText, st.note]}><Text style={st.bold}>From BiteVo:</Text> {request.note}</Text> : null}
      <Text style={st.small}>{SINCE[request.kind] || 'Asked'} {formatWhen(request.createdAt)}{request.decidedAt ? ` · decided ${formatWhen(request.decidedAt)}` : ''}</Text>
      {onAll && <Pressable onPress={onAll} accessibilityRole="link" hitSlop={8}><Text style={st.allLink}>All your refunds ›</Text></Pressable>}
    </Card>
  );
}

const HOW = [
  { Icon: Receipt, title: 'Ask from the order', text: 'Open a delivered order (up to 3 days after delivery) in My orders and tap “Request a refund”. If you cancel a paid order, we ask for you.' },
  { Icon: Shield, title: 'Our team checks every request', text: 'Nothing is refunded automatically. We approve or decline each request, tell you why if we can’t approve it, and email you the outcome.' },
  { Icon: Wallet, title: 'Where the money goes', text: 'To your BiteVo wallet straight away once approved, or back to your UPI / card for orders paid online (5–7 working days). Anything paid from your wallet or in cash comes back to the wallet.' },
];

// The Refunds screen (from My account): every refund request (asked for, or made when a paid order was
// cancelled) and every payment that didn't become an order, newest first, then how refunds work.
export function RefundsScreen({ navigation }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(() => api.refunds().then(list => { setItems(list); setError(null); }, setError), []);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!items) return error ? <LoadError error={error} onRetry={load} /> : <Loading label="Loading your refunds…" />;
  const open = items.filter(i => i.status === 'pending');
  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={st.page}
      data={items}
      keyExtractor={i => `${i.type}-${i._id}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} colors={[C.red]} />}
      ListHeaderComponent={items.length ? (
        <Text style={st.lead}>{open.length ? `${open.length} under review (${money(open.reduce((s, i) => s + (i.amount || 0), 0))}) · ` : ''}{items.length} in all</Text>
      ) : (
        <Card style={st.group}>
          <Text style={st.statusTitle}>No refunds yet</Text>
          <Text style={st.statusText}>If something was wrong with an order, open it in My orders and tap “Request a refund”.</Text>
        </Card>
      )}
      renderItem={({ item: i }) => (
        <RefundStatus
          request={i}
          paymentMethod={i.paymentMethod}
          paid={i.paid}
          title={i.type === 'payment' ? 'Payment without an order' : `Order #${i.orderNo}`}
          onOpen={i.type === 'order' ? () => navigation.navigate('OrderDetail', { id: i.orderId }) : undefined}
        />
      )}
      ListFooterComponent={(
        <Card style={st.how}>
          <Text style={st.statusTitle}>How refunds work</Text>
          {HOW.map(({ Icon, title, text }) => (
            <View key={title} style={st.howRow}>
              <View style={st.howIcon}><Icon size={18} color={C.red} /></View>
              <View style={st.optBody}>
                <Text style={st.optTitle}>{title}</Text>
                <Text style={st.optSub}>{text}</Text>
              </View>
            </View>
          ))}
        </Card>
      )}
    />
  );
}

function Option({ on, onPress, title, text }) {
  return (
    <Pressable onPress={onPress} style={[st.opt, on && st.optOn]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
      <View style={[st.radio, on && st.radioOn]}>{on && <View style={st.radioDot} />}</View>
      <View style={st.optBody}>
        <Text style={st.optTitle}>{title}</Text>
        {text ? <Text style={st.optSub}>{text}</Text> : null}
      </View>
    </Pressable>
  );
}

// The form, opened from the order page with { order: { _id, orderNo, paymentMethod, paid, total } }. Once sent,
// it goes back to the order page, which loads the order again and shows the request.
export function RefundRequestScreen({ route, navigation }) {
  const { order } = route.params;
  const paid = order.paid || { total: order.total, online: 0, wallet: 0, cash: 0 };
  const canSource = paid.online > 0;
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [to, setTo] = useState(canSource ? 'source' : 'wallet');
  const [amount, setAmount] = useState(String(paid.total));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // The same checks (and words) as the API's.
  const problem = () => {
    if (!reason) return 'Choose what went wrong.';
    if (details.trim().length < 10) return 'Tell us a little more about what went wrong (at least a few words).';
    const n = Number(amount);
    if (!(n >= 1 && n <= paid.total)) return `Enter an amount from ₹1 to ₹${paid.total}.`;
    return '';
  };

  const send = async () => {
    const why = problem();
    if (why) { setError(why); return; }
    setBusy(true);
    setError('');
    try {
      await api.requestRefund(order._id, { reason, details: details.trim(), to, amount: Math.round(Number(amount)) });
      ToastAndroid.show('Refund request sent. We’ll email you once it’s reviewed.', ToastAndroid.LONG);
      navigation.goBack();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={st.page} keyboardShouldPersistTaps="handled">
      <Text style={st.lead}>Order #{order.orderNo} · you paid {money(paid.total)}. Our team checks every request and replies by email.</Text>

      <Card style={st.group}>
        <Text style={st.label}>What went wrong?</Text>
        <View accessibilityRole="radiogroup" style={st.group}>
          {REASONS.map(r => <Option key={r.key} on={reason === r.key} onPress={() => setReason(r.key)} title={r.label} />)}
        </View>
      </Card>

      <Card style={st.group}>
        <Text style={st.label}>Tell us more</Text>
        <TextInput
          value={details} onChangeText={setDetails} multiline maxLength={500} textAlignVertical="top"
          placeholder="e.g. The biryani was cold and the raita was missing." placeholderTextColor={C.faint} style={[st.input, st.textarea]}
        />
      </Card>

      <Card style={st.group}>
        <Text style={st.label}>Where should the money go?</Text>
        <View accessibilityRole="radiogroup" style={st.group}>
          {canSource && (
            <Option on={to === 'source'} onPress={() => setTo('source')} title={`Back to ${order.paymentMethod}`}
              text={`5–7 working days after approval${paid.wallet > 0 ? '; the part paid from your wallet goes back to the wallet' : ''}`} />
          )}
          <Option on={to === 'wallet'} onPress={() => setTo('wallet')} title="BiteVo wallet" text="Straight away once approved, for your next order" />
        </View>
        {!canSource && <Text style={st.fine}>This order was paid {paid.cash > 0 ? 'in cash' : 'from your wallet'}, so a refund goes to your BiteVo wallet.</Text>}
      </Card>

      <Card style={st.group}>
        <Text style={st.label}>Amount <Text style={st.hint}>(up to {money(paid.total)})</Text></Text>
        <TextInput
          value={amount} onChangeText={v => setAmount(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad"
          placeholderTextColor={C.faint} style={st.input} accessibilityLabel={`Amount, up to ${money(paid.total)}`}
        />
      </Card>

      {error ? <Text style={st.error} accessibilityLiveRegion="assertive">{error}</Text> : null}
      <Button title="Send refund request" onPress={send} busy={busy} />
      <Text style={[st.fine, st.center]}>The refund is made only once our team approves it.</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  page: { padding: 14, gap: 12 },
  group: { gap: 8 },
  center: { textAlign: 'center' },
  status: { gap: 6, borderLeftWidth: 4 },
  statusHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  statusTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  titleLink: { color: C.red },
  allLink: { color: C.red, fontWeight: '700', fontSize: 13.5, marginTop: 2 },
  how: { gap: 12, marginTop: 4 },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  howIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' },
  statusText: { fontSize: 14.5, color: '#444', lineHeight: 20 },
  note: { backgroundColor: '#FAF7F7', borderRadius: R.sm, paddingVertical: 8, paddingHorizontal: 10, overflow: 'hidden' },
  bold: { fontWeight: '700', color: C.ink },
  small: { fontSize: 12.5, color: C.muted },
  lead: { fontSize: 13.5, color: C.muted, lineHeight: 19, paddingHorizontal: 2 },
  label: { fontSize: 14, fontWeight: '800', color: C.ink },
  hint: { fontWeight: '500', color: C.muted },
  opt: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1.5, borderColor: C.line },
  optOn: { borderColor: C.red, backgroundColor: '#FFF4F4' },
  optBody: { flex: 1 },
  optTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
  optSub: { fontSize: 12.5, color: C.muted, marginTop: 2, lineHeight: 17 },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#BDBDBD', alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  radioOn: { borderColor: C.red },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red },
  input: { borderWidth: 1.5, borderColor: '#DADADA', borderRadius: 12, height: 50, paddingHorizontal: 14, fontSize: 15, color: C.ink },
  textarea: { height: 96, paddingTop: 12, paddingBottom: 12 },
  fine: { fontSize: 12.5, color: C.muted, lineHeight: 17 },
  error: { color: C.red, fontSize: 14, textAlign: 'center' },
});
