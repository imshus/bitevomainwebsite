// The red "View cart" bar along the bottom while the cart has something in it.
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useCart } from '../state/cart';
import { money } from '../lib/format';
import { C, shadow } from '../theme';
import { Bag, ChevronRight } from './Icons';

export default function CartBar() {
  const cart = useCart();
  const navigation = useNavigation();
  if (!cart.count) return null;
  return (
    <Pressable onPress={() => navigation.navigate('Checkout')} style={({ pressed }) => [st.bar, pressed && { opacity: 0.9 }]} accessibilityRole="button">
      <View style={st.icon}><Bag size={20} color={C.white} /></View>
      <View style={{ flex: 1 }}>
        <Text style={st.count}>{cart.count} item{cart.count === 1 ? '' : 's'} | {money(cart.itemTotal)}</Text>
        <Text style={st.sub}>Extra charges may apply</Text>
      </View>
      <Text style={st.view}>View cart</Text>
      <ChevronRight size={18} color={C.white} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  bar: { position: 'absolute', left: 12, right: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.red, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 12, ...shadow, shadowOpacity: 0.25 },
  icon: { width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,.18)', alignItems: 'center', justifyContent: 'center' },
  count: { color: C.white, fontSize: 15, fontWeight: '800' },
  sub: { color: 'rgba(255,255,255,.8)', fontSize: 11.5 },
  view: { color: C.white, fontSize: 15, fontWeight: '800' },
});
