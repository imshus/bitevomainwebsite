// Delivery addresses: the list to choose from (addresses outside the delivery area say "Service unavailable
// here") and the form to add or edit one, filled in from the phone's live location (lib/location.js) or typed by
// hand: anything filled in can be changed. The server checks the delivery area again when saving.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert as Confirm, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../state/auth';
import { useConfig } from '../state/data';
import { useChosenAddress } from '../state/address';
import { addressLine } from '../lib/format';
import { deliversTo, whereWeDeliver, areaOf } from '../lib/deliveryArea';
import { Button, Empty } from '../components/ui';
import { MapPin } from '../components/Icons';
import { locateHere } from '../state/here';
import { C, R } from '../theme';

export function AddressesScreen({ navigation }) {
  const { customer, setCustomer } = useAuth();
  const { data: config } = useConfig();
  const [chosen, choose] = useChosenAddress();
  const addresses = customer?.addresses || [];

  const remove = a => Confirm.alert('Delete this address?', `${a.label}: ${addressLine(a)}`, [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: () => api.deleteAddress(a._id).then(r => setCustomer(r.customer || r), err => Confirm.alert('Couldn’t delete it', err.message)) },
  ]);

  if (!addresses.length) {
    return (
      <Empty icon={<MapPin size={44} color={C.red} />} title="No saved addresses yet" text={config?.delivery ? whereWeDeliver(config) : 'Add where we should bring your food.'}>
        <Button title="Use my current location" onPress={() => navigation.navigate('AddressForm', { useLocation: true })} />
        <Button title="Type the address" kind="outline" onPress={() => navigation.navigate('AddressForm', { useLocation: false })} />
      </Empty>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 14, gap: 10 }}>
      {config?.delivery && <Text style={st.note}>{whereWeDeliver(config)}</Text>}
      <Pressable onPress={() => navigation.navigate('AddressForm', { useLocation: true })} style={st.here} accessibilityRole="button">
        <MapPin size={22} color={C.red} />
        <View style={{ flex: 1 }}>
          <Text style={st.hereTitle}>Use my current location</Text>
          <Text style={st.line}>Add the address where you are now</Text>
        </View>
      </Pressable>
      {addresses.map(a => {
        const on = chosen?._id === a._id;
        const served = deliversTo(a, config);
        return (
          <Pressable key={a._id} onPress={() => { choose(a._id); navigation.goBack(); }} style={[st.row, on && st.rowOn]} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <View style={[st.radio, on && st.radioOn]}>{on && <View style={st.radioDot} />}</View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={st.label}>{a.label}</Text>
              <Text style={st.line}>{addressLine(a)}</Text>
              {!served && <Text style={st.off}>Service unavailable here</Text>}
            </View>
            <View style={{ gap: 10, alignItems: 'flex-end' }}>
              <Pressable onPress={() => navigation.navigate('AddressForm', { address: a })} hitSlop={8}><Text style={st.link}>Edit</Text></Pressable>
              <Pressable onPress={() => remove(a)} hitSlop={8}><Text style={[st.link, { color: C.muted }]}>Delete</Text></Pressable>
            </View>
          </Pressable>
        );
      })}
      <Button title="+ Add a new address" kind="outline" onPress={() => navigation.navigate('AddressForm')} style={{ marginTop: 6 }} />
    </ScrollView>
  );
}

const LABELS = ['Home', 'Work', 'Other'];

// The form's fields for a saved address (the same as the website's form). Older addresses have two lines only
// ("Flat 302, Tower B" / "Sector 44, Gurugram"): the first is split at its first comma, and the sector is
// found in the text.
function fieldsOf(a, config) {
  const blank = { label: 'Home', house: '', building: '', area: '', city: '', landmark: '', pincode: '' };
  if (!a) return blank;
  const base = { ...blank, label: a.label || 'Home', landmark: a.landmark || '', pincode: a.pincode || '' };
  if (a.house) return { ...base, house: a.house, building: a.building || '', area: a.area || '', city: a.city || '' };
  const [first = '', ...rest] = (a.line1 || '').split(',');
  return { ...base, house: first.trim(), building: rest.join(',').trim(), area: areaOf(a, config, { anyCity: true }) };
}

