// Dish cards (two per row in a tab, smaller tiles in sideways rows), the ADD button that turns into a
// – 1 + stepper, and the sheet with a dish's details.
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../state/cart';
import { sized } from '../lib/photo';
import { money } from '../lib/format';
import { C, R, shadow } from '../theme';
import { Price, VegMark } from './ui';
import { Close } from './Icons';

export function AddButton({ product, wide }) {
  const cart = useCart();
  const qty = cart.qtyOf(product._id);
  if (!product.isAvailable) return <View style={[st.add, st.soldOut, wide && st.wide]}><Text style={st.soldOutText}>Sold out</Text></View>;
  if (!qty) {
    return (
      <Pressable onPress={() => cart.add(product)} style={({ pressed }) => [st.add, wide && st.wide, pressed && { backgroundColor: C.greenSoft }]} accessibilityLabel={`Add ${product.name}`}>
        <Text style={st.addText}>ADD +</Text>
      </Pressable>
    );
  }
  return (
    <View style={[st.stepper, wide && st.wide]}>
      <Pressable onPress={() => cart.setQty(product, qty - 1)} style={st.stepBtn} hitSlop={6} accessibilityLabel={`One less ${product.name}`}><Text style={st.stepText}>−</Text></Pressable>
      <Text style={st.stepQty}>{qty}</Text>
      <Pressable onPress={() => cart.setQty(product, qty + 1)} style={st.stepBtn} hitSlop={6} accessibilityLabel={`One more ${product.name}`}><Text style={st.stepText}>+</Text></Pressable>
    </View>
  );
}

const Photo = ({ product, w, h, style }) => (product.image
  ? <Image source={{ uri: sized(product.image, w, h) }} style={style} resizeMode="cover" />
  : <View style={[style, st.placeholder]}><Text style={st.placeholderText}>{product.name[0]}</Text></View>);

// Two per row: photo on top, then name, a short description, price and ADD.
export function DishCard({ product, style }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[st.card, !product.isAvailable && { opacity: 0.6 }, style]}>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel={`More about ${product.name}`}>
        <Photo product={product} w={400} h={300} style={st.cardImg} />
        {product.isBestseller && <Text style={st.badge}>BESTSELLER</Text>}
      </Pressable>
      <View style={st.cardBody}>
        <View style={st.metaRow}>
          <VegMark veg={product.isVeg} />
          {product.heading ? <Text style={st.tag} numberOfLines={1}>{product.heading}</Text> : null}
        </View>
        <Text style={st.name} numberOfLines={2} onPress={() => setOpen(true)}>{product.name}</Text>
        {product.description ? <Text style={st.desc} numberOfLines={2}>{product.description}</Text> : null}
        <View style={st.foot}>
          <View style={{ flex: 1 }}><Price price={product.price} mrp={product.mrp} /></View>
          <AddButton product={product} />
        </View>
      </View>
      {open && <DishSheet product={product} onClose={() => setOpen(false)} />}
    </View>
  );
}

// A small card for sideways rows ("Recommended for you").
export function DishTile({ product }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[st.tile, !product.isAvailable && { opacity: 0.6 }]}>
      <Pressable onPress={() => setOpen(true)}>
        <Photo product={product} w={320} h={240} style={st.tileImg} />
        {product.isBestseller && <Text style={st.badge}>BESTSELLER</Text>}
      </Pressable>
      <View style={{ padding: 10, gap: 6 }}>
        <Text style={st.tileName} numberOfLines={1}>{product.name}</Text>
        <View style={st.foot}>
          <Text style={st.tilePrice}>{money(product.price)}</Text>
          <AddButton product={product} />
        </View>
      </View>
      {open && <DishSheet product={product} onClose={() => setOpen(false)} />}
    </View>
  );
}

