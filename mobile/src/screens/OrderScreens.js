// "My orders" and one order's page, which follows the order live (every 5 seconds) while it's on its way, with
// the delivery partner's live status and, while the rider app shares where they are, the live map.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Alert as Confirm, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, ToastAndroid, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../state/auth';
import { addressLine, formatTime, formatWhen, itemsSummary, LIVE_STATUSES, money, ORDER_STATUS } from '../lib/format';
import { API_URL, SUPPORT_PHONE } from '../config';
import { Button, Card, Empty, LoadError, Loading, Pill } from '../components/ui';
import { Bike, Check, Receipt } from '../components/Icons';
import RiderMap from '../components/RiderMap';
import { useLiveTrip } from '../lib/eta';
import { useConfig } from '../state/data';
import { RefundStatus } from './RefundScreens';
import { C, R } from '../theme';

const REFRESH_MS = 5000; // while the order is live, so the steps, the rider and the map move within seconds

const Status = ({ status }) => <Pill tone={ORDER_STATUS[status]?.tone || 'grey'}>{ORDER_STATUS[status]?.short || status}</Pill>;

export function OrdersScreen({ navigation }) {
  const { customer } = useAuth();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => api.orders().then(o => { setOrders(o); setError(null); }, setError), []);
  useFocusEffect(useCallback(() => { if (customer) load(); }, [customer, load]));

  if (!customer) {
    return (
      <Empty icon={<Receipt size={44} color={C.red} />} title="Your orders live here" text="Sign in to see and follow your orders.">
        <Button title="Sign in" onPress={() => navigation.navigate('SignIn')} />
      </Empty>
    );
  }
  if (!orders) return error ? <LoadError error={error} onRetry={load} /> : <Loading label="Loading your orders…" />;
  if (!orders.length) {
    return (
      <Empty icon={<Receipt size={44} color={C.red} />} title="No orders yet" text="Your first order is a few taps away.">
        <Button title="Browse the menu" onPress={() => navigation.navigate('Menu')} />
      </Empty>
    );
  }
  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      data={orders}
      keyExtractor={o => o._id}
      contentContainerStyle={{ padding: 14, gap: 10 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load().finally(() => setRefreshing(false)); }} colors={[C.red]} />}
      renderItem={({ item: o }) => (
        <Pressable onPress={() => navigation.navigate('OrderDetail', { id: o._id })}>
          <Card style={{ gap: 6 }}>
            <View style={st.rowBetween}>
              <Text style={st.orderNo}>Order #{o.orderNo}</Text>
              <Status status={o.status} />
            </View>
            <Text style={st.muted}>{formatWhen(o.placedAt)}</Text>
            <Text style={st.items} numberOfLines={2}>{itemsSummary(o.items)}</Text>
            <View style={st.rowBetween}>
              <Text style={st.total}>{money(o.total)}</Text>
              <Text style={st.link}>{LIVE_STATUSES.includes(o.status) ? 'Track order ›' : 'View details ›'}</Text>
            </View>
          </Card>
        </Pressable>
      )}
    />
  );
}

const STEPS = [
  { status: 'placed', title: 'Order placed', text: 'Waiting for the kitchen to accept it.' },
  { status: 'preparing', title: 'Being prepared', text: 'The kitchen is cooking your food.' },
  { status: 'out_for_delivery', title: 'Out for delivery', text: 'Your order is on its way.' },
  { status: 'delivered', title: 'Delivered', text: 'Enjoy your meal!' },
];

const firstName = name => String(name || '').trim().split(/\s+/)[0] || 'Your delivery partner';

// The chip's dot breathes while the order is on its way.
function Breathing({ on, color }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!on) return undefined;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.3, duration: 550, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 550, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [on, v]);
  return <Animated.View style={[st.chipDot, { backgroundColor: color, opacity: on ? v : 1 }]} />;
}

const CHIP = { live: [C.redSoft, C.red], set: [C.greenSoft, C.green], done: ['#F1F1F1', '#555'] };

