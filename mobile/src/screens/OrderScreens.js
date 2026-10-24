// "My orders" and one order's page, which follows the order live (every 15 seconds) while it's on its way.
import { useCallback, useEffect, useState } from 'react';
import { Alert as Confirm, FlatList, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../state/auth';
import { addressLine, formatTime, formatWhen, itemsSummary, LIVE_STATUSES, money, ORDER_STATUS } from '../lib/format';
import { SUPPORT_PHONE } from '../config';
import { Button, Card, Empty, LoadError, Loading, Pill } from '../components/ui';
import { Check, Receipt } from '../components/Icons';
import { C, R } from '../theme';

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

export function OrderDetailScreen({ route }) {
  const { id, justPlaced } = route.params;
  const [order, setOrder] = useState(null);
  const [error, setError] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(() => api.order(id).then(o => { setOrder(o); setError(null); }, setError), [id]);
  useEffect(() => { load(); }, [load]);
  // While the order is live, check for news every 15 seconds.
  const live = order && LIVE_STATUSES.includes(order.status);
  useEffect(() => {
    if (!live) return undefined;
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [live, load]);

  if (!order) return error ? <LoadError error={error} onRetry={load} /> : <Loading />;

  const reached = STEPS.findIndex(s => s.status === order.status);
  const at = status => order.history?.find(h => h.status === status)?.at;
  const cancel = () => Confirm.alert('Cancel this order?', 'You can cancel until the kitchen starts cooking.', [
    { text: 'Keep it', style: 'cancel' },
    {
      text: 'Cancel order', style: 'destructive', onPress: async () => {
        setCancelling(true);
        try { setOrder(await api.cancelOrder(order._id)); } catch (err) { Confirm.alert('Couldn’t cancel', err.message); }
        setCancelling(false);
      },
    },
  ]);

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
});
