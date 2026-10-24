// The menu, the app's home: a red header with where we're delivering (or "Service unavailable"), search and
// a veg switch, the offer banners, the five tabs, then the dishes. "All" shows each section as a sideways
// row; a tab shows its dishes two per row.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMenu, useConfig } from '../state/data';
import { useCart } from '../state/cart';
import { useAuth } from '../state/auth';
import { useChosenAddress } from '../state/address';
import { TABS, FEED_ORDER, tabOf, matches, availableFirst } from '../lib/menuTabs';
import { deliversTo, whereWeDeliver } from '../lib/deliveryArea';
import { addressLine } from '../lib/format';
import { DELIVERY_MINS } from '../config';
import { DishCard, DishTile } from '../components/Dish';
import CartBar from '../components/CartBar';
import { Loading, LoadError } from '../components/ui';
import { Alert, ChevronDown, ChevronRight, Search } from '../components/Icons';
import { C, R, shadow } from '../theme';

const BANNERS = [
  { key: 'first', source: require('../assets/offer-first-order-800.webp'), alt: 'First order? Free cold coffee on orders above ₹99, plus free delivery.' },
  { key: 'rewards', source: require('../assets/offer-rewards-800.webp'), alt: 'Order more, save more: signup bonus, cashback on delivery, referral cashback and more.' },
];

function Banners() {
  const width = Dimensions.get('window').width - 32;
  const [active, setActive] = useState(0);
  return (
    <View style={{ marginTop: 14 }}>
      <ScrollView
        horizontal pagingEnabled showsHorizontalScrollIndicator={false} snapToInterval={width + 10} decelerationRate="fast"
        contentContainerStyle={{ paddingHorizontal: 16, gap: 10 }}
        onMomentumScrollEnd={e => setActive(Math.round(e.nativeEvent.contentOffset.x / (width + 10)))}
      >
        {BANNERS.map(b => (
          <Image key={b.key} source={b.source} accessibilityLabel={b.alt} style={{ width, height: width * 0.375, borderRadius: R.md }} resizeMode="cover" />
        ))}
      </ScrollView>
      <View style={st.dots}>{BANNERS.map((b, i) => <View key={b.key} style={[st.dot, i === active && st.dotOn]} />)}</View>
    </View>
  );
}