// The delivery partner's live status, as on the website's order page: who's bringing the order, how far they are
// (from the rider app's position and the address's location) and, while their position is known, when the order
// arrives (lib/eta.js: the ride to the kitchen, any cooking still left, the ride to the door). A rider the
// kitchen assigned shows by name only once they accept (they may decline, and then someone else is assigned).
function RiderCard({ order }) {
  const { data: config } = useConfig();
  const trip = useLiveTrip(order, config);
  const r = order.rider;
  const s = order.status;
  if (s === 'cancelled' || (s === 'delivered' && !r)) return null;
  let tone; let chip = null; let title; let text;
  const name = r && r.status !== 'requested' ? firstName(r.name) : null;
  if (s === 'delivered') {
    tone = 'done'; chip = 'Delivered'; title = name;
    text = order.deliveredAt ? `Delivered your order at ${formatTime(order.deliveredAt)}.` : 'Delivered your order.';
  } else if (!name) {
    tone = 'wait'; title = r ? 'Being assigned' : 'Not assigned yet';
    text = r ? 'Finding a delivery partner for your order…'
      : s === 'placed' ? 'A delivery partner is assigned once the kitchen accepts your order.' : 'We’re assigning a delivery partner for your order.';
  } else if (s === 'out_for_delivery') {
    tone = 'live'; chip = 'On the way'; title = name;
    // With the map showing, its chip gives the arrival time and road distance; the card doesn't repeat it.
    text = r.distanceKm == null ? `Picked up your order${order.dispatchedAt ? ` at ${formatTime(order.dispatchedAt)}` : ''} and is on the way.`
      : r.distanceKm < 0.2 ? 'Almost at your door.' : r.position ? 'Is on the way to you with your order.' : `${r.distanceKm} km away from you.`;
  } else {
    // Accepted, before pickup: on the way to the kitchen (or already there) when the rider app shares where they are.
    tone = 'set'; title = name;
    const atKitchen = r.distanceKm != null && r.distanceKm < 0.1;
    chip = !r.position ? 'Assigned' : atKitchen ? 'At kitchen' : 'Picking up';
    text = !r.position ? 'Will pick up your order as soon as it’s ready.'
      : atKitchen ? 'Is at the kitchen and will pick up your order as soon as it’s ready.'
      : r.distanceKm != null ? `Is on the way to the kitchen, ${r.distanceKm} km away from it, to pick up your order.`
      : 'Is on the way to the kitchen to pick up your order.';
  }
  const showMap = Boolean(r?.position) && (tone === 'live' || tone === 'set');
  const eta = showMap ? trip.eta : null;
  const arrivingNow = tone === 'live' && r.distanceKm != null && r.distanceKm < 0.2;
  const [chipBg, chipFg] = CHIP[tone] || CHIP.set;
  const wait = tone === 'wait';
  return (
    <Card>
      <View style={st.riderRow} accessibilityLiveRegion="polite">
        <View style={[st.avatar, wait && { backgroundColor: C.amberSoft }]}>
          {name ? <Text style={st.avatarText}>{name[0].toUpperCase()}</Text> : <Bike size={22} color={wait ? C.amber : C.red} />}
        </View>
        <View style={st.riderBody}>
          <View style={st.riderTop}>
            <Text style={st.riderLabel}>DELIVERY PARTNER</Text>
            {chip && (
              <View style={[st.chip, { backgroundColor: chipBg }]}>
                <Breathing on={tone === 'live'} color={chipFg} />
                <Text style={[st.chipText, { color: chipFg }]} numberOfLines={1}>{chip}</Text>
              </View>
            )}
          </View>
          <Text style={st.riderName}>{title}</Text>
          <Text style={st.riderText}>{text}</Text>
          {eta && (
            <View style={st.etaRow}>
              <Text style={st.etaText}>{arrivingNow ? 'Arriving now' : `Arriving in ~${eta.minutes} min`}</Text>
              {!arrivingNow && <Text style={st.etaBy}>by {formatTime(eta.by)}</Text>}
            </View>
          )}
        </View>
      </View>
      {/* The live map, while the rider app is sending the rider's position: to the kitchen, then to you. */}
      {showMap && (
        <RiderMap rider={r.position} home={trip.home} kitchen={trip.kitchen} leg={r.leg} route={trip.route} eta={trip.eta} distanceKm={r.distanceKm} />
      )}
    </Card>
  );
}