export function DishSheet({ product, onClose }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={st.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <View style={[st.sheet, { paddingBottom: 16 + insets.bottom }]}>
        <ScrollView bounces={false}>
          <Photo product={product} w={800} h={600} style={st.sheetImg} />
          <View style={{ padding: 18, gap: 8 }}>
            <View style={st.metaRow}>
              <VegMark veg={product.isVeg} />
              {product.isBestseller && <Text style={st.sheetTag}>Bestseller</Text>}
              {product.prepTimeMins ? <Text style={st.sheetMeta}>Ready in about {product.prepTimeMins} min</Text> : null}
            </View>
            <Text style={st.sheetName}>{product.name}</Text>
            {product.type === 'combo' && product.comboItems?.length > 0 && (
              <Text style={st.combo}>{product.comboItems.map(i => `${i.qty > 1 ? `${i.qty} × ` : ''}${i.name}`).join(' + ')}</Text>
            )}
            {product.description ? <Text style={st.sheetDesc}>{product.description}</Text> : null}
          </View>
        </ScrollView>
        <View style={st.sheetFoot}>
          <Price price={product.price} mrp={product.mrp} big />
          <AddButton product={product} wide />
        </View>
        <Pressable onPress={onClose} style={st.close} hitSlop={10} accessibilityLabel="Close"><Close size={20} color={C.ink} /></Pressable>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  add: { height: 34, minWidth: 70, paddingHorizontal: 10, borderRadius: 9, borderWidth: 1.5, borderColor: '#5DB15A', backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  addText: { color: C.green, fontWeight: '800', fontSize: 13 },
  wide: { minWidth: 120, height: 42 },
  soldOut: { borderColor: C.line },
  soldOutText: { color: C.faint, fontWeight: '700', fontSize: 12 },
  stepper: { height: 34, minWidth: 70, borderRadius: 9, backgroundColor: C.green, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  stepBtn: { width: 24, alignItems: 'center' },
  stepText: { color: C.white, fontSize: 18, fontWeight: '800' },
  stepQty: { color: C.white, fontSize: 14, fontWeight: '800' },
  placeholder: { backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center' },
  placeholderText: { fontSize: 34, fontWeight: '800', color: C.red },
  card: { flex: 1, backgroundColor: C.white, borderRadius: R.md, padding: 6, borderWidth: 1, borderColor: '#EBEBEB', ...shadow, shadowOpacity: 0.05 },
  cardImg: { width: '100%', aspectRatio: 4 / 3, borderRadius: 10, backgroundColor: C.redSoft },
  badge: { position: 'absolute', left: 6, top: 6, backgroundColor: C.white, color: C.red, fontSize: 9.5, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  cardBody: { paddingHorizontal: 4, paddingTop: 8, paddingBottom: 4, flex: 1, gap: 4 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tag: { flexShrink: 1, fontSize: 10, fontWeight: '700', color: C.red, backgroundColor: C.redSoft, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999, overflow: 'hidden' },
  name: { fontSize: 14, fontWeight: '700', color: C.ink, lineHeight: 18 },
  desc: { fontSize: 12, color: C.muted, lineHeight: 16 },
  foot: { marginTop: 'auto', paddingTop: 6, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6 },
  tile: { width: 156, backgroundColor: C.white, borderRadius: R.md, borderWidth: 1, borderColor: '#EBEBEB', overflow: 'hidden' },
  tileImg: { width: '100%', height: 110, backgroundColor: C.redSoft },
  tileName: { fontSize: 13.5, fontWeight: '700', color: C.ink },
  tilePrice: { fontSize: 14, fontWeight: '800', color: C.ink },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,.45)' },
  sheet: { maxHeight: '88%', backgroundColor: C.white, borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: 'hidden' },
  sheetImg: { width: '100%', aspectRatio: 4 / 3, backgroundColor: C.redSoft },
  sheetTag: { fontSize: 11, fontWeight: '800', color: C.red, backgroundColor: C.redSoft, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  sheetMeta: { fontSize: 12.5, color: C.muted },
  sheetName: { fontSize: 21, fontWeight: '800', color: C.ink },
  combo: { fontSize: 14, fontWeight: '600', color: C.ink },
  sheetDesc: { fontSize: 14.5, color: C.muted, lineHeight: 21 },
  sheetFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.line },
  close: { position: 'absolute', right: 14, top: 14, width: 36, height: 36, borderRadius: 18, backgroundColor: C.white, alignItems: 'center', justifyContent: 'center', ...shadow },
});