function Tabs({ active, onChoose }) {
  return (
    <View style={st.tabs}>
      {TABS.map(t => {
        const on = active === t.key;
        return (
          <Pressable key={t.key} onPress={() => onChoose(t.key)} style={st.tab} accessibilityRole="tab" accessibilityState={{ selected: on }}>
            <View style={[st.tabIcon, on && st.tabIconOn]}>
              {t.icon ? <Image source={t.icon} style={{ width: '74%', height: '74%' }} resizeMode="contain" /> : <View style={st.grid}>{[0, 1, 2, 3].map(i => <View key={i} style={st.gridCell} />)}</View>}
            </View>
            <Text style={[st.tabLabel, on && st.tabLabelOn]} numberOfLines={2}>{t.label}</Text>
            {on && <View style={st.tabLine} />}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function MenuScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { data: menu, error, loading, reload } = useMenu();
  const { data: config } = useConfig();
  const { customer } = useAuth();
  const [address] = useChosenAddress();
  const cart = useCart();
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);
  const list = useRef(null);

  // Keep the cart's names and prices in step with the menu.
  useEffect(() => { if (menu) cart.syncWithMenu(menu.products); }, [menu]); // eslint-disable-line react-hooks/exhaustive-deps

  const dishes = useMemo(() => {
    if (!menu) return [];
    const labels = new Map(menu.categories.map(c => [c.key, c.label]));
    return menu.products.map(p => ({ ...p, tab: tabOf(p, labels.get(p.category) || '') }));
  }, [menu]);
  const shown = dishes.filter(p => matches(p, { vegOnly }, query));
  const searching = query.trim().length > 0;

  // "All": recommended tiles, then a sideways row per section. A tab (or a search): two per row.
  const sections = tab === 'all' && !searching
    ? FEED_ORDER.map(key => ({ key, title: TABS.find(t => t.key === key).title, items: availableFirst(shown.filter(p => p.tab === key)) })).filter(s => s.items.length)
    : [];
  const recommended = tab === 'all' && !searching ? shown.filter(p => p.isAvailable && p.isBestseller).slice(0, 10) : [];
  const gridItems = tab === 'all' && !searching ? [] : availableFirst(tab === 'all' ? shown : shown.filter(p => p.tab === tab));
  const rows = [];
  for (let i = 0; i < gridItems.length; i += 2) rows.push(gridItems.slice(i, i + 2));

  const choose = key => { setTab(key); list.current?.scrollToOffset({ offset: 0, animated: false }); };
  const served = !address || deliversTo(address, config);
  const pickAddress = () => navigation.navigate(customer?.name ? 'Addresses' : 'SignIn');

  const header = (
    <View>
      {!served && (
        <View style={st.unserved}>
          <View style={st.unservedIcon}><Alert size={20} color={C.red} /></View>
          <View style={{ flex: 1 }}>
            <Text style={st.unservedTitle}>Service unavailable at this location</Text>
            <Text style={st.unservedText}>{whereWeDeliver(config)}</Text>
          </View>
          <Pressable onPress={pickAddress} style={st.unservedBtn}><Text style={st.unservedBtnText}>Change</Text></Pressable>
        </View>
      )}
      {!searching && <Banners />}
      <View style={st.tabsWrap}><Tabs active={tab} onChoose={choose} /></View>
      {recommended.length > 0 && (
        <View style={st.section}>
          <Text style={st.sectionTitle}>Recommended for you</Text>
          <FlatList horizontal data={recommended} keyExtractor={p => p._id} renderItem={({ item }) => <DishTile product={item} />} showsHorizontalScrollIndicator={false} contentContainerStyle={st.rail} />
        </View>
      )}
      {(tab !== 'all' || searching) && (
        <Text style={[st.sectionTitle, { marginHorizontal: 16, marginTop: 18 }]}>
          {searching ? `Results for “${query.trim()}”` : TABS.find(t => t.key === tab).title}  <Text style={st.count}>{gridItems.length}</Text>
        </Text>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[st.head, { paddingTop: insets.top + 10 }]}>
        <View style={st.headTop}>
          <View style={st.eta}>
            {served ? <><Text style={st.etaNum}>{DELIVERY_MINS}</Text><Text style={st.etaUnit}>MINS</Text></> : <><Text style={st.etaNum}>✕</Text><Text style={st.etaUnit}>N/A</Text></>}
          </View>
          <Pressable onPress={pickAddress} style={{ flex: 1 }} accessibilityLabel="Change delivery address">
            {address ? (
              <Text style={st.where} numberOfLines={2}><Text style={st.whereTag}>{address.label.toUpperCase()} - </Text>{addressLine(address)}</Text>
            ) : (
              <>
                <View style={st.whereRow}><Text style={st.whereTag}>SELECT LOCATION</Text><ChevronDown size={16} color={C.white} /></View>
                <Text style={st.whereHint}>{customer ? 'Add your delivery address' : 'Sign in to choose where we deliver'}</Text>
              </>
            )}
          </Pressable>
        </View>
        <View style={st.headRow}>
          <View style={st.search}>
            <Search size={20} color={C.ink} />
            <TextInput
              value={query} onChangeText={setQuery} placeholder="Search “Biryani”, “Fries”…" placeholderTextColor={C.faint}
              style={st.searchInput} returnKeyType="search" accessibilityLabel="Search dishes"
            />
          </View>
          <View style={st.veg}>
            <Text style={st.vegLabel}>VEG</Text>
            <Switch value={vegOnly} onValueChange={setVegOnly} trackColor={{ true: C.green, false: '#D9D9D9' }} thumbColor={C.white} accessibilityLabel="Show veg dishes only" />
          </View>
        </View>
      </View>

      {!menu && loading ? <Loading label="Loading the menu…" /> : !menu && error ? <LoadError error={error} onRetry={reload} /> : (
        <FlatList
          ref={list}
          data={tab === 'all' && !searching ? sections : rows}
          keyExtractor={(item, i) => (Array.isArray(item) ? item.map(p => p._id).join('-') : item.key) || String(i)}
          ListHeaderComponent={header}
          refreshControl={<RefreshControl refreshing={loading && Boolean(menu)} onRefresh={reload} colors={[C.red]} />}
          contentContainerStyle={{ paddingBottom: cart.count ? 96 : 28 }}
          renderItem={({ item }) => (Array.isArray(item) ? (
            <View style={st.row}>
              {item.map(p => <DishCard key={p._id} product={p} />)}
              {item.length === 1 && <View style={{ flex: 1 }} />}
            </View>
          ) : (
            <View style={st.section}>
              <View style={st.sectionHead}>
                <Text style={[st.sectionTitle, { marginHorizontal: 0 }]}>{item.title}</Text>
                <Pressable onPress={() => choose(item.key)} style={st.seeAll} hitSlop={8}><Text style={st.seeAllText}>See all</Text><ChevronRight size={16} color={C.ink} /></Pressable>
              </View>
              <FlatList horizontal data={item.items} keyExtractor={p => p._id} renderItem={({ item: p }) => <DishTile product={p} />} showsHorizontalScrollIndicator={false} contentContainerStyle={st.rail} />
            </View>
          ))}
          ListEmptyComponent={<Text style={[st.unservedText, { textAlign: 'center', marginTop: 30 }]}>{searching ? 'No dishes match your search.' : 'No dishes here right now.'}</Text>}
        />
      )}
      <CartBar />
    </View>
  );
}

const st = StyleSheet.create({
  head: { backgroundColor: C.red, paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  headTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  eta: { width: 56, height: 56, borderRadius: 14, borderWidth: 1.5, borderColor: 'rgba(255,255,255,.55)', alignItems: 'center', justifyContent: 'center' },
  etaNum: { color: C.white, fontSize: 22, fontWeight: '800', fontStyle: 'italic' },
  etaUnit: { color: C.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  where: { color: 'rgba(255,255,255,.9)', fontSize: 15, lineHeight: 20 },
  whereTag: { color: C.white, fontWeight: '800', fontSize: 15 },
  whereRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  whereHint: { color: 'rgba(255,255,255,.75)', fontSize: 13 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  search: { flex: 1, height: 48, borderRadius: 14, backgroundColor: C.white, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, gap: 8, borderWidth: 2, borderColor: '#3B0909' },
  searchInput: { flex: 1, fontSize: 15, color: C.ink, paddingVertical: 0 },
  veg: { height: 48, borderRadius: 14, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, borderWidth: 2, borderColor: '#3B0909' },
  vegLabel: { fontSize: 10, fontWeight: '800', color: C.ink, marginBottom: -6 },
  unserved: { flexDirection: 'row', alignItems: 'center', gap: 10, margin: 16, marginBottom: 0, padding: 12, borderRadius: R.md, backgroundColor: C.white, borderWidth: 1, borderColor: '#F3C9C9' },
  unservedIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' },
  unservedTitle: { color: C.red, fontWeight: '800', fontSize: 14.5 },
  unservedText: { color: C.muted, fontSize: 12.5, marginTop: 2 },
  unservedBtn: { borderWidth: 1.5, borderColor: C.red, borderRadius: 10, paddingHorizontal: 12, height: 34, justifyContent: 'center' },
  unservedBtnText: { color: C.red, fontWeight: '800', fontSize: 13 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#D8CFCF' },
  dotOn: { width: 20, backgroundColor: C.red },
  tabsWrap: { marginTop: 14, backgroundColor: C.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 14, ...shadow, shadowOpacity: 0.06 },
  tabs: { flexDirection: 'row', paddingHorizontal: 8 },
  tab: { flex: 1, alignItems: 'center', gap: 6, paddingBottom: 10 },
  tabIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#F7F2EF', alignItems: 'center', justifyContent: 'center' },
  tabIconOn: { backgroundColor: C.redSoft, borderWidth: 2, borderColor: C.red },
  grid: { width: 24, height: 24, flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  gridCell: { width: 10.5, height: 10.5, borderRadius: 3, backgroundColor: C.red },
  tabLabel: { fontSize: 12, fontWeight: '600', color: '#555', textAlign: 'center' },
  tabLabelOn: { color: C.red, fontWeight: '800' },
  tabLine: { position: 'absolute', bottom: 0, height: 3, width: '50%', borderRadius: 3, backgroundColor: C.red },
  section: { marginTop: 20 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginHorizontal: 16 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: C.ink, marginHorizontal: 16 },
  count: { fontSize: 13, color: C.muted, fontWeight: '600' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 14, fontWeight: '700', color: C.ink },
  rail: { paddingHorizontal: 16, gap: 12, paddingTop: 10, paddingBottom: 4 },
  row: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 10 },
});