export function OrderDetailScreen({ route, navigation }) {
  const { id, justPlaced } = route.params;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  const [openingInvoice, setOpeningInvoice] = useState(false);

  const load = useCallback(() => api.order(id).then(o => { setOrder(o); setError(null); }, setError), [id]);
  // Loaded each time the page shows, so coming back from "Request a refund" shows the request.
  useFocusEffect(useCallback(() => { load(); }, [load]));
  // While the order is live, check for news every few seconds, only while this screen is showing and the app
  // is open (and straight away on coming back to it).
  const live = Boolean(order && LIVE_STATUSES.includes(order.status));
  useFocusEffect(useCallback(() => {
    if (!live) return undefined;
    const t = setInterval(() => { if (AppState.currentState === 'active') load(); }, REFRESH_MS);
    const back = AppState.addEventListener('change', state => { if (state === 'active') load(); });
    return () => { clearInterval(t); back.remove(); };
  }, [live, load]));

  if (!order) return error ? <LoadError error={error} onRetry={load} /> : <Loading />;

  // The invoice (the API's template with the whole bill) opens in the phone's browser, where it can be saved
  // as a PDF or shared; its link works without signing in for a day.
  const openInvoice = async () => {
    setOpeningInvoice(true);
    try {
      const { path } = await api.invoiceLink(order._id);
      await Linking.openURL(`${API_URL.replace(/\/$/, '')}${path}`);
    } catch (err) {
      Confirm.alert('Couldn’t open the invoice', err.message || 'Please try again.');
    }
    setOpeningInvoice(false);
  };

  const reached = STEPS.findIndex(s => s.status === order.status);
  const at = status => order.history?.find(h => h.status === status)?.at;
  // Nothing is refunded straight away: a refund request for what was paid goes to our team (Refunds screen).
  const paid = order.paid?.total || 0;
  const cancel = () => Confirm.alert('Cancel this order?', paid
    ? `You can cancel until the kitchen starts cooking. Our team will check it and refund the ${money(paid)} you paid; you can follow it under Refunds.`
    : 'You can cancel until the kitchen starts cooking.', [
    { text: 'Keep it', style: 'cancel' },
    {
      text: 'Cancel order', style: 'destructive', onPress: async () => {
        setCancelling(true);
        try {
          setOrder(await api.cancelOrder(order._id));
          if (paid) ToastAndroid.show('Order cancelled. Your refund is with our team for approval.', ToastAndroid.LONG);
        } catch (err) { Confirm.alert('Couldn’t cancel', err.message); }
        setCancelling(false);
        load(); // picks up the refund request
      },
    },
  ]);
  const askRefund = () => navigation.navigate('RefundRequest', {
    order: { _id: order._id, orderNo: order.orderNo, paymentMethod: order.paymentMethod, paid: order.paid, total: order.total },
  });

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 14, gap: 12 }}>
      {justPlaced && order.status === 'placed' && (
        <View style={st.placed}>
          <Text style={st.placedTitle}>Order placed! 🎉</Text>
          <Text style={st.placedText}>We’ve sent it to the kitchen. This page updates by itself as your food gets ready.</Text>
        </View>
      )}
      <Card style={{ gap: 4 }}>
        <View style={st.rowBetween}><Text style={st.orderNo}>Order #{order.orderNo}</Text><Status status={order.status} /></View>
        <Text style={st.muted}>{formatWhen(order.placedAt)}</Text>
      </Card>

      {order.status === 'cancelled' ? (
        <Card style={{ gap: 4 }}>
          <Text style={[st.stepTitle, { color: C.red }]}>This order was cancelled</Text>
          {order.cancelReason ? <Text style={st.muted}>{order.cancelReason}</Text> : null}
          {order.refund ? <Text style={st.muted}>Your refund is on its way.</Text> : null}
        </Card>
      ) : (
        <Card style={{ gap: 0 }}>
          {STEPS.map((s, i) => {
            const done = i <= reached;
            return (
              <View key={s.status} style={st.step}>
                <View style={{ alignItems: 'center' }}>
                  <View style={[st.dot, done && st.dotOn]}>{done && <Check size={14} color={C.white} width={3} />}</View>
                  {i < STEPS.length - 1 && <View style={[st.bar, i < reached && st.barOn]} />}
                </View>
                <View style={{ flex: 1, paddingBottom: 18 }}>
                  <Text style={[st.stepTitle, !done && { color: C.faint }]}>{s.title}{done && at(s.status) ? `  ·  ${formatTime(at(s.status))}` : ''}</Text>
                  {i === reached && <Text style={st.muted}>{s.status === 'out_for_delivery' && order.agentName ? `${order.agentName} is bringing your order.` : s.text}</Text>}
                </View>
              </View>
            );
          })}
        </Card>
      )}

      <RiderCard order={order} />

      {order.refundRequest && <RefundStatus request={order.refundRequest} paymentMethod={order.paymentMethod} paid={order.paid} onAll={() => navigation.navigate('Refunds')} />}

      <Card style={{ gap: 8 }}>
        <Text style={st.cardTitle}>Your order</Text>
        {order.items.map((i, n) => (
          <View key={n} style={st.rowBetween}><Text style={st.items}>{i.qty} × {i.name}</Text><Text style={st.items}>{money((i.price || 0) * i.qty)}</Text></View>
        ))}
        <View style={st.sep} />
        <View style={st.rowBetween}><Text style={st.muted}>Item total</Text><Text style={st.items}>{money(order.subtotal)}</Text></View>
        <View style={st.rowBetween}><Text style={st.muted}>Delivery fee</Text><Text style={st.items}>{order.deliveryFee ? money(order.deliveryFee) : 'FREE'}</Text></View>
        {order.discount > 0 && <View style={st.rowBetween}><Text style={[st.muted, { color: C.green }]}>Offer{order.couponCode ? ` (${order.couponCode})` : ''}</Text><Text style={[st.items, { color: C.green }]}>−{money(order.discount)}</Text></View>}
        {order.walletUsed > 0 && <View style={st.rowBetween}><Text style={[st.muted, { color: C.green }]}>From wallet</Text><Text style={[st.items, { color: C.green }]}>−{money(order.walletUsed)}</Text></View>}
        <View style={st.rowBetween}><Text style={st.total}>Total</Text><Text style={st.total}>{money(order.total)}</Text></View>
        <Text style={st.muted}>{order.paidOnline ? 'Paid online' : order.paymentMethod === 'wallet' ? 'Paid from wallet' : 'Cash on delivery'}</Text>
        {order.deliveryCashback > 0 && order.status !== 'cancelled' && (
          <Text style={st.cashback}>{order.deliveryCashbackPaid ? `${money(order.deliveryCashback)} order cashback added to your wallet` : `${money(order.deliveryCashback)} order cashback after delivery`}</Text>
        )}
      </Card>

      {order.address && (
        <Card style={{ gap: 4 }}>
          <Text style={st.cardTitle}>Delivering to</Text>
          <Text style={st.muted}>{order.address.label ? `${order.address.label}: ` : ''}{addressLine(order.address)}</Text>
          {order.note ? <Text style={st.muted}>Note: {order.note}</Text> : null}
        </Card>
      )}

      {order.status === 'placed' && <Button title="Cancel order" kind="outline" onPress={cancel} busy={cancelling} />}
      <Button title="Invoice" kind="outline" onPress={openInvoice} busy={openingInvoice} />
      {order.canRequestRefund && <Button title="Request a refund" kind="outline" onPress={askRefund} />}
      <Button title={`Need help? Call ${SUPPORT_PHONE}`} kind="outline" onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  orderNo: { fontSize: 16, fontWeight: '800', color: C.ink },
  muted: { color: C.muted, fontSize: 13.5 },
  items: { color: C.ink, fontSize: 14, flexShrink: 1 },
  total: { fontSize: 16, fontWeight: '800', color: C.ink },
  link: { color: C.red, fontWeight: '700', fontSize: 13.5 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  sep: { height: 1, backgroundColor: C.line, marginVertical: 4 },
  cashback: { color: C.green, fontWeight: '600', fontSize: 13 },
  placed: { backgroundColor: C.greenSoft, borderRadius: R.md, padding: 14, gap: 4 },
  placedTitle: { color: C.green, fontSize: 18, fontWeight: '800' },
  placedText: { color: C.ink, fontSize: 13.5 },
  step: { flexDirection: 'row', gap: 12 },
  dot: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#D5D5D5', alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  dotOn: { backgroundColor: C.green, borderColor: C.green },
  bar: { width: 2, flex: 1, backgroundColor: '#E0E0E0', minHeight: 18 },
  barOn: { backgroundColor: C.green },
  stepTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  riderRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  riderBody: { flex: 1, minWidth: 0 },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.redSoft },
  avatarText: { color: C.red, fontSize: 19, fontWeight: '800' },
  riderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 24 },
  riderLabel: { color: C.muted, fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, flexShrink: 0 },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontSize: 12.5, fontWeight: '700' },
  riderName: { fontSize: 17, fontWeight: '800', color: C.ink, marginTop: 1 },
  riderText: { fontSize: 14.5, color: '#444', marginTop: 2, lineHeight: 20 },
  etaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', columnGap: 8, marginTop: 8 },
  etaText: { fontSize: 16, fontWeight: '800', color: C.green },
  etaBy: { fontSize: 13.5, color: C.muted },
});
