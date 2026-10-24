// Delivery addresses: the list to choose from (addresses outside the delivery area say "Service unavailable
// here") and the form to add or edit one. The server checks the delivery area again when saving.
import { useState } from 'react';
import { Alert as Confirm, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../state/auth';
import { useConfig } from '../state/data';
import { useChosenAddress } from '../state/address';
import { addressLine } from '../lib/format';
import { deliversTo, whereWeDeliver } from '../lib/deliveryArea';
import { Button, Empty } from '../components/ui';
import { MapPin } from '../components/Icons';
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
        <Button title="+ Add a new address" onPress={() => navigation.navigate('AddressForm')} />
      </Empty>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: C.bg }} contentContainerStyle={{ padding: 14, gap: 10 }}>
      {config?.delivery && <Text style={st.note}>{whereWeDeliver(config)}</Text>}
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

export function AddressFormScreen({ navigation, route }) {
  const editing = route.params?.address || null;
  const { setCustomer } = useAuth();
  const { data: config } = useConfig();
  const [, choose] = useChosenAddress();
  const zones = config?.zones || [];
  const [form, setForm] = useState(() => ({ label: 'Home', line1: '', line2: '', landmark: '', zone: zones[0] || '', pincode: '', ...editing }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = field => value => setForm(f => ({ ...f, [field]: value }));
  const served = deliversTo(form, config);
  const filled = form.line1.trim().length >= 5 && form.line2.trim() && form.zone;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const body = { label: form.label, line1: form.line1, line2: form.line2, landmark: form.landmark, zone: form.zone, pincode: form.pincode };
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
      <Text style={st.fieldLabel}>Save as</Text>
      <View style={st.chips}>
        {LABELS.map(l => (
          <Pressable key={l} onPress={() => set('label')(l)} style={[st.chip, form.label === l && st.chipOn]}><Text style={[st.chipText, form.label === l && st.chipTextOn]}>{l}</Text></Pressable>
        ))}
      </View>
      <Text style={st.fieldLabel}>House / flat no., building, street</Text>
      <TextInput value={form.line1} onChangeText={set('line1')} placeholder="e.g. Flat 302, Tower B, Palm Residency" placeholderTextColor={C.faint} style={st.input} maxLength={120} />
      <Text style={st.fieldLabel}>Sector and city</Text>
      <TextInput value={form.line2} onChangeText={set('line2')} placeholder="e.g. Sector 44, Gurugram" placeholderTextColor={C.faint} style={st.input} maxLength={120} />
      <Text style={st.fieldLabel}>Landmark (optional)</Text>
      <TextInput value={form.landmark} onChangeText={set('landmark')} placeholder="e.g. Near Huda Market" placeholderTextColor={C.faint} style={st.input} maxLength={80} />
      {zones.length > 0 && (
        <>
          <Text style={st.fieldLabel}>Delivery area</Text>
          <View style={st.chips}>
            {zones.map(z => (
              <Pressable key={z} onPress={() => set('zone')(z)} style={[st.chip, form.zone === z && st.chipOn]}><Text style={[st.chipText, form.zone === z && st.chipTextOn]}>{z}</Text></Pressable>
            ))}
          </View>
        </>
      )}
      <Text style={st.fieldLabel}>Pincode (optional)</Text>
      <TextInput value={form.pincode} onChangeText={v => set('pincode')(v.replace(/\D/g, '').slice(0, 6))} placeholder="122003" placeholderTextColor={C.faint} keyboardType="number-pad" style={st.input} />
      {filled && !served && <Text style={st.off}>Service unavailable at this address. {whereWeDeliver(config)}</Text>}
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
  input: { borderWidth: 1.5, borderColor: '#DADADA', borderRadius: 12, height: 50, paddingHorizontal: 14, fontSize: 15, color: C.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1.5, borderColor: '#DADADA', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  chipOn: { borderColor: C.red, backgroundColor: C.redSoft },
  chipText: { color: C.ink, fontWeight: '600' },
  chipTextOn: { color: C.red, fontWeight: '800' },
  error: { color: C.red, fontSize: 14 },
});