// The address is saved as separate fields (see cleanAddress in backend/src/routes/account.js): the sector,
// picked from the delivery areas (the city is filled in), house / flat, building / street, landmark, pincode.
export function AddressFormScreen({ navigation, route }) {
  const editing = route.params?.address || null;
  const { setCustomer } = useAuth();
  const { data: config } = useConfig();
  const [, choose] = useChosenAddress();
  const rule = config?.delivery || null; // the delivery areas, e.g. Sector 40, 44 and 45 in Gurugram
  const [form, setForm] = useState(() => fieldsOf(editing, config));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // The live location: the spot saved with the address (for the rider) and what was found there.
  const [pin, setPin] = useState(editing?.lat != null ? { lat: editing.lat, lng: editing.lng } : null);
  const [loc, setLoc] = useState({ status: 'idle' }); // idle | locating | ok | error
  const set = field => value => setForm(f => ({ ...f, [field]: value }));

  // Fills the form from the address at the phone's location. On its own (opening the form) only empty fields are
  // filled; "Use my current location" also replaces the sector, city and pincode.
  const fillFromLocation = async replace => {
    setLoc({ status: 'locating' });
    const r = await locateHere();
    if (r.status !== 'ok') { setLoc({ status: 'error', message: r.error?.message || 'We couldn’t find your location. Please type your address.' }); return; }
    setPin({ lat: r.lat, lng: r.lng });
    const p = r.place;
    setLoc({ status: 'ok', place: p, accuracy: r.accuracy });
    if (!p) return;
    setForm(f => {
      const put = (field, value) => (value && (replace || !f[field]) ? value : f[field]);
      const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const area = rule
        ? rule.areas.find(a => norm(a) === norm(p.area) || norm(p.formatted).includes(norm(a))) || ''
        : p.area;
      return {
        ...f,
        area: put('area', area),
        city: rule ? f.city : put('city', p.city),
        building: f.building || p.name || p.street || '',
        pincode: put('pincode', p.pincode),
      };
    });
  };
  // A new address starts from where the phone is (unless "Type the address" was chosen).
  useEffect(() => {
    if (route.params?.useLocation ?? !editing) fillFromLocation(Boolean(route.params?.useLocation));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const filled = form.house.trim() && form.building.trim().length >= 3 && form.area.trim() && (rule || form.city.trim());

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {
        label: form.label, house: form.house, building: form.building, area: form.area,
        ...(!rule && { city: form.city }),
        landmark: form.landmark, pincode: form.pincode,
        // The spot the rider is taken to: the phone's location when it was used here, else the one saved before.
        ...(pin && { lat: pin.lat, lng: pin.lng }),
        ...(pin && editing?.mapAddress && pin.lat === editing.lat && pin.lng === editing.lng && { mapAddress: editing.mapAddress }),
      };
      const result = editing ? await api.updateAddress(editing._id, body) : await api.addAddress(body);
      setCustomer(result.customer);
      if (result.address?._id) choose(result.address._id);
      navigation.goBack();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: C.white }} contentContainerStyle={{ padding: 18, gap: 12 }} keyboardShouldPersistTaps="handled">
      {config?.delivery && <Text style={st.note}>{whereWeDeliver(config)}</Text>}

      {/* The live location: found, finding, or why not; the fields below can always be typed or changed. */}
      <View style={[st.locBox, loc.status === 'error' && st.locBoxErr]}>
        {loc.status === 'locating' ? (
          <View style={st.locRow}><ActivityIndicator color={C.red} /><Text style={st.locText}>Finding your current location…</Text></View>
        ) : loc.status === 'ok' ? (
          <>
            <View style={st.locRow}>
              <MapPin size={20} color={C.green} />
              <Text style={st.locText} numberOfLines={3}>
                <Text style={st.locStrong}>Current location: </Text>{loc.place?.formatted || 'found'}{loc.accuracy ? ` (accurate to about ${loc.accuracy} m)` : ''}
              </Text>
            </View>
            {loc.place?.check && loc.place.check.deliverable === false && <Text style={st.locWarn}>{loc.place.check.message || 'We don’t deliver here yet.'}</Text>}
            <Text style={st.locHint}>Filled in below. Add your flat number and change anything that isn’t right.</Text>
          </>
        ) : loc.status === 'error' ? (
          <Text style={st.locWarn}>{loc.message}</Text>
        ) : (
          <Text style={st.locHint}>{pin ? 'This address has a saved location for the rider.' : 'Fill in the address below, or use where you are now.'}</Text>
        )}
        {loc.status !== 'locating' && (
          <Pressable onPress={() => fillFromLocation(true)} style={st.locBtn} accessibilityRole="button">
            <MapPin size={16} color={C.red} />
            <Text style={st.locBtnText}>{loc.status === 'ok' ? 'Find my location again' : loc.status === 'error' ? 'Try again' : 'Use my current location'}</Text>
          </Pressable>
        )}
      </View>

      <Text style={st.fieldLabel}>Save as</Text>
      <View style={st.chips}>
        {LABELS.map(l => (
          <Pressable key={l} onPress={() => set('label')(l)} style={[st.chip, form.label === l && st.chipOn]}><Text style={[st.chipText, form.label === l && st.chipTextOn]}>{l}</Text></Pressable>
        ))}
      </View>
      {rule ? (
        <>
          <Text style={st.fieldLabel}>Sector <Text style={st.fieldHint}>in {rule.city}</Text></Text>
          <View style={st.chips} accessibilityRole="radiogroup">
            {rule.areas.map(a => (
              <Pressable key={a} onPress={() => set('area')(a)} accessibilityRole="radio" accessibilityState={{ checked: form.area === a }} style={[st.chip, form.area === a && st.chipOn]}>
                <Text style={[st.chipText, form.area === a && st.chipTextOn]}>{a}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <Text style={st.fieldLabel}>Area / sector</Text>
          <TextInput value={form.area} onChangeText={set('area')} placeholderTextColor={C.faint} style={st.input} maxLength={60} />
          <Text style={st.fieldLabel}>City</Text>
          <TextInput value={form.city} onChangeText={set('city')} placeholderTextColor={C.faint} style={st.input} maxLength={60} />
        </>
      )}
      <Text style={st.fieldLabel}>House / flat no. & floor</Text>
      <TextInput value={form.house} onChangeText={set('house')} placeholder="e.g. Flat 302, 3rd floor" placeholderTextColor={C.faint} style={st.input} maxLength={60} />
      <Text style={st.fieldLabel}>Building, society or street</Text>
      <TextInput value={form.building} onChangeText={set('building')} placeholder="e.g. Tower B, Palm Residency" placeholderTextColor={C.faint} style={st.input} maxLength={120} />
      <Text style={st.fieldLabel}>Landmark (optional)</Text>
      <TextInput value={form.landmark} onChangeText={set('landmark')} placeholder="e.g. Near Huda Market" placeholderTextColor={C.faint} style={st.input} maxLength={80} />
      <Text style={st.fieldLabel}>Pincode (optional)</Text>
      <TextInput value={form.pincode} onChangeText={v => set('pincode')(v.replace(/\D/g, '').slice(0, 6))} placeholder="122003" placeholderTextColor={C.faint} keyboardType="number-pad" style={st.input} />
      {error ? <Text style={st.error}>{error}</Text> : null}
      <Button title={editing ? 'Save changes' : 'Save address'} onPress={save} busy={busy} disabled={!filled} />
    </ScrollView>
  );
}

const st = StyleSheet.create({
  note: { backgroundColor: C.amberSoft, color: C.amber, padding: 10, borderRadius: R.sm, fontSize: 13, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: R.md, padding: 14, borderWidth: 1.5, borderColor: C.line },
  rowOn: { borderColor: C.red },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#BDBDBD', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: C.red },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.red },
  label: { fontSize: 15, fontWeight: '800', color: C.ink },
  line: { fontSize: 13.5, color: C.muted, lineHeight: 19 },
  off: { color: C.red, fontWeight: '700', fontSize: 13 },
  link: { color: C.red, fontWeight: '700', fontSize: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: C.ink },
  fieldHint: { fontWeight: '500', color: C.muted },
  input: { borderWidth: 1.5, borderColor: '#DADADA', borderRadius: 12, height: 50, paddingHorizontal: 14, fontSize: 15, color: C.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#DADADA', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: C.red, backgroundColor: C.redSoft },
  chipText: { color: C.ink, fontWeight: '600' },
  chipTextOn: { color: C.red, fontWeight: '800' },
  error: { color: C.red, fontSize: 14 },
  here: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.white, borderRadius: R.md, padding: 14, borderWidth: 1.5, borderColor: '#F2C4C4', borderStyle: 'dashed' },
  hereTitle: { fontSize: 15, fontWeight: '800', color: C.red },
  locBox: { backgroundColor: '#F6FBF7', borderRadius: R.md, padding: 12, gap: 8, borderWidth: 1, borderColor: '#D7EEDD' },
  locBoxErr: { backgroundColor: C.redSoft, borderColor: '#F2C4C4' },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locText: { flex: 1, fontSize: 13.5, color: C.ink, lineHeight: 19 },
  locStrong: { fontWeight: '800' },
  locHint: { fontSize: 12.5, color: C.muted },
  locWarn: { fontSize: 13, color: C.red, fontWeight: '600' },
  locBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
  locBtnText: { color: C.red, fontWeight: '800', fontSize: 14 },
});
