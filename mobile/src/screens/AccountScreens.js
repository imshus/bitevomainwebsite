// The wallet (balance and history) and the account screen (profile, addresses, help, sign out).
import { useCallback, useState } from 'react';
import { Alert as Confirm, FlatList, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { useAuth } from '../state/auth';
import { useConfig } from '../state/data';
import { formatWhen, money } from '../lib/format';
import { SITE_URL, SUPPORT_EMAIL, SUPPORT_PHONE } from '../config';
import { Button, Card, Empty, LoadError, Loading } from '../components/ui';
import { ChevronRight, Gift, Mail, MapPin, Phone, Receipt, User, Wallet } from '../components/Icons';
import { C, R } from '../theme';

export function WalletScreen({ navigation }) {
  const { customer } = useAuth();
  const { data: config } = useConfig();
  const [wallet, setWallet] = useState(null);
  const [error, setError] = useState(null);
  const load = useCallback(() => api.wallet().then(w => { setWallet(w); setError(null); }, setError), []);
  useFocusEffect(useCallback(() => { if (customer) load(); }, [customer, load]));

  if (!customer) {
    return (
      <Empty icon={<Wallet size={44} color={C.red} />} title="BiteVo wallet" text="Sign in to see your wallet coins: signup bonus, cashback and referral rewards.">
        <Button title="Sign in" onPress={() => navigation.navigate('SignIn')} />
      </Empty>
    );
  }
  if (!wallet) return error ? <LoadError error={error} onRetry={load} /> : <Loading />;
  const offers = config?.offers || {};
  return (
    <FlatList
      style={{ backgroundColor: C.bg }}
      contentContainerStyle={{ padding: 14, gap: 10 }}
      data={wallet.transactions}
      keyExtractor={t => t._id}
      ListHeaderComponent={(
        <View style={{ gap: 12, marginBottom: 4 }}>
          <View style={st.walletCard}>
            <Text style={st.walletLabel}>Wallet balance</Text>
            <Text style={st.walletAmount}>{money(wallet.balance)}</Text>
            <Text style={st.walletHint}>Use it at checkout on your next order.</Text>
          </View>
          <Card style={{ gap: 8 }}>
            <Text style={st.cardTitle}>Ways to earn</Text>
            {offers.deliveryCashback > 0 && <Text style={st.earn}>• {money(offers.deliveryCashback)} cashback on every delivered order</Text>}
            {offers.signupBonus > 0 && <Text style={st.earn}>• {money(offers.signupBonus)} signup bonus for every new account</Text>}
            {config?.referral && <Text style={st.earn}>• {money(config.referral.reward)} when a friend you invite completes {config.referral.ordersNeeded} orders</Text>}
          </Card>
          <Text style={st.cardTitle}>History</Text>
          {!wallet.transactions.length && <Text style={st.muted}>Nothing here yet.</Text>}
        </View>
      )}
      renderItem={({ item: t }) => (
        <View style={st.txn}>
          <View style={{ flex: 1 }}>
            <Text style={st.txnLabel}>{t.label}</Text>
            <Text style={st.muted} numberOfLines={1}>{t.note ? `${t.note} · ` : ''}{formatWhen(t.at)}</Text>
          </View>
          <Text style={[st.txnAmount, { color: t.amount > 0 ? C.green : C.red }]}>{t.amount > 0 ? '+' : '−'}{money(Math.abs(t.amount))}</Text>
        </View>
      )}
    />
  );
}

const Row = ({ icon, title, sub, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { backgroundColor: '#FAFAFA' }]}>
    <View style={st.rowIcon}>{icon}</View>
    <View style={{ flex: 1 }}>
      <Text style={st.rowTitle}>{title}</Text>
      {sub ? <Text style={st.muted} numberOfLines={1}>{sub}</Text> : null}
    </View>
    <ChevronRight size={18} color={C.faint} />
  </Pressable>
);

