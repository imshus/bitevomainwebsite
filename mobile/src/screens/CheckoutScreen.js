// Checkout: the cart, where to deliver (with "Service unavailable" outside the delivery area), offers and the
// wallet, a note for the kitchen, then the bill the server works out and "Place order". In this first version
// of the app orders are paid by cash on delivery (or fully from the wallet); paying online comes next.
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../api';
import { useAuth } from '../state/auth';
import { useCart } from '../state/cart';
import { useConfig } from '../state/data';
import { useChosenAddress } from '../state/address';
import { addressLine, money, offerHeadline } from '../lib/format';
import { deliversTo, whereWeDeliver } from '../lib/deliveryArea';
import { Button, Card, Empty, VegMark } from '../components/ui';
import { Bag, ChevronRight, MapPin, Receipt, Tag, Wallet } from '../components/Icons';
import { C, R } from '../theme';

// The bill from the server, worked out again a moment after anything changes; late answers are ignored.
function useQuote(cart, useWallet, customerId) {
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState(null);
  const seq = useRef(0);
  const items = cart.lines.map(l => ({ productId: l.productId, qty: l.qty }));
  const key = JSON.stringify([items, cart.coupon, useWallet, customerId]);
  const refresh = () => {
    const n = ++seq.current;
    if (!items.length) { setQuote(null); return; }
    api.quote({ items, couponCode: cart.coupon, useWallet }).then(
      q => { if (n === seq.current) { setQuote(q); setError(null); } },
      err => { if (n === seq.current) setError(err); },
    );
  };
  useEffect(() => {
    const t = setTimeout(refresh, 150);
    return () => clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return { quote, setQuote, error, refresh };
}

function Line({ line }) {
  const cart = useCart();
  return (
    <View style={st.line}>
      <VegMark veg={line.isVeg} />
      <Text style={st.lineName} numberOfLines={2}>{line.name}</Text>
      <View style={st.miniStepper}>
        <Pressable onPress={() => cart.setQty(line.productId, line.qty - 1)} hitSlop={8} style={st.miniBtn}><Text style={st.miniText}>−</Text></Pressable>
        <Text style={st.miniQty}>{line.qty}</Text>
        <Pressable onPress={() => cart.setQty(line.productId, line.qty + 1)} hitSlop={8} style={st.miniBtn}><Text style={st.miniText}>+</Text></Pressable>
      </View>
      <Text style={st.linePrice}>{money(line.price * line.qty)}</Text>
    </View>
  );
}

export default function CheckoutScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { customer, setCustomer } = useAuth();
  const cart = useCart();
  const { data: config } = useConfig();
  const [address] = useChosenAddress();
  const [useWallet, setUseWallet] = useState(false);
  const [code, setCode] = useState('');
  const [note, setNote] = useState('');
  const [noCutlery, setNoCutlery] = useState(false);
  const [deliveryPhone, setDeliveryPhone] = useState('');
  const [offers, setOffers] = useState([]);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState('');
  const signedIn = Boolean(customer?.name);
  const needsPhone = signedIn && !customer.phone;
  const phoneOk = /^[6-9]\d{9}$/.test(deliveryPhone.replace(/\D/g, ''));
  const { quote, setQuote, error: quoteError, refresh } = useQuote(cart, useWallet, signedIn ? customer._id : null);
  const served = !address || deliversTo(address, config);

  useEffect(() => { api.offers().then(setOffers, () => setOffers([])); }, [customer?._id]);
  useEffect(() => {
    if (customer?.deliveryPhone) setDeliveryPhone(p => p || customer.deliveryPhone.replace(/^\+91\s*/, ''));
  }, [customer?.deliveryPhone]);

  if (!cart.lines.length) {
    return (
      <Empty icon={<Bag size={46} color={C.red} />} title="Your cart is empty" text="Add a few dishes from the menu and they’ll show up here.">
        <Button title="Browse the menu" onPress={() => navigation.navigate('Tabs', { screen: 'Menu' })} />
      </Empty>
    );
  }

  const applyCode = c => {
    const value = (c ?? code).trim().toUpperCase();
    if (!value) return;
    if (!signedIn) { navigation.navigate('SignIn'); return; }
    cart.setCoupon(value);
    setCode('');
  };

  const place = async () => {
    setPlaceError('');
    if (!signedIn) { navigation.navigate('SignIn'); return; }
    if (!address) { navigation.navigate('AddressForm'); return; }
    if (!served) { navigation.navigate('Addresses'); return; }
    if (needsPhone && !phoneOk) { setPlaceError('Add a 10-digit mobile number for delivery.'); return; }
    setPlacing(true);
    try {
      const order = await api.placeOrder({
        items: cart.lines.map(l => ({ productId: l.productId, qty: l.qty })),
        addressId: address._id, couponCode: cart.coupon, useWallet, expectedTotal: quote?.total,
        note: [note.trim(), noCutlery && 'No cutlery please'].filter(Boolean).join(' · ').slice(0, 200),
        ...(needsPhone && { deliveryPhone: deliveryPhone.replace(/\D/g, '') }),
      });
      cart.clear();
      if (needsPhone) api.me().then(setCustomer, () => {}); // picks up the saved delivery number
      navigation.replace('OrderDetail', { id: order._id, justPlaced: true });
    } catch (err) {
      if (err.data?.quote) setQuote(err.data.quote);
      else refresh();
      setPlaceError(err.message);
      setPlacing(false);
    }
  };

  const blocker = !served ? `Service unavailable at this address. ${whereWeDeliver(config)}`
    : !quote ? null
    : quote.unavailable.length ? 'Remove the dishes that are no longer available.'
    : quote.couponError ? 'Remove the offer, or update your cart to use it.'
    : quote.storeItem?.error ? quote.storeItem.error
    : quote.itemTotal < quote.minOrderValue ? `The minimum order is ${money(quote.minOrderValue)}.`
    : null;
  const action = !signedIn ? { label: 'Sign in to order', run: () => navigation.navigate('SignIn') }
    : !address ? { label: 'Add delivery address', run: () => navigation.navigate('AddressForm') }
    : !served ? { label: 'Change address', run: () => navigation.navigate('Addresses') }
    : { label: quote ? `Place order · ${money(quote.payable)}` : 'Place order', run: place };
  const actionDisabled = signedIn && address && served ? placing || !quote || Boolean(blocker) : false;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <ScrollView contentContainerStyle={{ padding: 14, gap: 12, paddingBottom: 130 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={st.strip}><Text style={st.stripText}><Text style={st.bold}>₹0</Text> Packaging fee  ·  <Text style={st.bold}>₹0</Text> Platform fee</Text></View>

        <Card style={{ gap: 12 }}>
          {cart.lines.map(l => <Line key={l.productId} line={l} />)}
          {quote?.unavailable?.length > 0 && <Text style={st.warn}>{quote.unavailable.map(u => u.name).join(', ')} {quote.unavailable.length > 1 ? 'are' : 'is'} no longer available.</Text>}
          <Pressable onPress={() => navigation.navigate('Tabs', { screen: 'Menu' })}><Text style={st.link}>+ Add more items</Text></Pressable>
          <TextInput value={note} onChangeText={setNote} placeholder="Cooking requests (e.g. less spicy)" placeholderTextColor={C.faint} style={st.input} maxLength={150} />
          <View style={st.switchRow}>
            <Text style={st.switchText}>Don’t send cutlery</Text>
            <Switch value={noCutlery} onValueChange={setNoCutlery} trackColor={{ true: C.green, false: '#D9D9D9' }} thumbColor={C.white} />
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={st.cardHead}><Tag size={20} color={C.red} /><Text style={st.cardTitle}>Offers & benefits</Text></View>
          {(quote?.offers || []).map(o => <Text key={o.key} style={st.perk}>✓ {o.text}</Text>)}
          {quote?.coupon?.code ? (
            <View style={st.applied}>
              <Text style={st.appliedText}>{quote.coupon.code} applied{quote.discount > 0 ? ` · you save ${money(quote.discount)}` : ''}</Text>
              <Pressable onPress={() => cart.setCoupon('')}><Text style={st.link}>Remove</Text></Pressable>
            </View>
          ) : (
            <View style={st.codeRow}>
              <TextInput value={code} onChangeText={v => setCode(v.toUpperCase())} placeholder="Enter a coupon code" placeholderTextColor={C.faint} autoCapitalize="characters" style={[st.input, { flex: 1 }]} />
              <Button title="Apply" small kind="outline" onPress={() => applyCode()} disabled={!code.trim()} />
            </View>
          )}
          {quote?.couponError ? <Text style={st.warn}>{quote.couponError}</Text> : null}
          {!quote?.coupon?.code && offers.slice(0, 4).map(o => (
            <Pressable key={o.code} onPress={() => applyCode(o.code)} style={st.offer}>
              <View style={{ flex: 1 }}>
                <Text style={st.offerHead}>{offerHeadline(o)}</Text>
                <Text style={st.offerText} numberOfLines={2}>{o.description || `Use code ${o.code}`}{o.minOrderValue ? ` · on orders above ${money(o.minOrderValue)}` : ''}</Text>
              </View>
              <Text style={st.offerCode}>{o.code}</Text>
            </Pressable>
          ))}
          {signedIn && quote?.walletBalance > 0 && (
            <View style={st.switchRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <Wallet size={20} color={C.green} />
                <Text style={st.switchText}>Use wallet ({money(quote.walletBalance)})</Text>
              </View>
              <Switch value={useWallet} onValueChange={setUseWallet} trackColor={{ true: C.green, false: '#D9D9D9' }} thumbColor={C.white} />
            </View>
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={st.cardHead}><MapPin size={20} color={C.red} /><Text style={st.cardTitle}>Delivery details</Text></View>
          {!signedIn ? (
            <>
              <Text style={st.muted}>Sign in to choose an address and place the order.</Text>
              <Button title={customer ? 'Add your name' : 'Sign in'} small onPress={() => navigation.navigate('SignIn')} />
            </>
          ) : (
            <>
              <Pressable onPress={() => navigation.navigate(address ? 'Addresses' : 'AddressForm')} style={st.addressRow}>
                <View style={{ flex: 1 }}>
                  <Text style={st.addressTitle}>{address ? `Deliver to ${address.label}` : 'Add a delivery address'}</Text>
                  <Text style={st.muted} numberOfLines={2}>{address ? addressLine(address) : 'We’ll need it to deliver your order'}</Text>
                  {!served && <Text style={st.off}>Service unavailable here. {whereWeDeliver(config)}</Text>}
                </View>
                <Text style={st.link}>{address ? 'Change' : 'Add'}</Text>
                <ChevronRight size={16} color={C.red} />
              </Pressable>
              <Text style={st.muted}>Ordering as <Text style={st.bold}>{customer.name}</Text> · {customer.phone || customer.email}</Text>
              {needsPhone && (
                <View style={{ gap: 6 }}>
                  <Text style={st.label}>Mobile number for delivery</Text>
                  <TextInput value={deliveryPhone} onChangeText={v => setDeliveryPhone(v.replace(/[^\d ]/g, '').slice(0, 11))} placeholder="98765 43210" placeholderTextColor={C.faint} keyboardType="number-pad" style={st.input} />
                </View>
              )}
            </>
          )}
        </Card>

        {quoteError ? <Text style={st.warn}>{quoteError.message}</Text> : null}
        {quote && (
          <Card style={{ gap: 8 }}>
            <View style={st.cardHead}><Receipt size={20} color={C.red} /><Text style={st.cardTitle}>Bill details</Text></View>
            <View style={st.billRow}><Text style={st.billLabel}>Item total</Text><Text style={st.billValue}>{money(quote.subtotal)}</Text></View>
            <View style={st.billRow}><Text style={st.billLabel}>Delivery fee</Text><Text style={[st.billValue, !quote.deliveryFee && { color: C.green }]}>{quote.deliveryFee ? money(quote.deliveryFee) : 'FREE'}</Text></View>
            {quote.deliveryNote ? <Text style={st.hint}>{quote.deliveryNote}</Text> : null}
            {quote.discount > 0 && <View style={st.billRow}><Text style={[st.billLabel, { color: C.green }]}>{quote.coupon?.code ? `Offer (${quote.coupon.code})` : 'Offers applied'}</Text><Text style={[st.billValue, { color: C.green }]}>−{money(quote.discount)}</Text></View>}
            {quote.walletUsed > 0 && <View style={st.billRow}><Text style={[st.billLabel, { color: C.green }]}>From wallet</Text><Text style={[st.billValue, { color: C.green }]}>−{money(quote.walletUsed)}</Text></View>}
            <View style={[st.billRow, st.total]}><Text style={st.totalText}>To pay</Text><Text style={st.totalText}>{money(quote.payable)}</Text></View>
            {(quote.cashback || 0) + (quote.deliveryCashback || 0) > 0 && (
              <Text style={st.cashback}>{money((quote.cashback || 0) + (quote.deliveryCashback || 0))} cashback will be added to your wallet after delivery</Text>
            )}
          </Card>
        )}
        <Text style={st.policy}><Text style={st.bold}>Cancellation policy:</Text> please double-check your order and address. You can cancel free of charge until the kitchen starts cooking.</Text>
      </ScrollView>

      <View style={[st.payBar, { paddingBottom: 12 + insets.bottom }]}>
        {(placeError || blocker) ? <Text style={st.payError}>{placeError || blocker}</Text> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View>
            <Text style={st.payLabel}>PAY USING</Text>
            <Text style={st.payWith}>{quote?.payable === 0 && quote?.walletUsed > 0 ? 'Wallet' : 'Cash on delivery'}</Text>
          </View>
          <Button title={action.label} onPress={action.run} disabled={actionDisabled} busy={placing} style={{ flex: 1 }} />
        </View>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  strip: { backgroundColor: C.greenSoft, borderRadius: R.sm, padding: 10, alignItems: 'center' },
  stripText: { color: C.green, fontSize: 13 },
  bold: { fontWeight: '800' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineName: { flex: 1, fontSize: 14.5, fontWeight: '600', color: C.ink },
  miniStepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#5DB15A', borderRadius: 9, height: 32 },
  miniBtn: { width: 28, alignItems: 'center' },
  miniText: { color: C.green, fontSize: 17, fontWeight: '800' },
  miniQty: { minWidth: 18, textAlign: 'center', color: C.green, fontWeight: '800' },
  linePrice: { width: 64, textAlign: 'right', fontWeight: '700', color: C.ink },
  link: { color: C.red, fontWeight: '700', fontSize: 14 },
  input: { borderWidth: 1.5, borderColor: '#E1E1E1', borderRadius: 10, height: 44, paddingHorizontal: 12, fontSize: 14.5, color: C.ink },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchText: { fontSize: 14.5, color: C.ink, fontWeight: '600' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  perk: { color: C.green, fontSize: 13.5, fontWeight: '600' },
  applied: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.greenSoft, borderRadius: 10, padding: 10 },
  appliedText: { color: C.green, fontWeight: '700', flex: 1 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  offer: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: '#E5B8B8', borderRadius: 10, padding: 10 },
  offerHead: { fontWeight: '800', color: C.ink, fontSize: 14 },
  offerText: { color: C.muted, fontSize: 12.5 },
  offerCode: { fontWeight: '800', color: C.red, fontSize: 13 },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  addressTitle: { fontSize: 15, fontWeight: '800', color: C.ink },
  muted: { color: C.muted, fontSize: 13.5 },
  off: { color: C.red, fontWeight: '700', fontSize: 13, marginTop: 4 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink },
  warn: { color: C.red, fontSize: 13.5 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between' },
  billLabel: { color: C.ink, fontSize: 14 },
  billValue: { color: C.ink, fontSize: 14, fontWeight: '600' },
  hint: { color: C.muted, fontSize: 12.5 },
  total: { borderTopWidth: 1, borderTopColor: C.line, paddingTop: 10, marginTop: 4 },
  totalText: { fontSize: 17, fontWeight: '800', color: C.ink },
  cashback: { color: C.green, fontSize: 13, fontWeight: '600' },
  policy: { color: C.muted, fontSize: 12.5, lineHeight: 18, paddingHorizontal: 4 },
  payBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: C.white, paddingHorizontal: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line, gap: 8 },
  payError: { color: C.red, fontSize: 13 },
  payLabel: { fontSize: 10.5, fontWeight: '800', color: C.muted, letterSpacing: 0.5 },
  payWith: { fontSize: 14, fontWeight: '800', color: C.ink },
});
