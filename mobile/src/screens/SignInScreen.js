// Signing in, as on the website: a mobile number (or email address), the 6-digit code sent to it, then a
// name (and an optional referral code) for new accounts. Opens over the current screen and closes when done.
import { useEffect, useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../api';
import { useAuth } from '../state/auth';
import { useConfig } from '../state/data';
import { Button } from '../components/ui';
import { C } from '../theme';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SignInScreen({ navigation }) {
  const { customer: existing, setCustomer } = useAuth();
  const { data: config } = useConfig();
  // Signed in but without a name (closed the screen last time): straight to the name step.
  const [step, setStep] = useState(existing && !existing.name ? 'name' : 'phone'); // phone | email | code | name
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(null); // the API's answer: { phone } or { email }, with devCode and resendAfterSecs
  const [code, setCode] = useState('');
  const [name, setName] = useState(existing?.name || '');
  const [refCode, setRefCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [wait, setWait] = useState(0);
  const codeInput = useRef(null);

  useEffect(() => { setError(''); }, [step]);
  useEffect(() => {
    if (wait <= 0) return undefined;
    const t = setTimeout(() => setWait(w => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const run = async fn => {
    setBusy(true);
    setError('');
    try { await fn(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const sendCode = via => run(async () => {
    const result = via === 'email' ? await api.sendEmailCode(email.trim()) : await api.sendOtp(phone.replace(/\D/g, ''));
    setSent(result);
    setCode('');
    setWait(result.resendAfterSecs || 30);
    setStep('code');
  });

  const done = who => { setCustomer(who); navigation.goBack(); };

  const verify = c => run(async () => {
    try {
      const { customer, isNew } = sent.email ? await api.verifyEmailCode(sent.email, c) : await api.verifyOtp(sent.phone, c);
      if (customer.name && !(isNew && config?.referral)) done(customer);
      else { setCustomer(customer); setName(customer.name || ''); setStep('name'); }
    } catch (err) {
      setCode('');
      codeInput.current?.focus();
      throw err;
    }
  });

  const saveName = () => run(async () => {
    const refer = config?.referral ? refCode.trim() : '';
    if (refer) await api.referralLookup(refer).catch(() => { throw new Error('That referral code doesn’t exist. Check it, or leave it empty.'); });
    let saved = await api.updateMe({ name: name.trim() });
    if (refer) saved = (await api.applyReferral(refer).catch(() => null))?.customer || saved;
    done(saved);
  });

  const onCode = value => {
    const digits = value.replace(/\D/g, '').slice(0, 6);
    setCode(digits);
    if (digits.length === 6 && !busy) verify(digits);
  };

  const phoneOk = /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.white }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={st.wrap} keyboardShouldPersistTaps="handled">
        <Image source={require('../assets/logo-320.webp')} style={st.logo} resizeMode="contain" accessibilityLabel="BiteVo" />

        {step === 'phone' && (
          <View style={st.step}>
            <Text style={st.h}>Sign in to BiteVo</Text>
            <Text style={st.lead}>Enter your mobile number. We’ll send you a code on WhatsApp or SMS to sign in or create your account.</Text>
            <Text style={st.label}>Mobile number</Text>
            <View style={st.phone}>
              <Text style={st.cc}>+91</Text>
              <TextInput
                value={phone} onChangeText={v => setPhone(v.replace(/[^\d ]/g, '').slice(0, 11))} placeholder="98765 43210" placeholderTextColor={C.faint}
                keyboardType="number-pad" autoComplete="tel" textContentType="telephoneNumber" style={st.phoneInput} autoFocus
                onSubmitEditing={() => phoneOk && sendCode('phone')}
              />
            </View>
            {error ? <Text style={st.error}>{error}</Text> : null}
            <Button title="Send code" onPress={() => sendCode('phone')} disabled={!phoneOk} busy={busy} />
            {config?.emailLogin && <Button title="Sign in with email instead" kind="outline" onPress={() => setStep('email')} />}
          </View>
        )}

        {step === 'email' && (
          <View style={st.step}>
            <Text style={st.h}>Sign in with email</Text>
            <Text style={st.lead}>We’ll email you a 6-digit code to sign in or create your account.</Text>
            <TextInput
              value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={C.faint} autoFocus
              keyboardType="email-address" autoCapitalize="none" autoComplete="email" style={st.input}
              onSubmitEditing={() => EMAIL.test(email.trim()) && sendCode('email')}
            />
            {error ? <Text style={st.error}>{error}</Text> : null}
            <Button title="Send code" onPress={() => sendCode('email')} disabled={!EMAIL.test(email.trim())} busy={busy} />
            <Button title="Use my mobile number" kind="outline" onPress={() => setStep('phone')} />
          </View>
        )}

        {step === 'code' && sent && (
          <View style={st.step}>
            <Text style={st.h}>Enter the code</Text>
            <Text style={st.lead}>We sent a 6-digit code to {sent.email || `+91 ${sent.phone?.replace(/^\+?91/, '')}`}.</Text>
            {sent.devCode ? <Text style={st.dev}>Test mode: your code is {sent.devCode}</Text> : null}
            <TextInput
              ref={codeInput} value={code} onChangeText={onCode} placeholder="••••••" placeholderTextColor={C.faint} autoFocus
              keyboardType="number-pad" autoComplete="sms-otp" textContentType="oneTimeCode" maxLength={6} style={[st.input, st.code]}
            />
            {error ? <Text style={st.error}>{error}</Text> : null}
            <Button title="Verify" onPress={() => verify(code)} disabled={code.length !== 6} busy={busy} />
            <Pressable onPress={() => wait <= 0 && sendCode(sent.email ? 'email' : 'phone')} disabled={wait > 0 || busy} style={{ alignSelf: 'center', padding: 8 }}>
              <Text style={[st.link, wait > 0 && { color: C.faint }]}>{wait > 0 ? `Send a new code in ${wait}s` : 'Send a new code'}</Text>
            </Pressable>
            <Pressable onPress={() => setStep(sent.email ? 'email' : 'phone')} style={{ alignSelf: 'center', padding: 4 }}>
              <Text style={st.link}>Change {sent.email ? 'email address' : 'number'}</Text>
            </Pressable>
          </View>
        )}

        {step === 'name' && (
          <View style={st.step}>
            <Text style={st.h}>What should we call you?</Text>
            <Text style={st.lead}>Your name goes on your orders, so our delivery partner knows who to ask for.</Text>
            <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={C.faint} autoFocus autoComplete="name" style={st.input} />
            {config?.referral && (
              <>
                <Text style={st.label}>Referral code (optional)</Text>
                <TextInput value={refCode} onChangeText={v => setRefCode(v.toUpperCase())} placeholder="e.g. RAHUL25" placeholderTextColor={C.faint} autoCapitalize="characters" style={st.input} />
              </>
            )}
            {error ? <Text style={st.error}>{error}</Text> : null}
            <Button title="Continue" onPress={saveName} disabled={name.trim().length < 2} busy={busy} />
          </View>
        )}
        <Text style={st.fine}>By continuing you agree to BiteVo’s Terms and Privacy Policy.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const st = StyleSheet.create({
  wrap: { padding: 22, gap: 18, flexGrow: 1 },
  logo: { width: 150, height: 55, alignSelf: 'center', marginTop: 8 },
  step: { gap: 12 },
  h: { fontSize: 22, fontWeight: '800', color: C.ink },
  lead: { fontSize: 14.5, color: C.muted, lineHeight: 21 },
  label: { fontSize: 13, fontWeight: '700', color: C.ink, marginTop: 4 },
  phone: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#DADADA', borderRadius: 12, height: 52, paddingHorizontal: 14, gap: 10 },
  cc: { fontSize: 16, fontWeight: '700', color: C.ink },
  phoneInput: { flex: 1, fontSize: 17, color: C.ink, letterSpacing: 0.5 },
  input: { borderWidth: 1.5, borderColor: '#DADADA', borderRadius: 12, height: 52, paddingHorizontal: 14, fontSize: 16, color: C.ink },
  code: { fontSize: 24, letterSpacing: 10, textAlign: 'center', fontWeight: '800' },
  dev: { backgroundColor: C.amberSoft, color: C.amber, padding: 10, borderRadius: 10, fontWeight: '700' },
  error: { color: C.red, fontSize: 14 },
  link: { color: C.red, fontWeight: '700', fontSize: 14 },
  fine: { fontSize: 12, color: C.faint, textAlign: 'center', marginTop: 'auto' },
});