export function AccountScreen({ navigation }) {
  const { customer, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const open = path => Linking.openURL(`${SITE_URL}${path}`);

  const signOut = () => Confirm.alert('Sign out?', 'You can sign in again any time with your mobile number.', [
    { text: 'Stay signed in', style: 'cancel' },
    { text: 'Sign out', style: 'destructive', onPress: async () => { setSigningOut(true); await logout(); setSigningOut(false); } },
  ]);

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 14, gap: 12 }}>
      {customer?.name ? (
        <View style={st.profile}>
          <View style={st.avatar}><Text style={st.avatarText}>{customer.name.trim()[0]?.toUpperCase()}</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={st.name}>{customer.name}</Text>
            <Text style={st.muted}>{customer.phone || customer.email}</Text>
          </View>
        </View>
      ) : (
        <Card style={{ gap: 10 }}>
          <Text style={st.cardTitle}>Sign in to BiteVo</Text>
          <Text style={st.muted}>Order, follow your orders and collect wallet coins.</Text>
          <Button title={customer ? 'Add your name' : 'Sign in'} onPress={() => navigation.navigate('SignIn')} />
        </Card>
      )}

      <View style={st.group}>
        {customer?.name && <Row icon={<Receipt size={20} color={C.red} />} title="My orders" onPress={() => navigation.navigate('Orders')} />}
        {customer?.name && <Row icon={<MapPin size={20} color={C.red} />} title="Saved addresses" sub={`${customer.addresses?.length || 0} saved`} onPress={() => navigation.navigate('Addresses')} />}
        {customer?.name && <Row icon={<Wallet size={20} color={C.red} />} title="Wallet" onPress={() => navigation.navigate('Wallet')} />}
        <Row icon={<Gift size={20} color={C.red} />} title="Refer & earn" sub="Invite friends, earn wallet cashback" onPress={() => open('/refer')} />
      </View>

      <View style={st.group}>
        <Row icon={<Phone size={20} color={C.red} />} title="Call us" sub={SUPPORT_PHONE} onPress={() => Linking.openURL(`tel:${SUPPORT_PHONE.replace(/\s/g, '')}`)} />
        <Row icon={<Mail size={20} color={C.red} />} title="Email us" sub={SUPPORT_EMAIL} onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        <Row icon={<User size={20} color={C.red} />} title="About BiteVo" onPress={() => open('/about')} />
      </View>

      <View style={st.group}>
        <Row icon={<Receipt size={20} color={C.muted} />} title="Terms of service" onPress={() => open('/terms')} />
        <Row icon={<Receipt size={20} color={C.muted} />} title="Privacy policy" onPress={() => open('/privacy')} />
      </View>

      {customer && <Button title="Sign out" kind="outline" onPress={signOut} busy={signingOut} />}
      <Text style={[st.muted, { textAlign: 'center' }]}>BiteVo · Good food, better mood</Text>
    </ScrollView>
  );
}

const st = StyleSheet.create({
  muted: { color: C.muted, fontSize: 13.5 },
  cardTitle: { fontSize: 16, fontWeight: '800', color: C.ink },
  walletCard: { backgroundColor: C.red, borderRadius: R.lg, padding: 20, gap: 4 },
  walletLabel: { color: 'rgba(255,255,255,.85)', fontSize: 14, fontWeight: '600' },
  walletAmount: { color: C.white, fontSize: 36, fontWeight: '800' },
  walletHint: { color: 'rgba(255,255,255,.85)', fontSize: 13 },
  earn: { color: C.ink, fontSize: 14 },
  txn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.white, borderRadius: R.md, padding: 14, borderWidth: 1, borderColor: C.line },
  txnLabel: { fontSize: 15, fontWeight: '700', color: C.ink },
  txnAmount: { fontSize: 16, fontWeight: '800' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: C.white, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: C.line },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: C.white, fontSize: 22, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: C.ink },
  group: { backgroundColor: C.white, borderRadius: R.md, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#F2F2F2' },
  rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 15, fontWeight: '700', color: C.ink },
});
