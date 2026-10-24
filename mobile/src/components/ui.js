// Small building blocks shared by the screens.
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { C, R } from '../theme';
import { money } from '../lib/format';

export function Button({ title, onPress, kind = 'red', disabled, busy, style, small }) {
  const outline = kind === 'outline';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      android_ripple={{ color: outline ? C.redSoft : 'rgba(255,255,255,.2)' }}
      style={({ pressed }) => [
        s.btn, small && s.btnSmall, outline ? s.btnOutline : s.btnRed,
        (disabled || busy) && s.btnOff, pressed && { opacity: 0.85 }, style,
      ]}
    >
      {busy ? <ActivityIndicator color={outline ? C.red : C.white} /> : <Text style={[s.btnText, small && s.btnTextSmall, outline && { color: C.red }]}>{title}</Text>}
    </Pressable>
  );
}

// The green (veg) or red (non-veg) square with a dot, as on Indian menus.
export const VegMark = ({ veg }) => (
  <View style={[s.veg, { borderColor: veg ? C.green : '#C62828' }]} accessibilityLabel={veg ? 'Vegetarian' : 'Non-vegetarian'}>
    <View style={[s.vegDot, { backgroundColor: veg ? C.green : '#C62828' }]} />
  </View>
);

export function Price({ price, mrp, big }) {
  return (
    <View style={s.priceRow}>
      <Text style={[s.price, big && { fontSize: 20 }]}>{money(price)}</Text>
      {mrp > price && <Text style={s.mrp}>{money(mrp)}</Text>}
      {mrp > price && <Text style={s.off}>{Math.round(((mrp - price) / mrp) * 100)}% off</Text>}
    </View>
  );
}

export const Loading = ({ label = 'Loading…' }) => (
  <View style={s.center}><ActivityIndicator color={C.red} size="large" /><Text style={s.muted}>{label}</Text></View>
);

export const LoadError = ({ error, onRetry }) => (
  <View style={s.center}>
    <Text style={s.errorText}>{error?.message || 'Something went wrong.'}</Text>
    {onRetry && <Button title="Try again" kind="outline" small onPress={onRetry} />}
  </View>
);

export const Empty = ({ icon, title, text, children }) => (
  <View style={s.center}>
    {icon}
    <Text style={s.emptyTitle}>{title}</Text>
    {text ? <Text style={[s.muted, { textAlign: 'center' }]}>{text}</Text> : null}
    {children}
  </View>
);

export const Card = ({ children, style }) => <View style={[s.card, style]}>{children}</View>;

const TONES = { amber: [C.amberSoft, C.amber], blue: ['#E7F0FD', '#1A5FB4'], green: [C.greenSoft, C.green], grey: ['#F0F0F0', C.muted] };
export const Pill = ({ tone = 'grey', children }) => (
  <View style={[s.pill, { backgroundColor: TONES[tone][0] }]}><Text style={[s.pillText, { color: TONES[tone][1] }]}>{children}</Text></View>
);

export const s = StyleSheet.create({
  btn: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, overflow: 'hidden' },
  btnSmall: { height: 38, borderRadius: 10, paddingHorizontal: 14 },
  btnRed: { backgroundColor: C.red },
  btnOutline: { backgroundColor: C.white, borderWidth: 1.5, borderColor: C.red },
  btnOff: { opacity: 0.5 },
  btnText: { color: C.white, fontSize: 16, fontWeight: '700' },
  btnTextSmall: { fontSize: 14 },
  veg: { width: 16, height: 16, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: C.white },
  vegDot: { width: 7, height: 7, borderRadius: 4 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', columnGap: 6 },
  price: { fontSize: 16, fontWeight: '800', color: C.ink },
  mrp: { fontSize: 12, color: C.faint, textDecorationLine: 'line-through' },
  off: { fontSize: 11.5, fontWeight: '700', color: C.green },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  muted: { color: C.muted, fontSize: 14 },
  errorText: { color: C.red, fontSize: 15, textAlign: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: C.ink, marginTop: 6 },
  card: { backgroundColor: C.white, borderRadius: R.md, padding: 16, borderWidth: 1, borderColor: C.line },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
});
